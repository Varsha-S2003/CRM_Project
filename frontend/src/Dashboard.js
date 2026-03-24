import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts";
import "./Dashboard.css";
import Sidebar from "./Sidebar";

function Dashboard() {
  const role = localStorage.getItem("role");
  const storedName = localStorage.getItem("name");
  const storedUsername = localStorage.getItem("username");
  const username =
    storedName && storedName !== "undefined" && storedName !== "null"
      ? storedName
      : storedUsername && storedUsername !== "undefined" && storedUsername !== "null"
        ? storedUsername
        : "User";
  const employee_id = localStorage.getItem("employee_id") || "";
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [assignmentSnapshot, setAssignmentSnapshot] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignableEmployees, setAssignableEmployees] = useState([]);
  const [assignSelectionByLead, setAssignSelectionByLead] = useState({});
  const [assigningLeadIds, setAssigningLeadIds] = useState({});
  const [showAssignedByMePanel, setShowAssignedByMePanel] = useState(false);
  const notificationRef = useRef(null);
  const assignedByMeRef = useRef(null);

  // Make role check case-insensitive
  const userRole = role ? role.toUpperCase() : "";
  const isAdmin = userRole === "ADMIN";
  const isManager = userRole === "MANAGER";

  useEffect(() => {
    if (isAdmin) {
      const token = localStorage.getItem("token");
      fetch("http://localhost:5000/api/stats", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setStats(data))
        .catch((err) => console.error(err));
    }
  }, [isAdmin]);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      setNotificationsLoading(true);
      const res = await axios.get("http://localhost:5000/api/deals/notifications", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      console.error("Dashboard notifications fetch error:", err);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const fetchAssignmentDashboard = useCallback(async () => {
    if (isAdmin) {
      setAssignmentSnapshot(null);
      return;
    }

    try {
      const token = localStorage.getItem("token");
      setAssignmentLoading(true);
      const res = await axios.get("http://localhost:5000/api/leads/assignment-dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAssignmentSnapshot(res.data || null);
    } catch (err) {
      console.error("Assignment dashboard fetch error:", err);
      setAssignmentSnapshot(null);
    } finally {
      setAssignmentLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAssignmentDashboard();
  }, [fetchAssignmentDashboard]);

  useEffect(() => {
    if (!isManager) {
      setAssignableEmployees([]);
      return;
    }

    const fetchAssignableEmployees = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/employees/assignable", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAssignableEmployees(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Manager assignable employees fetch error:", err);
        setAssignableEmployees([]);
      }
    };

    fetchAssignableEmployees();
  }, [isManager]);

  const handleManagerAssignLead = useCallback(async (leadId) => {
    const selectedEmployeeId = assignSelectionByLead[leadId];
    if (!selectedEmployeeId) {
      window.alert("Select an employee first.");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: true }));

      await axios.post(
        "http://localhost:5000/api/leads/assign",
        { leadId, userId: selectedEmployeeId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAssignSelectionByLead((prev) => ({ ...prev, [leadId]: "" }));
      await fetchAssignmentDashboard();
    } catch (err) {
      console.error("Manager lead assignment error:", err);
      window.alert(err.response?.data?.message || "Failed to assign lead to employee.");
    } finally {
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: false }));
    }
  }, [assignSelectionByLead, fetchAssignmentDashboard]);

  const handleManagerUnassignLead = useCallback(async (leadId) => {
    try {
      const token = localStorage.getItem("token");
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: true }));

      await axios.post(
        "http://localhost:5000/api/leads/assign",
        { leadId, userId: "" },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchAssignmentDashboard();
    } catch (err) {
      console.error("Manager lead unassign error:", err);
      window.alert(err.response?.data?.message || "Failed to remove assignment.");
    } finally {
      setAssigningLeadIds((prev) => ({ ...prev, [leadId]: false }));
    }
  }, [fetchAssignmentDashboard]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (assignedByMeRef.current && !assignedByMeRef.current.contains(event.target)) {
        setShowAssignedByMePanel(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // prepare data arrays for charts once stats are available
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  
  // Default data for demo when no stats available
  const defaultRevenueData = [
    { month: "Jan", revenue: 4000, target: 4600 },
    { month: "Feb", revenue: 3000, target: 4200 },
    { month: "Mar", revenue: 5000, target: 4700 },
    { month: "Apr", revenue: 4500, target: 5100 },
    { month: "May", revenue: 6000, target: 5600 },
    { month: "Jun", revenue: 5500, target: 5900 }
  ];
  
  const defaultDealsData = [
    { name: "New", value: 25 },
    { name: "Contacted", value: 18 },
    { name: "Qualified", value: 12 },
    { name: "Won", value: 8 }
  ];
  
  const defaultManagerData = [
    { name: "John", score: 85 },
    { name: "Sarah", score: 92 },
    { name: "Mike", score: 78 },
    { name: "Lisa", score: 95 }
  ];

  const revenueData = stats?.revenueTrend?.map((val, idx) => ({
    month: months[idx],
    revenue: val,
    target: Math.round(val * 1.08),
  })) || defaultRevenueData;
  const dealsData = stats
    ? Object.entries(stats.dealsByStage).map(([stage, count]) => ({ name: stage, value: count }))
    : defaultDealsData;
  const managerData = stats
    ? Object.entries(stats.managerPerformance).map(([name, score]) => ({ name, score }))
    : defaultManagerData;
  const COLORS = ["#6f42c1", "#007bff", "#0dcaf0", "#17a2b8"];
  const chartTooltipStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #d9e3f2",
    borderRadius: "14px",
    boxShadow: "0 16px 40px rgba(42, 27, 77, 0.12)",
  };

  const assignmentItems = assignmentSnapshot?.items || [];
  const managerIncomingItems = isManager
    ? assignmentItems.filter((item) => item.canAssign)
    : [];
  const managerAssignedByMeItems = isManager
    ? assignmentItems.filter((item) => item.canUnassign)
    : [];

  const renderAssignmentItem = (item) => (
    <div key={item._id} className="assignment-lead-item">
      <div>
        <div className="assignment-lead-name">{item.name || "Unnamed Lead"}</div>
        <div className="assignment-lead-meta">
          {item.company || "No Company"} | Status: {String(item.status || "").toUpperCase()}
        </div>
        <div className="assignment-lead-meta">
          Assigned by: {item.assignedBy?.name || item.assignedBy?.username || "System"}
        </div>
        <div className="assignment-lead-meta">
          Assigned to: {item.assignedTo?.name || item.assignedTo?.username || "Unassigned"}
        </div>
      </div>
      {isManager && item.canAssign ? (
        <div className="assignment-manager-action">
          <select
            value={assignSelectionByLead[item._id] || ""}
            onChange={(event) => {
              const value = event.target.value;
              setAssignSelectionByLead((prev) => ({ ...prev, [item._id]: value }));
            }}
            className="assignment-employee-select"
          >
            <option value="">Select employee</option>
            {assignableEmployees.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {(employee.name || employee.username || employee.email || "Employee")} ({String(employee.role || "").toUpperCase()})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="assignment-submit-btn"
            onClick={() => handleManagerAssignLead(item._id)}
            disabled={!assignSelectionByLead[item._id] || assigningLeadIds[item._id]}
          >
            {assigningLeadIds[item._id] ? "Assigning..." : "Assign"}
          </button>
        </div>
      ) : isManager && item.canUnassign ? (
        <div className="assignment-manager-action assignment-manager-action-readonly">
          <div className={`assignment-next-action ${item.nextAction?.type || "tracking"}`}>
            {item.nextAction?.label || "Assigned"}
          </div>
          <button
            type="button"
            className="assignment-delete-btn"
            onClick={() => handleManagerUnassignLead(item._id)}
            disabled={assigningLeadIds[item._id]}
          >
            {assigningLeadIds[item._id] ? "Removing..." : "Delete Assignment"}
          </button>
        </div>
      ) : (
        <div className={`assignment-next-action ${item.nextAction?.type || "none"}`}>
          {item.nextAction?.label || "No Immediate Action"}
        </div>
      )}
    </div>
  );

  // state to track bar hover
  const [activeBarIndex, setActiveBarIndex] = useState(null);

  return (
    <div className="dashboard-layout">
      <Sidebar />

<div className="main-content">
        <div className="dashboard-wrapper">

          {/* Header */}
          <div className="dashboard-header">
            <div>
              <h2 className="dashboard-title">
                {isAdmin ? "Admin Dashboard" : isManager ? "Manager Dashboard" : "Employee Dashboard"}
              </h2>
              <p className="dashboard-subtitle">
                Welcome back, {username} 
                {employee_id && <span className="employee-id"> (ID: {employee_id})</span>}
              </p>
            </div>
            <div className="dashboard-header-actions">
              {isManager && (
                <div className="dashboard-assigned-wrap" ref={assignedByMeRef}>
                  <button
                    type="button"
                    className="dashboard-assigned-btn"
                    onClick={() => setShowAssignedByMePanel((prev) => !prev)}
                    title="Assigned by me"
                  >
                    Assigned By Me
                    <span className="dashboard-assigned-count">{managerAssignedByMeItems.length}</span>
                  </button>
                  {showAssignedByMePanel && (
                    <div className="dashboard-assigned-panel">
                      <div className="dashboard-assigned-panel-header">
                        <h4>Assigned By Me</h4>
                      </div>
                      {assignmentLoading ? (
                        <div className="assignment-empty">Loading your assignments...</div>
                      ) : !managerAssignedByMeItems.length ? (
                        <div className="assignment-empty">You have not assigned any lead to employees yet.</div>
                      ) : (
                        <div className="assignment-lead-list">
                          {managerAssignedByMeItems.slice(0, 12).map((item) => renderAssignmentItem(item))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="dashboard-notification-bell" ref={notificationRef}>
                <button
                  type="button"
                  className="dashboard-notification-btn"
                  onClick={() => setShowNotifications((prev) => !prev)}
                  title="Notifications"
                >
                  {"\u{1F514}"}
                  {unreadCount > 0 && (
                    <span className="dashboard-notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                  )}
                </button>
                {showNotifications && (
                  <div className="dashboard-notification-dropdown">
                    <div className="dashboard-notification-header">
                      <h4>Notifications ({unreadCount})</h4>
                      <button
                        type="button"
                        onClick={async () => {
                          if (notifications.some((item) => !item.isRead)) {
                            const unreadIds = notifications.filter((item) => !item.isRead).map((item) => item._id);
                            try {
                              const token = localStorage.getItem("token");
                              await axios.patch(
                                `http://localhost:5000/api/deals/notifications/${unreadIds.join(",")}/read`,
                                {},
                                { headers: { Authorization: `Bearer ${token}` } }
                              );
                              fetchNotifications();
                            } catch (err) {
                              console.error("Dashboard mark-all-read error:", err);
                            }
                          }
                        }}
                      >
                        Mark all read
                      </button>
                    </div>
                    {notificationsLoading ? (
                      <div className="dashboard-notification-empty">Loading...</div>
                    ) : notifications.length === 0 ? (
                      <div className="dashboard-notification-empty">No notifications</div>
                    ) : (
                      <div className="dashboard-notification-list">
                        {notifications.slice(0, 10).map((notif) => (
                          <div
                            key={notif._id}
                            className={`dashboard-notification-item ${notif.isRead ? "read" : "unread"}`}
                            onClick={async () => {
                              if (!notif.isRead) {
                                try {
                                  const token = localStorage.getItem("token");
                                  await axios.patch(
                                    `http://localhost:5000/api/deals/notifications/${notif._id}/read`,
                                    {},
                                    { headers: { Authorization: `Bearer ${token}` } }
                                  );
                                  fetchNotifications();
                                } catch (err) {
                                  console.error("Dashboard mark-read error:", err);
                                }
                              }
                            }}
                          >
                            <div className="dashboard-notification-message">
                              {notif.message}
                              {notif.dealId?.name && (
                                <button
                                  type="button"
                                  className="dashboard-notification-link"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    window.location.href = "/deals";
                                  }}
                                >
                                  Deal: {notif.dealId.name}
                                </button>
                              )}
                            </div>
                            <div className="dashboard-notification-time">
                              {new Date(notif.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {!isAdmin && (
            <div className="assignment-dashboard-block">
              <div className="assignment-dashboard-header">
                <h3>{isManager ? "Leads Assigned By Admin" : "Leads Assigned To You"}</h3>
                <p>
                  {isManager
                    ? "Track leads assigned to you and distribute them to employees."
                    : "See your assigned leads and the suggested next action."}
                </p>
              </div>

              <div className="assignment-summary-grid">
                <div className="assignment-summary-card">
                  <span>Total Assigned</span>
                  <strong>{assignmentSnapshot?.summary?.totalAssignedLeads || 0}</strong>
                </div>
                <div className="assignment-summary-card">
                  <span>{isManager ? "Assign Actions" : "Call Actions"}</span>
                  <strong>
                    {isManager
                      ? assignmentSnapshot?.summary?.assignActions || 0
                      : assignmentSnapshot?.summary?.callActions || 0}
                  </strong>
                </div>
                <div className="assignment-summary-card">
                  <span>{isManager ? "Employee Follow-ups" : "Meeting Actions"}</span>
                  <strong>
                    {isManager
                      ? (assignmentSnapshot?.summary?.callActions || 0) + (assignmentSnapshot?.summary?.meetingActions || 0)
                      : assignmentSnapshot?.summary?.meetingActions || 0}
                  </strong>
                </div>
                <div className="assignment-summary-card">
                  <span>{isManager ? "No Immediate Action" : "No Immediate Action"}</span>
                  <strong>{assignmentSnapshot?.summary?.noImmediateAction || 0}</strong>
                </div>
              </div>

              {isManager ? (
                <div className="assignment-list-card">
                  <div className="assignment-list-title">New From Admin</div>
                  {assignmentLoading ? (
                    <div className="assignment-empty">Loading assigned leads...</div>
                  ) : !managerIncomingItems.length ? (
                    <div className="assignment-empty">No new leads assigned by admin.</div>
                  ) : (
                    <div className="assignment-lead-list">
                      {managerIncomingItems.slice(0, 8).map((item) => renderAssignmentItem(item))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="assignment-list-card">
                  {assignmentLoading ? (
                    <div className="assignment-empty">Loading assigned leads...</div>
                  ) : !assignmentItems.length ? (
                    <div className="assignment-empty">No assigned leads found.</div>
                  ) : (
                    <div className="assignment-lead-list">
                      {assignmentItems.slice(0, 8).map((item) => renderAssignmentItem(item))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Always show charts with default or live data */}
          {/* Top Stat Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <h4>Total Products</h4>
              <h2>{stats?.totalProducts || "0"}</h2>
            </div>

            <div className="stat-card">
              <h4>Total Stock</h4>
              <h2>{stats?.totalStock || "0"}</h2>
            </div>

            <div className="stat-card">
              <h4>Low Stock Items</h4>
              <h2 style={{ color: (stats?.lowStockItems || 0) > 0 ? "#6f42c1" : "#17a2b8" }}>
                {stats?.lowStockItems || "0"}
              </h2>
            </div>

            <div className="stat-card">
              <h4>Total Revenue</h4>
              <h2>${stats?.totalRevenue || "125,000"}</h2>
            </div>

            <div className="stat-card">
              <h4>Total Deals</h4>
              <h2>{stats?.totalDeals || "48"}</h2>
            </div>

            <div className="stat-card">
              <h4>Active Leads</h4>
              <h2>{stats?.activeLeads || "156"}</h2>
            </div>

            <div className="stat-card">
              <h4>Conversion Rate</h4>
              <h2>{stats?.conversionRate || "32"}%</h2>
            </div>
          </div>

          {/* Charts Row */}
          <div className="charts-grid">

            {/* Revenue Trend */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h4>Revenue Trend</h4>
                  <p>Monthly performance against target</p>
                </div>
                <span className="chart-chip">+18.4%</span>
              </div>
              <div className="chart-wrap chart-wrap-lg">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#007bff" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#007bff" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="targetFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6f42c1" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#6f42c1" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8eef8" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: "12px", paddingBottom: "12px" }} />
                    <Area type="monotone" dataKey="target" stroke="#6f42c1" fill="url(#targetFill)" strokeWidth={2} name="Target" />
                    <Area type="monotone" dataKey="revenue" stroke="#007bff" fill="url(#revenueFill)" strokeWidth={3} name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Deals by Stage */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h4>Deals by Stage</h4>
                  <p>Live funnel distribution</p>
                </div>
              </div>
              <div className="chart-wrap chart-wrap-md">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dealsData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={86}
                      paddingAngle={4}
                    >
                      {dealsData.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Manager Performance */}
          <div className="chart-card full-width">
            <div className="chart-card-header">
              <div>
                <h4>Manager Performance</h4>
                <p>Score comparison across top performers</p>
              </div>
              <span className="chart-chip chart-chip-secondary">Quarterly</span>
            </div>
            <div className="chart-wrap chart-wrap-md">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={managerData} barCategoryGap={24}>
                  <CartesianGrid stroke="#e8eef8" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6d7a96", fontSize: 12 }} />
                  <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "rgba(111, 66, 193, 0.05)" }} />
                  <Bar dataKey="score" radius={[10, 10, 4, 4]} maxBarSize={48}>
                    {managerData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={activeBarIndex === index ? "#007bff" : "#6f42c1"}
                        onMouseEnter={() => setActiveBarIndex(index)}
                        onMouseLeave={() => setActiveBarIndex(null)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
