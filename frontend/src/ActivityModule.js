import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import Sidebar from "./Sidebar";
import "./ActivityModule.css";

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "thisWeek", label: "This Week" },
  { value: "nextWeek", label: "Next Week" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Activities" },
  { value: "task", label: "Tasks" },
  { value: "meeting", label: "Meetings" },
  { value: "call", label: "Calls" },
];

const PRIORITY_OPTIONS = ["Low", "Medium", "High"];
const VIEW_OPTIONS = ["month", "week", "day"];
const CHART_COLORS = ["#3b82f6", "#f97316", "#10b981", "#8b5cf6"];

const createDefaultForm = (ownerId, relatedOptions) => ({
  activityType: "task",
  title: "",
  description: "",
  owner: ownerId || "",
  dueDate: "",
  priority: "Medium",
  status: "Pending",
  relatedType: relatedOptions[0]?.type || "Lead",
  relatedId: relatedOptions[0]?.id || "",
  reminderTime: "",
  reminderChannels: { popup: true, email: false },
  recurrence: "none",
  location: "",
  participants: "",
  startTime: "",
  endTime: "",
  meetingDate: "",
  callType: "Outbound",
  callDuration: 30,
  callNotes: "",
  callDate: "",
  callTime: "",
});

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const getMonthGrid = (baseDate) => {
  const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

function ActivityModule() {
  const [activities, setActivities] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [users, setUsers] = useState([]);
  const [relatedOptions, setRelatedOptions] = useState([]);
  const [activeSidebar, setActiveSidebar] = useState("all");
  const [filter, setFilter] = useState("all");
  const [activityType, setActivityType] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("month");
  const [form, setForm] = useState({ reminderChannels: { popup: true, email: false } });
  const [toast, setToast] = useState(null);

  const token = localStorage.getItem("token");
  const currentUserId = localStorage.getItem("userId") || "";
  const currentUsername = localStorage.getItem("username") || "Current User";
  const role = (localStorage.getItem("role") || "").toUpperCase();

  const apiHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchDashboard = useCallback(async () => {
    const res = await axios.get("http://localhost:5000/api/activities/dashboard", { headers: apiHeaders });
    setDashboard(res.data);
  }, [apiHeaders]);

  const fetchActivities = useCallback(async () => {
    const params = {
      filter,
      activityType: activeSidebar === "all" ? activityType : activeSidebar,
      owner: ownerFilter,
      priority: priorityFilter,
      search,
    };
    const res = await axios.get("http://localhost:5000/api/activities", { headers: apiHeaders, params });
    setActivities(res.data);
  }, [activeSidebar, activityType, apiHeaders, filter, ownerFilter, priorityFilter, search]);

  const fetchReports = useCallback(async () => {
    const res = await axios.get("http://localhost:5000/api/activities/reports", { headers: apiHeaders });
    setReports(res.data);
  }, [apiHeaders]);

  const fetchNotifications = useCallback(async () => {
    const res = await axios.get("http://localhost:5000/api/activities/notifications", { headers: apiHeaders });
    setNotifications(res.data.notifications || []);
    if (res.data.notifications?.length) {
      const next = res.data.notifications[0];
      setToast(`${next.title} reminder at ${formatDateTime(next.reminderTime)}`);
    }
  }, [apiHeaders]);

  const fetchRelatedRecords = useCallback(async () => {
    const leadEndpoint = role === "EMPLOYEE" ? "/api/leads/my" : "/api/leads/all";
    const requests = [
      axios.get(`http://localhost:5000${leadEndpoint}`, { headers: apiHeaders }),
      axios.get("http://localhost:5000/api/contacts", { headers: apiHeaders }),
      axios.get("http://localhost:5000/api/deals", { headers: apiHeaders }),
    ];
    const [leadsRes, contactsRes, dealsRes] = await Promise.all(requests);
    const options = [
      ...leadsRes.data.map((item) => ({ id: item._id, name: item.name, type: "Lead" })),
      ...contactsRes.data.map((item) => ({ id: item._id, name: item.name, type: "Contact" })),
      ...dealsRes.data.map((item) => ({ id: item._id, name: item.name, type: "Deal" })),
    ];
    setRelatedOptions(options);
    setForm((prev) => (prev.relatedId ? prev : createDefaultForm(currentUserId, options)));
  }, [apiHeaders, currentUserId, role]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/employees", { headers: apiHeaders });
      const employeeUsers = res.data.map((user) => ({
        _id: user._id || user.id,
        name: user.name || user.username,
        username: user.username,
      }));
      setUsers(employeeUsers);
    } catch (error) {
      setUsers(currentUserId ? [{ _id: currentUserId, name: currentUsername, username: currentUsername }] : []);
    }
  }, [apiHeaders, currentUserId, currentUsername]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchDashboard(), fetchActivities(), fetchReports(), fetchNotifications()]);
    } finally {
      setLoading(false);
    }
  }, [fetchActivities, fetchDashboard, fetchNotifications, fetchReports]);

  useEffect(() => {
    fetchUsers();
    fetchRelatedRecords();
  }, [fetchRelatedRecords, fetchUsers]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openCreateModal = () => {
    setEditingActivity(null);
    setForm(createDefaultForm(currentUserId, relatedOptions));
    setShowModal(true);
  };

  const relatedByType = useMemo(
    () => relatedOptions.filter((option) => option.type === form.relatedType),
    [relatedOptions, form.relatedType]
  );

  const calendarActivities = useMemo(() => {
    const from = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const to = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0);
    return activities.filter((activity) => {
      const sourceDate = new Date(activity.startDateTime || activity.dueDate || activity.createdAt);
      return sourceDate >= startOfDay(from) && sourceDate <= endOfDay(to);
    });
  }, [activities, calendarDate]);

  const monthGrid = useMemo(() => getMonthGrid(calendarDate), [calendarDate]);

  const calendarGroups = useMemo(() => {
    return calendarActivities.reduce((acc, activity) => {
      const key = new Date(activity.startDateTime || activity.dueDate || activity.createdAt).toISOString().slice(0, 10);
      acc[key] = acc[key] || [];
      acc[key].push(activity);
      return acc;
    }, {});
  }, [calendarActivities]);

  const today = startOfDay(new Date()).toISOString().slice(0, 10);
  const statsCards = dashboard?.summary
    ? [
        { label: "Today's Activities", value: dashboard.summary.today, tone: "blue" },
        { label: "Upcoming", value: dashboard.summary.upcoming, tone: "orange" },
        { label: "Overdue", value: dashboard.summary.overdue, tone: "red" },
        { label: "Completed", value: dashboard.summary.completed, tone: "green" },
      ]
    : [];

  const openEditModal = (activity) => {
    setEditingActivity(activity);
    setForm({
      activityType: activity.activityType,
      title: activity.title || "",
      description: activity.description || "",
      owner: activity.owner?._id || "",
      dueDate: activity.dueDate ? new Date(activity.dueDate).toISOString().slice(0, 16) : "",
      priority: activity.priority || "Medium",
      status: activity.status || "Pending",
      relatedType: activity.relatedTo?.recordType || "Lead",
      relatedId: activity.relatedTo?.recordId?._id || activity.relatedTo?.recordId || "",
      reminderTime: activity.reminderTime ? new Date(activity.reminderTime).toISOString().slice(0, 16) : "",
      reminderChannels: {
        popup: activity.reminderChannels?.popup ?? true,
        email: activity.reminderChannels?.email ?? false,
      },
      recurrence: activity.recurrence || "none",
      location: activity.location || "",
      participants: activity.participants?.join(", ") || "",
      meetingDate: activity.startDateTime ? new Date(activity.startDateTime).toISOString().slice(0, 10) : "",
      startTime: activity.startDateTime ? new Date(activity.startDateTime).toISOString().slice(11, 16) : "",
      endTime: activity.endDateTime ? new Date(activity.endDateTime).toISOString().slice(11, 16) : "",
      callType: activity.call?.callType || "Outbound",
      callDuration: activity.call?.callDuration || 30,
      callNotes: activity.call?.callNotes || "",
      callDate: activity.startDateTime ? new Date(activity.startDateTime).toISOString().slice(0, 10) : "",
      callTime: activity.startDateTime ? new Date(activity.startDateTime).toISOString().slice(11, 16) : "",
    });
    setShowModal(true);
  };

  const submitActivity = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      participants: form.participants,
      taskTitle: form.activityType === "task" ? form.title : undefined,
      meetingTitle: form.activityType === "meeting" ? form.title : undefined,
      callSubject: form.activityType === "call" ? form.title : undefined,
      callStatus: form.activityType === "call" ? form.status : undefined,
    };

    if (editingActivity) {
      await axios.put(`http://localhost:5000/api/activities/${editingActivity._id}`, payload, { headers: apiHeaders });
    } else {
      await axios.post("http://localhost:5000/api/activities", payload, { headers: apiHeaders });
    }

    setShowModal(false);
    await refreshAll();
  };

  const handleDelete = async (activityId) => {
    if (!window.confirm("Delete this activity?")) return;
    await axios.delete(`http://localhost:5000/api/activities/${activityId}`, { headers: apiHeaders });
    await refreshAll();
  };

  const handleComplete = async (activityId) => {
    await axios.post(`http://localhost:5000/api/activities/${activityId}/complete`, {}, { headers: apiHeaders });
    await refreshAll();
  };

  const handleReschedule = async (activity) => {
    const nextValue = window.prompt(
      "Enter the new datetime in YYYY-MM-DDTHH:mm format",
      new Date(activity.startDateTime || activity.dueDate || Date.now()).toISOString().slice(0, 16)
    );
    if (!nextValue) return;
    const payload = activity.activityType === "task"
      ? { dueDate: nextValue, reminderTime: nextValue }
      : { startDateTime: nextValue, reminderTime: nextValue };
    await axios.post(`http://localhost:5000/api/activities/${activity._id}/reschedule`, payload, { headers: apiHeaders });
    await refreshAll();
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content activity-module">
        <div className="activity-topbar">
          <div>
            <h1>Activity Module</h1>
            <p>Tasks, meetings, calls, reminders, calendar scheduling, and linked CRM timelines.</p>
          </div>
          <div className="activity-topbar__actions">
            <div className="notification-badge">
              Notifications
              <span>{notifications.length}</span>
            </div>
            <button className="activity-primary-btn" onClick={openCreateModal}>
              Add Activity
            </button>
          </div>
        </div>

        {toast ? <div className="activity-toast">{toast}</div> : null}

        <div className="activity-shell">
          <aside className="activity-menu">
            {TYPE_OPTIONS.map((item) => (
              <button
                key={item.value}
                className={activeSidebar === item.value ? "active" : ""}
                onClick={() => setActiveSidebar(item.value)}
              >
                {item.label}
              </button>
            ))}
          </aside>

          <div className="activity-content">
            <div className="activity-filterbar">
              <div className="activity-search">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, description, related record, or location"
                />
              </div>
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                {FILTER_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
                {TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">All Owners</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>{user.name || user.username}</option>
                ))}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option value="all">All Priorities</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>

            <div className="activity-stats-grid">
              {statsCards.map((card) => (
                <div key={card.label} className={`activity-stat-card ${card.tone}`}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>

            <div className="activity-dashboard-sections">
              <div className="activity-dashboard-card">
                <h3>Today's Activities</h3>
                <div className="activity-section-list">
                  {(dashboard?.today || []).slice(0, 4).map((item) => (
                    <div key={item._id} className="activity-section-item">
                      <span className={`activity-pill ${item.activityType}`}>{item.activityType}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.relatedTo?.recordName} • {formatDateTime(item.startDateTime || item.dueDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="activity-dashboard-card">
                <h3>Upcoming Activities</h3>
                <div className="activity-section-list">
                  {(dashboard?.upcoming || []).slice(0, 4).map((item) => (
                    <div key={item._id} className="activity-section-item">
                      <span className={`activity-pill ${item.activityType}`}>{item.activityType}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.owner?.name || item.owner?.username} • {formatDateTime(item.startDateTime || item.dueDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="activity-dashboard-card">
                <h3>Overdue Activities</h3>
                <div className="activity-section-list">
                  {(dashboard?.overdue || []).slice(0, 4).map((item) => (
                    <div key={item._id} className="activity-section-item">
                      <span className={`activity-pill ${item.activityType}`}>{item.activityType}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.priority} priority • {formatDate(item.startDateTime || item.dueDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="activity-table-card">
              <div className="activity-card-header">
                <h2>Activity Dashboard</h2>
                <p>Unified list of tasks, meetings, and calls with quick actions.</p>
              </div>
              {loading ? (
                <p>Loading activities...</p>
              ) : (
                <div className="activity-table-wrapper">
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Title</th>
                        <th>Owner</th>
                        <th>Date</th>
                        <th>Priority</th>
                        <th>Related Record</th>
                        <th>Status</th>
                        <th>Quick Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.map((activity) => (
                        <tr key={activity._id}>
                          <td><span className={`activity-pill ${activity.activityType}`}>{activity.activityType}</span></td>
                          <td>{activity.title}</td>
                          <td>{activity.owner?.name || activity.owner?.username || "-"}</td>
                          <td>{formatDateTime(activity.startDateTime || activity.dueDate)}</td>
                          <td>{activity.priority}</td>
                          <td>{activity.relatedTo?.recordName || "-"}</td>
                          <td><span className={`activity-status ${activity.status.toLowerCase()}`}>{activity.status}</span></td>
                          <td>
                            <div className="activity-table-actions">
                              {activity.status !== "Completed" ? (
                                <button onClick={() => handleComplete(activity._id)}>Complete</button>
                              ) : null}
                              <button onClick={() => handleReschedule(activity)}>Reschedule</button>
                              <button onClick={() => openEditModal(activity)}>Edit</button>
                              <button className="danger" onClick={() => handleDelete(activity._id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="activity-grid-two">
              <div className="activity-calendar-card">
                <div className="activity-card-header">
                  <div>
                    <h2>Calendar View</h2>
                    <p>Day, week, and month planning with drag-and-drop rescheduling.</p>
                  </div>
                  <div className="calendar-controls">
                    <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}>
                      Prev
                    </button>
                    <strong>{calendarDate.toLocaleString(undefined, { month: "long", year: "numeric" })}</strong>
                    <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}>
                      Next
                    </button>
                    <select value={calendarView} onChange={(event) => setCalendarView(event.target.value)}>
                      {VIEW_OPTIONS.map((view) => (
                        <option key={view} value={view}>{view}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {calendarView === "month" ? (
                  <div className="calendar-grid">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <div key={day} className="calendar-weekday">{day}</div>
                    ))}
                    {monthGrid.map((day) => {
                      const key = day.toISOString().slice(0, 10);
                      const dayItems = calendarGroups[key] || [];
                      const inMonth = day.getMonth() === calendarDate.getMonth();
                      return (
                        <div
                          key={key}
                          className={`calendar-cell ${inMonth ? "" : "muted"} ${key === today ? "today" : ""}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={async (event) => {
                            const id = event.dataTransfer.getData("text/plain");
                            const moved = activities.find((item) => item._id === id);
                            if (!moved) return;
                            const nextDate = new Date(day);
                            nextDate.setHours(9, 0, 0, 0);
                            await axios.post(
                              `http://localhost:5000/api/activities/${id}/reschedule`,
                              moved.activityType === "task"
                                ? { dueDate: nextDate.toISOString(), reminderTime: nextDate.toISOString() }
                                : { startDateTime: nextDate.toISOString(), reminderTime: nextDate.toISOString() },
                              { headers: apiHeaders }
                            );
                            await refreshAll();
                          }}
                        >
                          <div className="calendar-date">{day.getDate()}</div>
                          <div className="calendar-events">
                            {dayItems.slice(0, 3).map((item) => (
                              <div
                                key={item._id}
                                className={`calendar-event ${item.activityType}`}
                                draggable
                                onDragStart={(event) => event.dataTransfer.setData("text/plain", item._id)}
                              >
                                {item.title}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="calendar-list-view">
                    {activities
                      .filter((activity) => {
                        const sourceDate = new Date(activity.startDateTime || activity.dueDate || activity.createdAt);
                        if (calendarView === "day") {
                          return sourceDate.toDateString() === calendarDate.toDateString();
                        }
                        const start = new Date(calendarDate);
                        const diff = (start.getDay() + 6) % 7;
                        start.setDate(start.getDate() - diff);
                        const end = new Date(start);
                        end.setDate(start.getDate() + 6);
                        return sourceDate >= startOfDay(start) && sourceDate <= endOfDay(end);
                      })
                      .map((activity) => (
                        <div key={activity._id} className="calendar-list-item">
                          <span className={`activity-pill ${activity.activityType}`}>{activity.activityType}</span>
                          <div>
                            <strong>{activity.title}</strong>
                            <p>{formatDateTime(activity.startDateTime || activity.dueDate)} • {activity.relatedTo?.recordName}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="activity-reports-card">
                <div className="activity-card-header">
                  <h2>Activity Reports</h2>
                  <p>Tasks completed, overdue tasks, meetings scheduled, and call logs.</p>
                </div>

                <div className="activity-report-metrics">
                  <div><span>Tasks Completed</span><strong>{reports?.metrics?.tasksCompleted || 0}</strong></div>
                  <div><span>Overdue Tasks</span><strong>{reports?.metrics?.overdueTasks || 0}</strong></div>
                  <div><span>Meetings Scheduled</span><strong>{reports?.metrics?.meetingsScheduled || 0}</strong></div>
                  <div><span>Call Logs</span><strong>{reports?.metrics?.callLogs || 0}</strong></div>
                </div>

                <div className="chart-panel">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={reports?.charts?.byOwner || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="owner" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="count" fill="#2563eb" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-panel small">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={reports?.charts?.byType || []} dataKey="value" nameKey="name" outerRadius={70}>
                        {(reports?.charts?.byType || []).map((entry, index) => (
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="activity-timeline-card">
              <div className="activity-card-header">
                <h2>Activity Timeline</h2>
                <p>Chronological view of all customer interactions for quick follow-up.</p>
              </div>
              <div className="timeline-list">
                {activities.slice(0, 8).map((activity) => (
                  <div key={activity._id} className="timeline-item">
                    <div className={`timeline-dot ${activity.activityType}`}></div>
                    <div>
                      <strong>{activity.title}</strong>
                      <p>
                        {activity.relatedTo?.recordType}: {activity.relatedTo?.recordName} • {formatDateTime(activity.startDateTime || activity.dueDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {showModal ? (
          <div className="activity-modal-overlay" onClick={() => setShowModal(false)}>
            <div className="activity-modal" onClick={(event) => event.stopPropagation()}>
              <div className="activity-card-header">
                <div>
                  <h2>{editingActivity ? "Edit Activity" : "Create Activity"}</h2>
                  <p>Tasks, meetings, and calls share one workflow with type-specific fields.</p>
                </div>
              </div>

              <form className="activity-form" onSubmit={submitActivity}>
                <div className="activity-form-grid">
                  <label>
                    Activity Type
                    <select
                      value={form.activityType}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setForm((prev) => ({
                          ...prev,
                          activityType: nextType,
                          status: nextType === "task" ? "Pending" : "Scheduled",
                        }));
                      }}
                    >
                      <option value="task">Task</option>
                      <option value="meeting">Meeting</option>
                      <option value="call">Call</option>
                    </select>
                  </label>
                  <label>
                    Title
                    <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required />
                  </label>
                  <label>
                    Owner
                    <select value={form.owner} onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}>
                      {users.map((user) => (
                        <option key={user._id} value={user._id}>{user.name || user.username}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select value={form.priority} onChange={(event) => setForm((prev) => ({ ...prev, priority: event.target.value }))}>
                      {PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Related Module
                    <select
                      value={form.relatedType}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        const nextRecord = relatedOptions.find((item) => item.type === nextType);
                        setForm((prev) => ({ ...prev, relatedType: nextType, relatedId: nextRecord?.id || "" }));
                      }}
                    >
                      <option value="Lead">Lead</option>
                      <option value="Contact">Contact</option>
                      <option value="Deal">Deal</option>
                    </select>
                  </label>
                  <label>
                    Related Record
                    <select value={form.relatedId} onChange={(event) => setForm((prev) => ({ ...prev, relatedId: event.target.value }))}>
                      {relatedByType.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Reminder Time
                    <input type="datetime-local" value={form.reminderTime} onChange={(event) => setForm((prev) => ({ ...prev, reminderTime: event.target.value }))} />
                  </label>
                  <label>
                    Recurrence
                    <select value={form.recurrence} onChange={(event) => setForm((prev) => ({ ...prev, recurrence: event.target.value }))}>
                      <option value="none">None</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                </div>

                {form.activityType === "task" ? (
                  <div className="activity-form-grid">
                    <label>
                      Due Date
                      <input type="datetime-local" value={form.dueDate} onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))} required />
                    </label>
                    <label>
                      Status
                      <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                        <option value="Pending">Pending</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {form.activityType === "meeting" ? (
                  <div className="activity-form-grid">
                    <label>
                      Meeting Date
                      <input type="date" value={form.meetingDate} onChange={(event) => setForm((prev) => ({ ...prev, meetingDate: event.target.value }))} required />
                    </label>
                    <label>
                      Start Time
                      <input type="time" value={form.startTime} onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))} required />
                    </label>
                    <label>
                      End Time
                      <input type="time" value={form.endTime} onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))} required />
                    </label>
                    <label>
                      Location
                      <input value={form.location} onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))} />
                    </label>
                    <label className="span-2">
                      Participants
                      <input value={form.participants} onChange={(event) => setForm((prev) => ({ ...prev, participants: event.target.value }))} placeholder="Comma separated names or emails" />
                    </label>
                  </div>
                ) : null}

                {form.activityType === "call" ? (
                  <div className="activity-form-grid">
                    <label>
                      Call Type
                      <select value={form.callType} onChange={(event) => setForm((prev) => ({ ...prev, callType: event.target.value }))}>
                        <option value="Inbound">Inbound</option>
                        <option value="Outbound">Outbound</option>
                      </select>
                    </label>
                    <label>
                      Call Date
                      <input type="date" value={form.callDate} onChange={(event) => setForm((prev) => ({ ...prev, callDate: event.target.value }))} required />
                    </label>
                    <label>
                      Call Time
                      <input type="time" value={form.callTime} onChange={(event) => setForm((prev) => ({ ...prev, callTime: event.target.value }))} required />
                    </label>
                    <label>
                      Duration (mins)
                      <input type="number" min="0" value={form.callDuration} onChange={(event) => setForm((prev) => ({ ...prev, callDuration: event.target.value }))} />
                    </label>
                    <label>
                      Status
                      <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                <label className="full-width">
                  Description / Notes
                  <textarea
                    rows="4"
                    value={form.activityType === "call" ? form.callNotes : form.description}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((prev) => (
                        prev.activityType === "call"
                          ? { ...prev, callNotes: value, description: value }
                          : { ...prev, description: value }
                      ));
                    }}
                  />
                </label>

                <div className="activity-checkboxes">
                  <label>
                    <input
                      type="checkbox"
                      checked={form.reminderChannels?.popup || false}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          reminderChannels: { ...prev.reminderChannels, popup: event.target.checked },
                        }))
                      }
                    />
                    Popup notification
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={form.reminderChannels?.email || false}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          reminderChannels: { ...prev.reminderChannels, email: event.target.checked },
                        }))
                      }
                    />
                    Email reminder
                  </label>
                </div>

                <div className="activity-form-actions">
                  <button type="button" className="secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="activity-primary-btn">
                    {editingActivity ? "Save Activity" : "Create Activity"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ActivityModule;
