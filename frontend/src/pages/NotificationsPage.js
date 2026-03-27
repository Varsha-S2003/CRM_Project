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

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/deals/notifications");
      const list = Array.isArray(res.data?.notifications) ? res.data.notifications : [];
      setNotifications(list);
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

  const refillNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const text = String(item?.message || "").toLowerCase();
      return REFILL_KEYWORDS.some((word) => text.includes(word));
    });
  }, [notifications]);

  const markSingleAsRead = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/deals/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((item) => (String(item._id) === String(id) ? { ...item, isRead: true } : item))
      );
    } catch (err) {
      console.error("Notification mark read error:", err);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((item) => !item?.isRead).map((item) => item._id);
    if (!unreadIds.length) return;

    try {
      setActionLoadingId("all");
      await api.patch(`/deals/notifications/${unreadIds.join(",")}/read`, {});
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

  const unreadCount = notifications.filter((item) => !item?.isRead).length;

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="notifications-page">
          <div className="notifications-page-header">
            <div>
              <h1>Notifications</h1>
              <p>Review stock alerts and create purchases quickly from one page.</p>
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

          {loading ? (
            <div className="notifications-empty-card">Loading notifications...</div>
          ) : refillNotifications.length === 0 ? (
            <div className="notifications-empty-card">No refill-related alerts right now.</div>
          ) : (
            <div className="notifications-grid">
              {refillNotifications.map((item) => {
                const details = parseRefillDetails(item?.message || "");
                return (
                  <article
                    key={item._id}
                    className={`notification-card ${item?.isRead ? "read" : "unread"}`}
                  >
                    <div className="notification-card-top">
                      <span className="notification-pill">Need Analysis</span>
                      <span className="notification-time">
                        {item?.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                      </span>
                    </div>

                    <h3>{item?.dealId?.name ? `Deal: ${item.dealId.name}` : "Deal Alert"}</h3>

                    <div className="notification-details">
                      <div><strong>Product:</strong> {details.product}</div>
                      <div><strong>Requested Qty:</strong> {details.requested}</div>
                      <div><strong>Available Qty:</strong> {details.available}</div>
                      <div><strong>Customer:</strong> {details.customer}</div>
                      <div><strong>Company:</strong> {details.company}</div>
                      <div><strong>Email:</strong> {details.email}</div>
                      <div><strong>Phone:</strong> {details.phone}</div>
                      <div><strong>Updated By:</strong> {item?.changedByName || "Employee"}</div>
                    </div>

                    <p className="notification-message">{item?.message || ""}</p>

                    <div className="notification-actions">
                      <button
                        type="button"
                        className="notifications-btn"
                        onClick={() => openVendorsForPurchase(item)}
                      >
                        Make Purchase
                      </button>
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
