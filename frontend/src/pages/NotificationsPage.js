import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "../Sidebar";
import api from "../services/api";
import "./NotificationsPage.css";

const REFILL_KEYWORDS = [
  "wait for refill",
  "waiting for restock",
  "low stock",
  "please refill inventory",
];

const PROPOSAL_KEYWORDS = [
  "proposal approval requested",
  "proposal approved",
  "proposal requires edits",
  "proposal changes requested",
  "proposal rejected",
  "won approval requested",
  "won transition",
  "proposal",
];

const isRefillNotification = (item) => {
  const text = String(item?.message || "").toLowerCase();
  return REFILL_KEYWORDS.some((word) => text.includes(word));
};

const isProposalNotification = (item) => {
  const text = String(item?.message || "").toLowerCase();
  return PROPOSAL_KEYWORDS.some((word) => text.includes(word));
};

const isProposalApprovalRequest = (item) => String(item?.toStage || "").toLowerCase() === "proposal_approval_requested";
const isWonApprovalRequest = (item) => String(item?.toStage || "").toLowerCase() === "won_approval_requested";
const isManagerReviewRequest = (item) => isProposalApprovalRequest(item) || isWonApprovalRequest(item);

const isProposalEmployeeResponse = (item) => {
  const toStage = String(item?.toStage || "").toLowerCase();
  return [
    "proposal_approved",
    "proposal_changes_requested",
    "proposal_rejected",
  ].includes(toStage);
};

const isDealInNegotiateStage = (item) => String(item?.dealId?.stage || "").toLowerCase() === "negotiate";
const canApproveFromNotification = (item) => {
  return isManagerReviewRequest(item);
};

const formatStageLabel = (value = "") =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const formatRelativeTime = (value) => {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Just now";

  const diffMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
};

const getNotificationCategory = (item) => {
  if (isProposalNotification(item)) return "approvals";
  if (isRefillNotification(item) || item?.source === "activity") return "alerts";
  if (item?.leadId) return "leads";
  return "deals";
};

const getPriorityMeta = (item) => {
  if (item?.leadId) {
    return { tone: "lead", icon: "🟢", label: "Lead Update" };
  }

  if (isProposalNotification(item)) {
    return { tone: "approval", icon: "🟡", label: "Proposal Approval" };
  }
  if (isRefillNotification(item) || item?.source === "activity") {
    return { tone: "alert", icon: "🔴", label: item?.source === "activity" ? "Activity Alert" : "Deal Alert" };
  }
  return { tone: "deal", icon: "🔵", label: "Deal Movement" };
};

const parseRefillDetails = (message = "") => {
  const text = String(message || "");

  const product = text.match(/Product:\s*([^.]+)\./i)?.[1]?.trim() || "-";
  const requested = text.match(/Requested:\s*([^.]+)\./i)?.[1]?.trim() || "-";
  const available = text.match(/Available:\s*([^.]+)\./i)?.[1]?.trim() || "-";
  const customer = text.match(/Customer:\s*([^.]+)\./i)?.[1]?.trim() || "-";
  const company = text.match(/Company:\s*([^.]+)\./i)?.[1]?.trim() || "-";
  const email = text.match(/Email:\s*([^.]+)\./i)?.[1]?.trim() || "-";
  const phone = text.match(/Phone:\s*([^.]+)\./i)?.[1]?.trim() || "-";

  return { product, requested, available, customer, company, email, phone };
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = String(localStorage.getItem("role") || "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const isEmployee = role === "EMPLOYEE";
  const autoOpenHandledRef = useRef(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
  const [openProposalDetailsId, setOpenProposalDetailsId] = useState("");
  const [proposalReviewComments, setProposalReviewComments] = useState({});
  const [proposalDialogLoading, setProposalDialogLoading] = useState(false);
  const [proposalDialogError, setProposalDialogError] = useState("");
  const [proposalDialogData, setProposalDialogData] = useState(null);
  const [isProposalEditMode, setIsProposalEditMode] = useState(false);
  const [proposalDraftForm, setProposalDraftForm] = useState({
    title: "",
    introduction: "",
    problem: "",
    solution: "",
    scope: "",
    pricingNotes: "",
    terms: "",
    discountPercent: "0",
  });
  const [proposalDraftBaseline, setProposalDraftBaseline] = useState(null);
  const [activeFeedTab, setActiveFeedTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNotificationIds, setSelectedNotificationIds] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [assigneesLoading, setAssigneesLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const [dealRes, activityRes] = await Promise.all([
        api.get("/deals/notifications"),
        api.get("/activities/notifications", { params: { mode: "dashboard" } }),
      ]);

      const dealNotifications = Array.isArray(dealRes.data?.notifications)
        ? dealRes.data.notifications.map((item) => ({
            ...item,
            source: "deal",
          }))
        : [];

      const activityNotifications = Array.isArray(activityRes.data?.notifications)
        ? activityRes.data.notifications.map((item) => ({
            _id: item?.id || item?._id,
            source: "activity",
            isRead: false,
            message: item?.emailStatus || item?.title || "Activity reminder",
            title: item?.title || "Upcoming activity",
            activityType: item?.type || "activity",
            reminderTime: item?.reminderTime || "",
            relatedTo: item?.relatedTo || null,
            owner: item?.owner || null,
            createdAt: item?.reminderTime || new Date().toISOString(),
          }))
        : [];

      const mergedNotifications = [...activityNotifications, ...dealNotifications].sort((a, b) => {
        const left = new Date(a?.createdAt || a?.reminderTime || 0).getTime();
        const right = new Date(b?.createdAt || b?.reminderTime || 0).getTime();
        return right - left;
      });

      setNotifications(mergedNotifications);
    } catch (err) {
      console.error("Notifications page fetch error:", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!(isAdmin || isManager)) {
      setAssignableUsers([]);
      setSelectedAssigneeId("");
      return;
    }

    const fetchAssignableUsers = async () => {
      try {
        setAssigneesLoading(true);
        const res = await api.get("/deals/notifications/assignees");
        setAssignableUsers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Notification assignees fetch error:", err);
        setAssignableUsers([]);
      } finally {
        setAssigneesLoading(false);
      }
    };

    fetchAssignableUsers();
  }, [isAdmin, isManager]);

  useEffect(() => {
    setSelectedNotificationIds((prev) =>
      prev.filter((id) => notifications.some((item) => String(item?._id || "") === String(id || "")))
    );
  }, [notifications]);

  const unreadCount = notifications.filter((item) => !item?.isRead).length;
  const readCount = notifications.length - unreadCount;
  const categoryCounts = useMemo(() => {
    const counts = {
      all: notifications.length,
      unread: 0,
      approvals: 0,
      deals: 0,
      leads: 0,
      alerts: 0,
    };

    notifications.forEach((item) => {
      if (!item?.isRead) counts.unread += 1;
      const category = getNotificationCategory(item);
      if (category in counts) {
        counts[category] += 1;
      }
    });

    return counts;
  }, [notifications]);

  const visibleNotifications = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return notifications.filter((item) => {
      if (activeFeedTab === "unread" && item?.isRead) return false;

      if (["approvals", "deals", "leads", "alerts"].includes(activeFeedTab)) {
        const category = getNotificationCategory(item);
        if (category !== activeFeedTab) return false;
      }

      if (!normalizedSearch) return true;

      const haystack = [
        item?.dealId?.name,
        item?.title,
        item?.message,
        item?.toStage,
        item?.changedByName,
        item?.activityType,
        item?.relatedTo?.recordName,
        item?.relatedTo?.recordType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [activeFeedTab, notifications, searchTerm]);

  const feedItems = useMemo(() => {
    const groupedKeys = new Set();
    const rows = [];

    visibleNotifications.forEach((item) => {
      const canGroup =
        item?.source === "deal" &&
        !item?.leadId &&
        !isProposalNotification(item) &&
        !isRefillNotification(item);

      if (!canGroup) {
        rows.push({ type: "single", key: `single-${item._id}`, item });
        return;
      }

      const dealKey = String(item?.dealId?._id || item?.dealId || item?.leadId?._id || item?.leadId || "");
      if (!dealKey || groupedKeys.has(dealKey)) {
        return;
      }

      groupedKeys.add(dealKey);
      const updates = visibleNotifications.filter((candidate) => {
        const candidateDealKey = String(candidate?.dealId?._id || candidate?.dealId || "");
        return (
          candidate?.source === "deal" &&
          !candidate?.leadId &&
          !isProposalNotification(candidate) &&
          !isRefillNotification(candidate) &&
          candidateDealKey === dealKey
        );
      });

      if (updates.length <= 1) {
        rows.push({ type: "single", key: `single-${item._id}`, item });
        return;
      }

      rows.push({
        type: "group",
        key: `group-${dealKey}`,
        dealId: dealKey,
        dealName: updates[0]?.dealId?.name || "Deal Update",
        updates,
        isRead: updates.every((entry) => entry?.isRead),
      });
    });

    return rows;
  }, [visibleNotifications]);

  const visibleDealNotificationIds = useMemo(() => {
    const ids = [];
    feedItems.forEach((entry) => {
      if (entry.type === "group") {
        entry.updates.forEach((update) => {
          const id = String(update?._id || "").trim();
          if (id) ids.push(id);
        });
        return;
      }

      const id = String(entry?.item?._id || "").trim();
      if (entry?.item?.source === "deal" && id) {
        ids.push(id);
      }
    });
    return Array.from(new Set(ids));
  }, [feedItems]);

  const selectedSet = useMemo(() => new Set(selectedNotificationIds), [selectedNotificationIds]);
  const selectedCount = selectedNotificationIds.length;
  const allVisibleSelected =
    visibleDealNotificationIds.length > 0 && visibleDealNotificationIds.every((id) => selectedSet.has(id));

  const selectedProposalNotification = useMemo(
    () => notifications.find((item) => String(item?._id || "") === String(openProposalDetailsId || "")) || null,
    [notifications, openProposalDetailsId]
  );

  const markSingleAsRead = useCallback(async (id) => {
    if (!id) return;
    try {
      const target = notifications.find((item) => String(item._id) === String(id));
      if (!target || (target.source !== "deal" && !target?.leadId)) {
        setNotifications((prev) =>
          prev.map((item) => (String(item._id) === String(id) ? { ...item, isRead: true } : item))
        );
        return;
      }

      await api.patch(`/deals/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((item) => (String(item._id) === String(id) ? { ...item, isRead: true } : item))
      );
    } catch (err) {
      console.error("Notification mark read error:", err);
    }
  }, [notifications]);

  const markAllAsRead = async () => {
    const unreadDealIds = notifications
      .filter((item) => (item?.source === "deal" || item?.leadId) && !item?.isRead)
      .map((item) => item._id);
    const hasUnreadActivity = notifications.some((item) => item?.source === "activity" && !item?.isRead);
    if (!unreadDealIds.length && !hasUnreadActivity) return;

    try {
      setActionLoadingId("all");
      if (unreadDealIds.length) {
        await api.patch(`/deals/notifications/${unreadDealIds.join(",")}/read`, {});
      }
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch (err) {
      console.error("Notification mark all read error:", err);
    } finally {
      setActionLoadingId("");
    }
  };

  const openVendorsForPurchase = async (notification) => {
    const details = parseRefillDetails(notification?.message || "");
    if (notification?._id && !notification?.isRead) {
      await markSingleAsRead(notification._id);
    }

    navigate("/vendors", {
      state: {
        fromNotifications: true,
        purchaseIntent: {
          dealId: notification?.dealId?._id || notification?.dealId || "",
          dealName: notification?.dealId?.name || "",
          ...details,
        },
      },
    });
  };

  const openProposalDetailsDialog = useCallback(async (notification) => {
    const notificationId = String(notification?._id || "").trim();
    if (!notificationId) return;

    const dealId = String(notification?.dealId?._id || notification?.dealId || "").trim();
    if (!dealId) return;

    setOpenProposalDetailsId(notificationId);
    setProposalDialogLoading(true);
    setProposalDialogError("");
    setProposalDialogData(null);
    if (!proposalReviewComments[notificationId]) {
      setProposalReviewComments((prev) => ({
        ...prev,
        [notificationId]: "",
      }));
    }

    if (!notification?.isRead) {
      await markSingleAsRead(notificationId);
    }

    try {
      const res = await api.get(`/deals/${dealId}/proposal-workspace`);
      const payload = res.data || null;
      const draft = payload?.deal?.proposalDraft || {};
      const draftForm = {
        title: String(draft.title || `${payload?.deal?.name || notification?.dealId?.name || "Deal"} Proposal`),
        introduction: String(draft.introduction || ""),
        problem: String(draft.problem || ""),
        solution: String(draft.solution || ""),
        scope: String(draft.scope || ""),
        pricingNotes: String(draft.pricingNotes || ""),
        terms: String(draft.terms || ""),
        discountPercent: String(Number(draft.discountPercent || 0)),
      };
      setProposalDialogData(payload);
      setProposalDraftForm(draftForm);
      setProposalDraftBaseline(draftForm);
      setIsProposalEditMode(false);
    } catch (err) {
      setProposalDialogError(err.response?.data?.message || "Failed to load proposal details.");
    } finally {
      setProposalDialogLoading(false);
    }
  }, [markSingleAsRead, proposalReviewComments]);

  useEffect(() => {
    if (autoOpenHandledRef.current || loading || !notifications.length) return;

    const autoOpenStage = String(searchParams.get("autopen") || "").trim().toLowerCase();
    const autoOpenDealId = String(searchParams.get("dealId") || "").trim();
    if (!autoOpenStage || !autoOpenDealId) return;

    const target = notifications.find((item) => {
      const itemDealId = String(item?.dealId?._id || item?.dealId || "").trim();
      const itemStage = String(item?.toStage || "").trim().toLowerCase();
      return item?.source === "deal" && itemDealId === autoOpenDealId && itemStage === autoOpenStage;
    });

    autoOpenHandledRef.current = true;
    if (target) {
      openProposalDetailsDialog(target);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("autopen");
    setSearchParams(nextParams, { replace: true });
  }, [loading, notifications, openProposalDetailsDialog, searchParams, setSearchParams]);

  const handleManagerSaveEdit = async (notification) => {
    const dealId = String(notification?.dealId?._id || notification?.dealId || "").trim();
    if (!dealId) return;
    if (!isProposalEditMode) {
      window.alert("Click Enable Edit first, then modify fields and save.");
      return;
    }

    const normalizeDraft = (draft) => ({
      title: String(draft?.title || "").trim(),
      introduction: String(draft?.introduction || "").trim(),
      problem: String(draft?.problem || "").trim(),
      solution: String(draft?.solution || "").trim(),
      scope: String(draft?.scope || "").trim(),
      pricingNotes: String(draft?.pricingNotes || "").trim(),
      terms: String(draft?.terms || "").trim(),
      discountPercent: Number(draft?.discountPercent || 0).toFixed(2),
    });

    const hasChanges =
      JSON.stringify(normalizeDraft(proposalDraftForm)) !== JSON.stringify(normalizeDraft(proposalDraftBaseline));
    if (!hasChanges) {
      window.alert("No changes found. Update any field, then click Edit & Save.");
      return;
    }

    try {
      setActionLoadingId(`${notification._id}:save_edit`);
      await api.post(`/deals/${dealId}/proposal-draft`, {
        title: proposalDraftForm.title,
        introduction: proposalDraftForm.introduction,
        problem: proposalDraftForm.problem,
        solution: proposalDraftForm.solution,
        scope: proposalDraftForm.scope,
        pricingNotes: proposalDraftForm.pricingNotes,
        terms: proposalDraftForm.terms,
        discountPercent: Number(proposalDraftForm.discountPercent || 0),
      });

      const refreshed = await api.get(`/deals/${dealId}/proposal-workspace`);
      const refreshedPayload = refreshed.data || null;
      const refreshedDraft = refreshedPayload?.deal?.proposalDraft || {};
      const refreshedForm = {
        title: String(refreshedDraft.title || `${refreshedPayload?.deal?.name || "Deal"} Proposal`),
        introduction: String(refreshedDraft.introduction || ""),
        problem: String(refreshedDraft.problem || ""),
        solution: String(refreshedDraft.solution || ""),
        scope: String(refreshedDraft.scope || ""),
        pricingNotes: String(refreshedDraft.pricingNotes || ""),
        terms: String(refreshedDraft.terms || ""),
        discountPercent: String(Number(refreshedDraft.discountPercent || 0)),
      };
      setProposalDialogData(refreshedPayload);
      setProposalDraftForm(refreshedForm);
      setProposalDraftBaseline(refreshedForm);
      setIsProposalEditMode(false);
      window.alert("Edits saved successfully. You can now approve and notify employee.");
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to save proposal edits.");
    } finally {
      setActionLoadingId("");
    }
  };

  const closeProposalDetailsDialog = () => {
    setOpenProposalDetailsId("");
    setProposalDialogData(null);
    setProposalDialogError("");
    setProposalDialogLoading(false);
    setIsProposalEditMode(false);
    setProposalDraftBaseline(null);
  };

  const handleManagerProposalAction = async (notification, action) => {
    const dealId = String(notification?.dealId?._id || notification?.dealId || "").trim();
    if (!dealId) return;

    if (!isManager) {
      window.alert("Only managers can perform this action.");
      return;
    }

    try {
      setActionLoadingId(`${notification._id}:${action}`);
      const notificationId = String(notification?._id || "").trim();
      const comment = String(proposalReviewComments[notificationId] || "").trim();
      const isWonReview = isWonApprovalRequest(notification);
      const isProposalReview = isProposalApprovalRequest(notification);
      const isReviewRequest = isManagerReviewRequest(notification);
      const normalizeDraft = (draft) => ({
        title: String(draft?.title || "").trim(),
        introduction: String(draft?.introduction || "").trim(),
        problem: String(draft?.problem || "").trim(),
        solution: String(draft?.solution || "").trim(),
        scope: String(draft?.scope || "").trim(),
        pricingNotes: String(draft?.pricingNotes || "").trim(),
        terms: String(draft?.terms || "").trim(),
        discountPercent: Number(draft?.discountPercent || 0).toFixed(2),
      });

      const hasUnsavedChanges =
        isReviewRequest &&
        proposalDraftBaseline &&
        JSON.stringify(normalizeDraft(proposalDraftForm)) !== JSON.stringify(normalizeDraft(proposalDraftBaseline));

      if (action === "approve" && hasUnsavedChanges) {
        window.alert("You have unsaved edits. Click Edit & Save first, then approve. Or revert edits for direct approve.");
        return;
      }

      const directWonApproval = action === "approve" && isManagerReviewRequest(notification);
      const endpoint = isWonReview || directWonApproval
        ? `/deals/${dealId}/won-approval`
        : isProposalReview
          ? `/deals/${dealId}/proposal-approval`
          : `/deals/${dealId}/won-approval`;
      await api.post(endpoint, {
        action,
        comment,
      });
      if (notification?._id && !notification?.isRead) {
        await markSingleAsRead(notification._id);
      }
      setOpenProposalDetailsId("");
      await fetchNotifications();
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to update proposal.");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleSaveToQuotation = async (notification) => {
    const dealId = String(notification?.dealId?._id || notification?.dealId || "").trim();
    if (!dealId) return;

    try {
      setActionLoadingId(`${notification._id}:save_to_quotation`);
      await api.post(`/deals/${dealId}/proposal-save-quotation`, {});
      if (notification?._id && !notification?.isRead) {
        await markSingleAsRead(notification._id);
      }
      await fetchNotifications();
      navigate(`/quotations?dealId=${encodeURIComponent(dealId)}`);
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to save proposal to quotation.");
    } finally {
      setActionLoadingId("");
    }
  };

  const markGroupAsRead = async (updates = []) => {
    const unreadDealIds = updates
      .filter((entry) => entry?.source === "deal" && !entry?.isRead)
      .map((entry) => entry?._id)
      .filter(Boolean);

    if (!unreadDealIds.length) return;

    try {
      await api.patch(`/deals/notifications/${unreadDealIds.join(",")}/read`, {});
      setNotifications((prev) =>
        prev.map((entry) =>
          unreadDealIds.includes(entry?._id)
            ? {
                ...entry,
                isRead: true,
              }
            : entry
        )
      );
    } catch (err) {
      console.error("Notification mark group read error:", err);
    }
  };

  const toggleSingleSelection = (notificationId, checked) => {
    const id = String(notificationId || "").trim();
    if (!id) return;

    setSelectedNotificationIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return Array.from(next);
    });
  };

  const toggleGroupSelection = (updates = [], checked) => {
    const ids = updates
      .map((entry) => String(entry?._id || "").trim())
      .filter(Boolean);
    if (!ids.length) return;

    setSelectedNotificationIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return Array.from(next);
    });
  };

  const toggleSelectAllVisible = (checked) => {
    setSelectedNotificationIds((prev) => {
      const next = new Set(prev);
      visibleDealNotificationIds.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return Array.from(next);
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedNotificationIds.length) return;
    try {
      setActionLoadingId("bulk-delete");
      await api.delete("/deals/notifications/bulk", {
        data: {
          ids: selectedNotificationIds,
        },
      });
      setNotifications((prev) =>
        prev.filter((entry) => !selectedSet.has(String(entry?._id || "")))
      );
      setSelectedNotificationIds([]);
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to delete selected notifications.");
    } finally {
      setActionLoadingId("");
    }
  };

  const handleBulkAssign = async () => {
    if (!selectedNotificationIds.length) return;
    if (!selectedAssigneeId) {
      window.alert("Select an assignee first.");
      return;
    }

    try {
      setActionLoadingId("bulk-assign");
      await api.patch("/deals/notifications/bulk/assign", {
        ids: selectedNotificationIds,
        assigneeId: selectedAssigneeId,
      });
      setSelectedNotificationIds([]);
      await fetchNotifications();
    } catch (err) {
      window.alert(err.response?.data?.message || "Failed to assign selected notifications.");
    } finally {
      setActionLoadingId("");
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="notifications-page">
          <div className="notifications-page-header">
            <div className="notifications-page-header-text">
              <h1>
                Notifications <span className="notifications-title-accent">Center</span>
              </h1>
              <p>Live CRM feed for approvals, deal movement, and operational alerts.</p>
            </div>

            <div className="notifications-summary">
              <div className="notifications-summary-card">
                <span className="notifications-summary-label">Total</span>
                <strong>{notifications.length}</strong>
              </div>
              <div className="notifications-summary-card unread">
                <span className="notifications-summary-label">Unread</span>
                <strong>{unreadCount}</strong>
              </div>
              <div className="notifications-summary-card read">
                <span className="notifications-summary-label">Read</span>
                <strong>{readCount}</strong>
              </div>
            </div>

            <div className="notifications-page-actions">
              <button
                type="button"
                className="notifications-btn"
                onClick={markAllAsRead}
                disabled={actionLoadingId === "all" || unreadCount === 0}
              >
                {actionLoadingId === "all" ? "Marking..." : `Mark all read (${unreadCount})`}
              </button>
              <button
                type="button"
                className="notifications-btn secondary"
                onClick={handleBulkDelete}
                disabled={selectedCount === 0 || actionLoadingId === "bulk-delete"}
              >
                {actionLoadingId === "bulk-delete" ? "Deleting..." : `Delete (${selectedCount})`}
              </button>
              {(isAdmin || isManager) ? (
                <label className="notifications-assign-wrap" htmlFor="notifications-bulk-assignee">
                  <select
                    id="notifications-bulk-assignee"
                    className="notifications-assignee-select"
                    value={selectedAssigneeId}
                    onChange={(event) => setSelectedAssigneeId(event.target.value)}
                    disabled={assigneesLoading}
                  >
                    <option value="">Assign to...</option>
                    {assignableUsers.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.name || user.username || user.email || "User"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="notifications-btn secondary"
                onClick={handleBulkAssign}
                disabled={
                  !(isAdmin || isManager) ||
                  !selectedAssigneeId ||
                  selectedCount === 0 ||
                  actionLoadingId === "bulk-assign"
                }
              >
                {actionLoadingId === "bulk-assign" ? "Assigning..." : `Assign (${selectedCount})`}
              </button>
              <button
                type="button"
                className="notifications-btn secondary"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </button>
            </div>
          </div>

          <div className="notifications-toolbar" role="region" aria-label="Notification filters">
            <div className="notifications-filter-group" role="tablist" aria-label="Filter notifications">
              <button
                type="button"
                className={`notifications-filter-btn ${activeFeedTab === "all" ? "active" : ""}`}
                onClick={() => setActiveFeedTab("all")}
              >
                All <span className="count">{categoryCounts.all}</span>
              </button>
              <button
                type="button"
                className={`notifications-filter-btn ${activeFeedTab === "unread" ? "active" : ""}`}
                onClick={() => setActiveFeedTab("unread")}
              >
                Unread <span className="count">{categoryCounts.unread}</span>
              </button>
              <button
                type="button"
                className={`notifications-filter-btn ${activeFeedTab === "approvals" ? "active" : ""}`}
                onClick={() => setActiveFeedTab("approvals")}
              >
                Approvals <span className="count">{categoryCounts.approvals}</span>
              </button>
              <button
                type="button"
                className={`notifications-filter-btn ${activeFeedTab === "deals" ? "active" : ""}`}
                onClick={() => setActiveFeedTab("deals")}
              >
                Deals <span className="count">{categoryCounts.deals}</span>
              </button>
              <button
                type="button"
                className={`notifications-filter-btn ${activeFeedTab === "leads" ? "active" : ""}`}
                onClick={() => setActiveFeedTab("leads")}
              >
                Leads <span className="count">{categoryCounts.leads}</span>
              </button>
              <button
                type="button"
                className={`notifications-filter-btn ${activeFeedTab === "alerts" ? "active" : ""}`}
                onClick={() => setActiveFeedTab("alerts")}
              >
                Alerts <span className="count">{categoryCounts.alerts}</span>
              </button>
            </div>

            <div className="notifications-toolbar-right">
              <label className="notifications-search-wrap" htmlFor="notifications-search">
                <input
                  id="notifications-search"
                  type="search"
                  className="notifications-search"
                  placeholder="Search by deal, message, type, or user"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>
              <span className="notifications-results" aria-live="polite">
                Showing {feedItems.length}
              </span>
              <label className="notifications-select-all" htmlFor="notifications-select-all">
                <input
                  id="notifications-select-all"
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                  disabled={visibleDealNotificationIds.length === 0}
                />
                Select visible ({visibleDealNotificationIds.length})
              </label>
            </div>
          </div>

          {loading ? (
            <div className="notifications-empty-card">Loading notifications...</div>
          ) : feedItems.length === 0 ? (
            <div className="notifications-empty-card">
              No notifications match this view. Try changing filters or search text.
            </div>
          ) : (
            <div className="notifications-feed" role="list" aria-label="Notifications feed">
              {feedItems.map((entry, index) => {
                if (entry.type === "group") {
                  const latest = entry.updates[0] || null;
                  if (!latest) return null;
                  const meta = getPriorityMeta(latest);
                  const hasNew = Date.now() - new Date(latest?.createdAt || 0).getTime() <= 5 * 60 * 1000;
                  const groupIds = entry.updates
                    .map((update) => String(update?._id || "").trim())
                    .filter(Boolean);
                  const isGroupSelected = groupIds.length > 0 && groupIds.every((id) => selectedSet.has(id));
                  return (
                    <article
                      key={entry.key}
                      role="listitem"
                      className={`notification-row notification-row-group ${entry.isRead ? "read" : "unread"} tone-${meta.tone}`}
                      style={{ animationDelay: `${Math.min(index * 35, 320)}ms` }}
                    >
                      <label className="notification-select-box" htmlFor={`notification-group-${entry.key}`}>
                        <input
                          id={`notification-group-${entry.key}`}
                          type="checkbox"
                          checked={isGroupSelected}
                          onChange={(event) => toggleGroupSelection(entry.updates, event.target.checked)}
                        />
                      </label>
                      <div className="notification-row-main">
                        <div className="notification-row-title-wrap">
                          <span className="notification-row-icon" aria-hidden="true">{meta.icon}</span>
                          <div>
                            <p className="notification-row-title">
                              {entry.dealName} ({entry.updates.length} updates)
                            </p>
                            <p className="notification-row-meta">
                              👤 {latest?.changedByName || "System"} • ⏱ {formatRelativeTime(latest?.createdAt)}
                              {hasNew ? <span className="notification-live-pill">New</span> : null}
                            </p>
                          </div>
                        </div>

                        <div className="notification-group-preview" aria-label="Grouped updates preview">
                          {entry.updates.slice(0, 3).map((update) => (
                            <p key={update._id} className="notification-group-line">
                              • {formatStageLabel(update?.toStage || "status updated")}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="notification-row-actions">
                        <button
                          type="button"
                          className="notifications-btn secondary compact"
                          onClick={() => markGroupAsRead(entry.updates)}
                          disabled={entry.isRead}
                        >
                          {entry.isRead ? "Read" : "Mark Read"}
                        </button>
                      </div>
                    </article>
                  );
                }

                const item = entry.item;
                const refillType = isRefillNotification(item);
                const activityType = item?.source === "activity";
                const proposalType = !activityType && isProposalNotification(item);
                const proposalResponseForEmployee = proposalType && isProposalEmployeeResponse(item);
                const canApprove = canApproveFromNotification(item);
                const details = refillType ? parseRefillDetails(item?.message || "") : null;
                const priorityMeta = getPriorityMeta(item);
                const relativeTime = formatRelativeTime(item?.createdAt);
                const hasNew = Date.now() - new Date(item?.createdAt || 0).getTime() <= 5 * 60 * 1000;
                const itemId = String(item?._id || "").trim();
                const selectable = item?.source === "deal" && Boolean(itemId);
                const isSelected = selectable && selectedSet.has(itemId);
                return (
                  <article
                    key={entry.key}
                    role="listitem"
                    className={`notification-row ${item?.isRead ? "read" : "unread"} tone-${priorityMeta.tone}`}
                    style={{ animationDelay: `${Math.min(index * 35, 320)}ms` }}
                  >
                    <label className="notification-select-box" htmlFor={`notification-${itemId || entry.key}`}>
                      <input
                        id={`notification-${itemId || entry.key}`}
                        type="checkbox"
                        checked={Boolean(isSelected)}
                        onChange={(event) => toggleSingleSelection(itemId, event.target.checked)}
                        disabled={!selectable}
                      />
                    </label>
                    <div className="notification-row-main">
                      <div className="notification-row-title-wrap">
                        <span className="notification-row-icon" aria-hidden="true">{priorityMeta.icon}</span>
                        <div>
                          <p className="notification-row-title">
                            {activityType
                              ? item?.title || "Activity Reminder"
                              : item?.dealId?.name || "Deal Alert"}
                          </p>
                          <p className="notification-row-meta">
                            {priorityMeta.label} • 👤 {item?.changedByName || item?.owner?.name || "System"} • ⏱ {relativeTime}
                            {hasNew ? <span className="notification-live-pill">New</span> : null}
                          </p>
                        </div>
                      </div>

                      <p className="notification-row-message">
                        {activityType
                          ? `📌 ${formatStageLabel(item?.activityType || "activity")} • ${item?.relatedTo?.recordName || "No record"}`
                          : refillType
                          ? `📦 ${details?.product || "Product"} • Requested ${details?.requested || "-"} • Available ${details?.available || "-"}`
                          : proposalType
                          ? `📊 ${formatStageLabel(item?.toStage || "proposal")} • ₹${Number(item?.dealId?.amount || 0).toLocaleString("en-IN")}`
                          : `📊 ${formatStageLabel(item?.toStage || "deal updated")}`}
                      </p>
                    </div>

                    <div className="notification-row-actions">
                      {!activityType && !proposalType && (
                        <button
                          type="button"
                          className="notifications-btn secondary compact"
                          onClick={() => {
                            const dealId = String(item?.dealId?._id || item?.dealId || "");
                            if (dealId) {
                              navigate(`/deals?dealId=${encodeURIComponent(dealId)}`);
                            }
                          }}
                        >
                          View
                        </button>
                      )}
                      {refillType ? (
                        <button
                          type="button"
                          className="notifications-btn compact"
                          onClick={() => openVendorsForPurchase(item)}
                        >
                          Resolve
                        </button>
                      ) : null}
                      {proposalType ? (
                        <button
                          type="button"
                          className="notifications-btn compact"
                          onClick={() => openProposalDetailsDialog(item)}
                        >
                          {isManagerReviewRequest(item) && canApprove ? "Approve" : "View"}
                        </button>
                      ) : null}
                      {isEmployee && proposalResponseForEmployee ? (
                        <button
                          type="button"
                          className="notifications-btn compact"
                          onClick={() => handleSaveToQuotation(item)}
                          disabled={actionLoadingId === `${item._id}:save_to_quotation`}
                        >
                          {actionLoadingId === `${item._id}:save_to_quotation` ? "Saving..." : "Save To Quotation"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="notifications-btn secondary compact"
                        onClick={() => markSingleAsRead(item._id)}
                        disabled={Boolean(item?.isRead)}
                      >
                        {item?.isRead ? "Read" : "Mark as read"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {selectedProposalNotification ? (
            <div className="proposal-dialog" role="dialog" aria-modal="true" aria-label="Proposal details">
              <div className="proposal-dialog-backdrop" onClick={closeProposalDetailsDialog} />
              <div className="proposal-dialog-panel">
                <div className="proposal-dialog-header">
                  <h2>Proposal Details</h2>
                  <button type="button" className="proposal-dialog-close" onClick={closeProposalDetailsDialog}>
                    ×
                  </button>
                </div>

                {proposalDialogError ? <div className="notifications-empty-card">{proposalDialogError}</div> : null}
                {proposalDialogLoading ? <div className="notifications-empty-card">Loading proposal details...</div> : null}

                <div className="proposal-dialog-form-grid">
                  <label>
                    <span>Proposal Title</span>
                    <input
                      type="text"
                      value={
                        isManager && isManagerReviewRequest(selectedProposalNotification)
                          ? proposalDraftForm.title
                          : String(
                              proposalDialogData?.deal?.proposalDraft?.title ||
                                `${selectedProposalNotification?.dealId?.name || "Deal"} Proposal`
                            )
                      }
                      readOnly={!(isManager && isManagerReviewRequest(selectedProposalNotification) && isProposalEditMode)}
                      onChange={(event) =>
                        setProposalDraftForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Deal Name</span>
                    <input
                      type="text"
                      value={proposalDialogData?.deal?.name || selectedProposalNotification?.dealId?.name || "-"}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Company</span>
                    <input
                      type="text"
                      value={proposalDialogData?.deal?.company || selectedProposalNotification?.dealId?.company || "-"}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Amount</span>
                    <input
                      type="text"
                      value={
                        Number(proposalDialogData?.deal?.amount ?? selectedProposalNotification?.dealId?.amount ?? 0)
                          ? `Rs.${Number(proposalDialogData?.deal?.amount ?? selectedProposalNotification?.dealId?.amount ?? 0).toLocaleString("en-IN")}`
                          : "-"
                      }
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Stage</span>
                    <input
                      type="text"
                      value={String(proposalDialogData?.deal?.stage || selectedProposalNotification?.dealId?.stage || "-").replaceAll("_", " ")}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Contact</span>
                    <input type="text" value={proposalDialogData?.deal?.contact || "-"} readOnly />
                  </label>
                  <label>
                    <span>Email</span>
                    <input type="text" value={proposalDialogData?.deal?.email || "-"} readOnly />
                  </label>
                  <label>
                    <span>Product</span>
                    <input type="text" value={proposalDialogData?.deal?.product?.name || "-"} readOnly />
                  </label>
                  <label>
                    <span>Quantity</span>
                    <input type="text" value={proposalDialogData?.deal?.quantity ?? "-"} readOnly />
                  </label>
                  <label>
                    <span>Workflow</span>
                    <input
                      type="text"
                      value={String(selectedProposalNotification?.toStage || "proposal").replaceAll("_", " ")}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Updated By</span>
                    <input type="text" value={selectedProposalNotification?.changedByName || "System"} readOnly />
                  </label>
                  <label className="full-width">
                    <span>Notification Message</span>
                    <textarea value={selectedProposalNotification?.message || ""} rows={3} readOnly />
                  </label>
                  {isManager && isManagerReviewRequest(selectedProposalNotification) ? (
                    <label className="full-width">
                      <span>Manager Comment</span>
                      <textarea
                        rows={4}
                        value={proposalReviewComments[String(selectedProposalNotification?._id || "")] || ""}
                        onChange={(event) => {
                          const notificationId = String(selectedProposalNotification?._id || "");
                          setProposalReviewComments((prev) => ({
                            ...prev,
                            [notificationId]: event.target.value,
                          }));
                        }}
                        placeholder="Write comment for employee (optional)"
                      />
                    </label>
                  ) : null}
                  <label className="full-width">
                    <span>Pricing Notes</span>
                    <textarea
                      value={
                        isManager && isManagerReviewRequest(selectedProposalNotification)
                          ? proposalDraftForm.pricingNotes
                          : proposalDialogData?.deal?.proposalDraft?.pricingNotes || "-"
                      }
                      rows={2}
                      readOnly={!(isManager && isManagerReviewRequest(selectedProposalNotification) && isProposalEditMode)}
                      onChange={(event) =>
                        setProposalDraftForm((prev) => ({ ...prev, pricingNotes: event.target.value }))
                      }
                    />
                  </label>
                  <label className="full-width">
                    <span>Terms</span>
                    <textarea
                      value={
                        isManager && isManagerReviewRequest(selectedProposalNotification)
                          ? proposalDraftForm.terms
                          : proposalDialogData?.deal?.proposalDraft?.terms || "-"
                      }
                      rows={2}
                      readOnly={!(isManager && isManagerReviewRequest(selectedProposalNotification) && isProposalEditMode)}
                      onChange={(event) =>
                        setProposalDraftForm((prev) => ({ ...prev, terms: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Taxable Amount</span>
                    <input
                      type="text"
                      value={`Rs.${Number(proposalDialogData?.taxSummary?.taxableAmount || 0).toLocaleString("en-IN")}`}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>GST Amount</span>
                    <input
                      type="text"
                      value={`Rs.${Number(proposalDialogData?.taxSummary?.gstAmount || 0).toLocaleString("en-IN")}`}
                      readOnly
                    />
                  </label>
                  <label>
                    <span>Discount (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={proposalDraftForm.discountPercent}
                      onChange={(event) => {
                        const raw = String(event.target.value || "").trim();
                        if (!/^\d*(\.\d{0,2})?$/.test(raw) && raw !== "") return;
                        const numeric = Number(raw || 0);
                        if (numeric < 0 || numeric > 100) return;
                        setProposalDraftForm((prev) => ({
                          ...prev,
                          discountPercent: raw,
                        }));
                      }}
                      readOnly={!(isManager && isManagerReviewRequest(selectedProposalNotification) && isProposalEditMode)}
                    />
                  </label>
                  <label>
                    <span>Grand Total</span>
                    <input
                      type="text"
                      value={`Rs.${(() => {
                        const base = Number(
                          proposalDialogData?.taxSummary?.grandTotal || proposalDialogData?.deal?.amount || 0
                        );
                        const pct = Math.min(100, Math.max(0, Number(proposalDraftForm.discountPercent || 0)));
                        const total = base - (base * pct) / 100;
                        return Number.isFinite(total) ? total.toLocaleString("en-IN") : "0";
                      })()}`}
                      readOnly
                    />
                  </label>
                </div>

                <div className="proposal-dialog-actions">
                  <button type="button" className="notifications-btn secondary" onClick={closeProposalDetailsDialog}>
                    Close
                  </button>
                  {isManager && isManagerReviewRequest(selectedProposalNotification) ? (
                    <>
                      <button
                        type="button"
                        className="notifications-btn secondary"
                        onClick={() => {
                          if (isProposalEditMode && proposalDraftBaseline) {
                            setProposalDraftForm(proposalDraftBaseline);
                          }
                          setIsProposalEditMode((prev) => !prev);
                        }}
                        disabled={proposalDialogLoading || !proposalDialogData}
                      >
                        {isProposalEditMode ? "Cancel Edit" : "Enable Edit"}
                      </button>
                      <button
                        type="button"
                        className="notifications-btn secondary"
                        onClick={() => handleManagerSaveEdit(selectedProposalNotification)}
                        disabled={
                          !isProposalEditMode ||
                          proposalDialogLoading ||
                          !proposalDialogData ||
                          actionLoadingId === `${selectedProposalNotification._id}:save_edit`
                        }
                      >
                        {actionLoadingId === `${selectedProposalNotification._id}:save_edit` ? "Saving..." : "Edit & Save"}
                      </button>
                      <button
                        type="button"
                        className="notifications-btn"
                        onClick={() => handleManagerProposalAction(selectedProposalNotification, "approve")}
                        disabled={
                          proposalDialogLoading ||
                          !proposalDialogData ||
                          !canApproveFromNotification(selectedProposalNotification) ||
                          actionLoadingId === `${selectedProposalNotification._id}:approve`
                        }
                      >
                        {actionLoadingId === `${selectedProposalNotification._id}:approve` ? "Approving..." : "Approve"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
