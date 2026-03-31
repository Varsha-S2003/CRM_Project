import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  "proposal rejected",
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
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState("");
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

  const markSingleAsRead = async (id) => {
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
  };

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
        </div>
      </div>
    </div>
  );
}
