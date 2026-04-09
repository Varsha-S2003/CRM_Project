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

const getNotificationPill = (item) => {
  if (item?.source === "activity") return "Activity Reminder";
  if (isRefillNotification(item)) return "Need Analysis";
  if (isProposalNotification(item)) return "Proposal Approval";
  return "General";
};

const parseRefillDetails = (message = "") => {
  const text = String(message || "");

  const product = text.match(/Product:\s*([^\.]+)\./i)?.[1]?.trim() || "-";
  const requested = text.match(/Requested:\s*([^\.]+)\./i)?.[1]?.trim() || "-";
  const available = text.match(/Available:\s*([^\.]+)\./i)?.[1]?.trim() || "-";
  const customer = text.match(/Customer:\s*([^\.]+)\./i)?.[1]?.trim() || "-";
  const company = text.match(/Company:\s*([^\.]+)\./i)?.[1]?.trim() || "-";
  const email = text.match(/Email:\s*([^\.]+)\./i)?.[1]?.trim() || "-";
  const phone = text.match(/Phone:\s*([^\.]+)\./i)?.[1]?.trim() || "-";

  return { product, requested, available, customer, company, email, phone };
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = String(localStorage.getItem("role") || "").toUpperCase();
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDeal, setSelectedDeal] = useState("");

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

  const unreadCount = notifications.filter((item) => !item?.isRead).length;
  const readCount = notifications.length - unreadCount;
  const dealOptions = useMemo(() => {
    const counters = new Map();

    notifications.forEach((item) => {
      if (item?.source !== "deal") return;
      const dealKey = String(item?.dealId?._id || item?.dealId || "");
      const dealName = String(item?.dealId?.name || "Deal Alert").trim();
      if (!dealKey) return;

      const existing = counters.get(dealKey) || { key: dealKey, name: dealName, count: 0 };
      existing.count += 1;
      counters.set(dealKey, existing);
    });

    return Array.from(counters.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [notifications]);

  const selectedDealMeta = useMemo(
    () => dealOptions.find((deal) => deal.key === selectedDeal) || null,
    [dealOptions, selectedDeal]
  );

  const matchingDealOptions = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    if (!normalizedQuery) {
      return dealOptions.slice(0, 8);
    }

    return dealOptions
      .filter((deal) => deal.name.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [dealOptions, searchTerm]);

  useEffect(() => {
    if (!selectedDeal) return;
    const stillExists = dealOptions.some((deal) => deal.key === selectedDeal);
    if (!stillExists) {
      setSelectedDeal("");
    }
  }, [dealOptions, selectedDeal]);

  const visibleNotifications = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return notifications.filter((item) => {
      const passesStatusFilter =
        statusFilter === "all" ||
        (statusFilter === "unread" && !item?.isRead) ||
        (statusFilter === "read" && Boolean(item?.isRead));

      if (!passesStatusFilter) return false;

      const itemDealKey = String(item?.dealId?._id || item?.dealId || "");
      const passesDealFilter = !selectedDeal || itemDealKey === selectedDeal;
      if (!passesDealFilter) return false;

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
  }, [notifications, searchTerm, selectedDeal, statusFilter]);

  const selectedProposalNotification = useMemo(
    () => notifications.find((item) => String(item?._id || "") === String(openProposalDetailsId || "")) || null,
    [notifications, openProposalDetailsId]
  );

  const markSingleAsRead = useCallback(async (id) => {
    if (!id) return;
    try {
      const target = notifications.find((item) => String(item._id) === String(id));
      if (!target || target.source !== "deal") {
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
      .filter((item) => item?.source === "deal" && !item?.isRead)
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
      setSelectedDeal(autoOpenDealId);
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

    if (!isDealInNegotiateStage(notification)) {
      window.alert("Proposal review is enabled only in Negotiate stage.");
      return;
    }

    try {
      setActionLoadingId(`${notification._id}:${action}`);
      const notificationId = String(notification?._id || "").trim();
      const comment = String(proposalReviewComments[notificationId] || "").trim();
      const isWonReview = isWonApprovalRequest(notification);
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

      const endpoint = isWonReview ? `/deals/${dealId}/won-approval` : `/deals/${dealId}/proposal-approval`;
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

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="notifications-page">
          <div className="notifications-page-header">
            <div className="notifications-page-header-text">
              <h1>Notifications Center</h1>
              <p>Review stock, proposal approvals, and system alerts from one place.</p>
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
                className="notifications-btn secondary"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </button>
              <button
                type="button"
                className="notifications-btn"
                onClick={markAllAsRead}
                disabled={actionLoadingId === "all" || unreadCount === 0}
              >
                {actionLoadingId === "all" ? "Marking..." : `Mark all read (${unreadCount})`}
              </button>
            </div>
          </div>

          <div className="notifications-toolbar">
            <div className="notifications-filter-group" role="tablist" aria-label="Filter notifications">
              <button
                type="button"
                className={`notifications-filter-btn ${statusFilter === "all" ? "active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`notifications-filter-btn ${statusFilter === "unread" ? "active" : ""}`}
                onClick={() => setStatusFilter("unread")}
              >
                Unread
              </button>
              <button
                type="button"
                className={`notifications-filter-btn ${statusFilter === "read" ? "active" : ""}`}
                onClick={() => setStatusFilter("read")}
              >
                Read
              </button>
            </div>

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
          </div>

          {dealOptions.length > 0 ? (
            <div className="notifications-deal-filter" role="group" aria-label="Deal filter">
              <div className="notifications-deal-filter-top">
                <label className="notifications-deal-filter-label" htmlFor="deal-filter-input">
                  Filter by Deal
                </label>
                {selectedDealMeta ? (
                  <button
                    type="button"
                    className="notifications-btn secondary"
                    onClick={() => {
                      setSelectedDeal("");
                    }}
                  >
                    Clear Deal Filter
                  </button>
                ) : null}
              </div>

              {selectedDealMeta ? (
                <p className="notifications-deal-current">
                  Showing notifications for: <strong>{selectedDealMeta.name}</strong>
                </p>
              ) : null}

              <div className="notifications-deal-results" aria-label="Matching deals">
                {matchingDealOptions.map((deal) => (
                  <button
                    key={deal.key}
                    type="button"
                    className={`notifications-deal-result ${selectedDeal === deal.key ? "active" : ""}`}
                    onClick={() => {
                      setSelectedDeal(deal.key);
                    }}
                  >
                    {deal.name} ({deal.count})
                  </button>
                ))}
                {!matchingDealOptions.length ? (
                  <span className="notifications-deal-empty">No deals found</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="notifications-empty-card">Loading notifications...</div>
          ) : visibleNotifications.length === 0 ? (
            <div className="notifications-empty-card">
              No notifications match this view. Try changing filters or search text.
            </div>
          ) : (
            <div className="notifications-grid">
              {visibleNotifications.map((item) => {
                const refillType = isRefillNotification(item);
                const activityType = item?.source === "activity";
                const proposalType = !activityType && isProposalNotification(item);
                const proposalResponseForEmployee = proposalType && isProposalEmployeeResponse(item);
                const negotiateStage = isDealInNegotiateStage(item);
                const details = refillType ? parseRefillDetails(item?.message || "") : null;
                return (
                  <article
                    key={item._id}
                    className={`notification-card ${item?.isRead ? "read" : "unread"}`}
                  >
                    <div className="notification-card-top">
                      <span className="notification-pill">{getNotificationPill(item)}</span>
                      <span className="notification-time">
                        {item?.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                      </span>
                    </div>

                    <h3>
                      {activityType ? (
                        item?.title || "Activity Reminder"
                      ) : item?.dealId?.name ? (
                        <button
                          type="button"
                          className="notification-deal-link"
                          onClick={() => {
                            const key = String(item?.dealId?._id || item?.dealId || "");
                            setSelectedDeal(key);
                          }}
                        >
                          {item.dealId.name}
                        </button>
                      ) : (
                        "Deal Alert"
                      )} 
                    </h3>

                    {activityType ? (
                      <div className="notification-details two-column">
                        <div><strong>Type:</strong> {String(item?.activityType || "activity").replaceAll("_", " ")}</div>
                        <div><strong>Reminder:</strong> {item?.reminderTime ? new Date(item.reminderTime).toLocaleString() : "-"}</div>
                        <div><strong>Related:</strong> {item?.relatedTo?.recordType || "-"}</div>
                        <div><strong>Name:</strong> {item?.relatedTo?.recordName || "-"}</div>
                        <div><strong>Owner:</strong> {item?.owner?.name || item?.owner?.username || "-"}</div>
                        <div><strong>Status:</strong> {item?.isRead ? "Read" : "Unread"}</div>
                      </div>
                    ) : refillType ? (
                      <div className="notification-details two-column">
                        <div><strong>Product:</strong> {details.product}</div>
                        <div><strong>Requested Qty:</strong> {details.requested}</div>
                        <div><strong>Available Qty:</strong> {details.available}</div>
                        <div><strong>Customer:</strong> {details.customer}</div>
                        <div><strong>Company:</strong> {details.company}</div>
                        <div><strong>Email:</strong> {details.email}</div>
                        <div><strong>Phone:</strong> {details.phone}</div>
                        <div><strong>Updated By:</strong> {item?.changedByName || "Employee"}</div>
                      </div>
                    ) : proposalType ? (
                      <div className="notification-details two-column">
                        <div><strong>Deal Stage:</strong> {String(item?.dealId?.stage || "-").replaceAll("_", " ")}</div>
                        <div><strong>Workflow:</strong> {String(item?.toStage || "proposal").replaceAll("_", " ")}</div>
                        <div><strong>Company:</strong> {item?.dealId?.company || "-"}</div>
                        <div><strong>Amount:</strong> {item?.dealId?.amount ? `Rs.${Number(item.dealId.amount).toLocaleString("en-IN")}` : "-"}</div>
                        <div><strong>Updated By:</strong> {item?.changedByName || "System"}</div>
                        <div><strong>Allowed Now:</strong> {negotiateStage ? "Yes" : "No (move deal to Negotiate stage)"}</div>
                      </div>
                    ) : (
                      <div className="notification-details">
                        <div><strong>Type:</strong> {String(item?.toStage || "notification").replaceAll("_", " ")}</div>
                        <div><strong>Updated By:</strong> {item?.changedByName || "System"}</div>
                      </div>
                    )}

                    <p className="notification-message">{item?.message || ""}</p>

                    <div className="notification-actions">
                      {refillType ? (
                        <button
                          type="button"
                          className="notifications-btn"
                          onClick={() => openVendorsForPurchase(item)}
                        >
                          Make Purchase
                        </button>
                      ) : null}
                      {proposalType ? (
                        <button
                          type="button"
                          className="notifications-btn"
                          onClick={() => openProposalDetailsDialog(item)}
                        >
                          Open Details
                        </button>
                      ) : null}
                      {isEmployee && proposalResponseForEmployee ? (
                        <button
                          type="button"
                          className="notifications-btn"
                          onClick={() => handleSaveToQuotation(item)}
                          disabled={actionLoadingId === `${item._id}:save_to_quotation`}
                        >
                          {actionLoadingId === `${item._id}:save_to_quotation` ? "Saving..." : "Save To Quotation"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="notifications-btn secondary"
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
                          !isDealInNegotiateStage(selectedProposalNotification) ||
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
