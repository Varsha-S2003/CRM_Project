import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
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
const CHART_COLORS = ["#202124", "#efb521", "#46b84d", "#9dc63b"];
const TASK_BOARD_COLUMNS = ["Not Started", "Deferred", "In Progress", "Completed"];
const MEETING_BOARD_COLUMNS = ["Scheduled", "Today", "Completed", "Cancelled"];
const CALL_BOARD_COLUMNS = ["Scheduled", "Today", "Completed", "Missed"];
const OUTCOME_OPTIONS = [
  { value: "", label: "Select outcome" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "no_response", label: "No Response" },
  { value: "follow_up_needed", label: "Follow-up Needed" },
];
const STAGE_OPTIONS = [
  { value: "", label: "Select stage" },
  { value: "contacted", label: "Contacted" },
  { value: "meeting", label: "Meeting" },
  { value: "qualified", label: "Qualified" },
];
const FOLLOW_UP_TYPE_OPTIONS = [
  { value: "", label: "Auto (recommended)" },
  { value: "task", label: "Task" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
];
const COMPLETE_OUTCOME_OPTIONS = [
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "no_response", label: "No Response" },
  { value: "follow_up_needed", label: "Follow-up Needed" },
];
const MODULE_CONFIG = {
  all: {
    title: "Activity Module",
    description: "Tasks, meetings, calls, reminders, calendar scheduling, and linked CRM timelines.",
    addLabel: "Add Activity",
    sectionLabel: "Activities",
    timelineLabel: "customer interactions",
  },
  task: {
    title: "Tasks",
    description: "Track pending work, follow-ups, reminders, and overdue task execution.",
    addLabel: "Add Task",
    sectionLabel: "Tasks",
    timelineLabel: "task updates",
  },
  meeting: {
    title: "Meetings",
    description: "Manage scheduled meetings, participants, timing, and follow-up planning.",
    addLabel: "Add Meeting",
    sectionLabel: "Meetings",
    timelineLabel: "meeting activity",
  },
  call: {
    title: "Calls",
    description: "Track call schedules, outcomes, reminders, and customer call history.",
    addLabel: "Add Call",
    sectionLabel: "Calls",
    timelineLabel: "call activity",
  },
};

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
  outcome: "",
  requiresFollowUp: false,
  stage: "",
  followUpType: "",
  followUpInDays: 1,
});

const getDefaultStageByActivityType = (type) => {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "call") return "contacted";
  if (normalized === "meeting") return "meeting";
  if (normalized === "task") return "qualified";
  return "";
};

const parseDateValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildDateTime = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;
  return parseDateValue(`${dateValue}T${timeValue}`);
};

const pad2 = (value) => String(value).padStart(2, "0");

const toLocalDateInputValue = (value) => {
  const date = value instanceof Date ? value : parseDateValue(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const toLocalTimeInputValue = (value) => {
  const date = value instanceof Date ? value : parseDateValue(value);
  if (!date) return "";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

const toLocalDateTimeInputValue = (value) => {
  const date = value instanceof Date ? value : parseDateValue(value);
  if (!date) return "";
  return `${toLocalDateInputValue(date)}T${toLocalTimeInputValue(date)}`;
};

const getDraftReferenceDate = (draft) => {
  if (!draft) return null;
  if (draft.activityType === "task") {
    return parseDateValue(draft.dueDate);
  }
  if (draft.activityType === "meeting") {
    return buildDateTime(draft.meetingDate, draft.startTime);
  }
  if (draft.activityType === "call") {
    return buildDateTime(draft.callDate, draft.callTime);
  }
  return null;
};

const validateActivityForm = (draft) => {
  const errors = {};
  const title = String(draft.title || "").trim();
  const emailReminderEnabled = Boolean(draft.reminderChannels?.email);
  const normalizedStatus = String(draft.status || "").toLowerCase();

  if (!title) {
    errors.title = "Title is required.";
  }

  if (!draft.owner) {
    errors.owner = "Owner is required.";
  }

  if (!draft.relatedType) {
    errors.relatedType = "Related module is required.";
  }

  if (!draft.relatedId) {
    errors.relatedId = "Related record is required.";
  }

  if (emailReminderEnabled && !draft.reminderTime) {
    errors.reminderTime = "Choose a reminder time when email reminder is enabled.";
  }

  if (draft.reminderTime) {
    const reminderDate = parseDateValue(draft.reminderTime);
    if (!reminderDate) {
      errors.reminderTime = "Reminder time is invalid.";
    }
  }

  if (draft.activityType === "task") {
    const dueDate = parseDateValue(draft.dueDate);
    if (!draft.dueDate || !dueDate) {
      errors.dueDate = "Due date and time are required.";
    }

    if (draft.reminderTime && dueDate) {
      const reminderDate = parseDateValue(draft.reminderTime);
      if (reminderDate && reminderDate > dueDate) {
        errors.reminderTime = "Reminder must be before the task due date.";
      }
    }
  }

  if (draft.activityType === "meeting") {
    if (!draft.meetingDate) {
      errors.meetingDate = "Meeting date is required.";
    }
    if (!draft.startTime) {
      errors.startTime = "Start time is required.";
    }
    if (!draft.endTime) {
      errors.endTime = "End time is required.";
    }

    const meetingStart = buildDateTime(draft.meetingDate, draft.startTime);
    const meetingEnd = buildDateTime(draft.meetingDate, draft.endTime);
    if (meetingStart && meetingEnd && meetingEnd <= meetingStart) {
      errors.endTime = "End time must be after start time.";
    }

    if (draft.reminderTime && meetingStart) {
      const reminderDate = parseDateValue(draft.reminderTime);
      if (reminderDate && reminderDate > meetingStart) {
        errors.reminderTime = "Reminder must be before the meeting start time.";
      }
    }
  }

  if (draft.activityType === "call") {
    if (!draft.callDate) {
      errors.callDate = "Call date is required.";
    }
    if (!draft.callTime) {
      errors.callTime = "Call time is required.";
    }

    const callStart = buildDateTime(draft.callDate, draft.callTime);
    const parsedDuration = Number(draft.callDuration);
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0 || parsedDuration > 1440) {
      errors.callDuration = "Duration must be between 1 and 1440 minutes.";
    }

    if (draft.reminderTime && callStart) {
      const reminderDate = parseDateValue(draft.reminderTime);
      if (reminderDate && reminderDate > callStart) {
        errors.reminderTime = "Reminder must be before the call time.";
      }
    }
  }

  if (normalizedStatus === "completed") {
    if (!String(draft.outcome || "").trim()) {
      errors.outcome = "Outcome is required when activity is completed.";
    }
    if (!String(draft.stage || "").trim()) {
      errors.stage = "Stage is required when activity is completed.";
    }
  }

  if (draft.requiresFollowUp) {
    const followUpDays = Number(draft.followUpInDays);
    if (!Number.isFinite(followUpDays) || followUpDays < 1 || followUpDays > 30) {
      errors.followUpInDays = "Follow-up days must be between 1 and 30.";
    }
  }

  return errors;
};

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

const getTodayDateInputValue = () => {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
};

const getCurrentDateTimeInputValue = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const getTaskBoardStatus = (status) => {
  const normalized = (status || "").toLowerCase();
  if (normalized === "completed") return "Completed";
  if (normalized === "deferred") return "Deferred";
  if (normalized === "in progress" || normalized === "inprogress") return "In Progress";
  return "Not Started";
};

const getMeetingBoardStatus = (meeting) => {
  const normalized = (meeting.status || "").toLowerCase();
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled") return "Cancelled";

  const sourceDate = new Date(meeting.startDateTime || meeting.createdAt);
  if (!Number.isNaN(sourceDate.getTime()) && sourceDate.toDateString() === new Date().toDateString()) {
    return "Today";
  }

  return "Scheduled";
};

const getCallBoardStatus = (call) => {
  const normalized = (call.status || "").toLowerCase();
  if (normalized === "completed") return "Completed";
  if (normalized === "missed" || normalized === "cancelled") return "Missed";

  const sourceDate = new Date(call.startDateTime || call.createdAt);
  if (!Number.isNaN(sourceDate.getTime()) && sourceDate.toDateString() === new Date().toDateString()) {
    return "Today";
  }

  return "Scheduled";
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = searchParams.get("type");
  const [activities, setActivities] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [users, setUsers] = useState([]);
  const [relatedOptions, setRelatedOptions] = useState([]);
  const [activeSidebar, setActiveSidebar] = useState(
    ["task", "meeting", "call"].includes(initialType) ? initialType : "all"
  );
  const [filter, setFilter] = useState("all");
  const [activityType, setActivityType] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("month");
  const [form, setForm] = useState({ reminderChannels: { popup: true, email: false } });
  const [formErrors, setFormErrors] = useState({});
  const [toast, setToast] = useState(null);
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalSubmitMessage, setProposalSubmitMessage] = useState("");
  const [proposalSubmitError, setProposalSubmitError] = useState(false);
  const [proposalTargetLead, setProposalTargetLead] = useState({ id: "", name: "", email: "" });
  const [proposalForm, setProposalForm] = useState({
    subject: "",
    amount: "",
    currency: "INR",
    validUntil: "",
    message: "",
    terms: "",
    email: "",
    sendEmail: true,
  });
  const [reminderPopups, setReminderPopups] = useState([]);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completionTarget, setCompletionTarget] = useState(null);
  const [completionForm, setCompletionForm] = useState({
    outcome: "",
    reason: "",
    rescheduleDateTime: "",
  });
  const [returnToRequestsAfterSubmit, setReturnToRequestsAfterSubmit] = useState(false);
  const [redirectAfterProposalSubmit, setRedirectAfterProposalSubmit] = useState("");
  const autoOpenKeyRef = useRef("");
  const autoOpenProposalKeyRef = useRef("");
  const seenReminderIdsRef = useRef(new Set());

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
    const items = res.data.notifications || [];
    setNotifications(items);

    items.forEach((item) => {
      const key = String(item.id || item._id || "");
      if (!key || seenReminderIdsRef.current.has(key)) {
        return;
      }

      seenReminderIdsRef.current.add(key);
      const message = `${item.title} starts at ${formatDateTime(item.reminderTime)}`;
      setToast(message);

      setReminderPopups((prev) => [
        ...prev,
        {
          id: key,
          title: item.title || "Upcoming activity",
          type: item.type || "activity",
          relatedTo: item.relatedTo?.recordName || "Lead",
          reminderTime: item.reminderTime,
          message,
        },
      ]);

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        const notification = new Notification("CRM Reminder", {
          body: `${item.title} (${item.type}) in 5 minutes`,
        });
        notification.onclick = () => {
          window.focus();
        };
      }

      setTimeout(() => {
        setReminderPopups((prev) => prev.filter((popup) => popup.id !== key));
      }, 12000);
    });
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
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const nextType = searchParams.get("type");
    if (["task", "meeting", "call"].includes(nextType)) {
      setActiveSidebar(nextType);
      return;
    }
    setActiveSidebar("all");
  }, [searchParams]);

  useEffect(() => {
    const shouldOpenProposal = searchParams.get("createProposal") === "1";
    if (!shouldOpenProposal) return;

    const autoOpenKey = searchParams.toString();
    if (autoOpenProposalKeyRef.current === autoOpenKey) {
      return;
    }
    autoOpenProposalKeyRef.current = autoOpenKey;

    const leadId = searchParams.get("relatedId") || "";
    const leadName = searchParams.get("relatedName") || "Lead";
    const leadEmail = searchParams.get("relatedEmail") || "";
    const returnTo = String(searchParams.get("returnTo") || "").toLowerCase();
    setRedirectAfterProposalSubmit(returnTo === "leads" ? "/leads" : returnTo === "requests" ? "/requests" : "");

    setProposalTargetLead({ id: leadId, name: leadName, email: leadEmail });
    setProposalForm({
      subject: `Proposal for ${leadName || "Customer"}`,
      amount: "",
      currency: "INR",
      validUntil: "",
      message: "",
      terms: "",
      email: leadEmail,
      sendEmail: true,
    });
    setShowProposalModal(true);

    const nextParams = new URLSearchParams(searchParams);
    ["createProposal", "relatedType", "relatedId", "relatedName", "relatedEmail", "source", "returnTo"].forEach((key) => nextParams.delete(key));
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const shouldAutoOpen = searchParams.get("create") === "1";
    if (!shouldAutoOpen || !relatedOptions.length) {
      return;
    }

    const autoOpenKey = searchParams.toString();
    if (autoOpenKeyRef.current === autoOpenKey) {
      return;
    }
    autoOpenKeyRef.current = autoOpenKey;

    const requestedType = String(searchParams.get("type") || "task").toLowerCase();
    const activityType = ["task", "meeting", "call"].includes(requestedType) ? requestedType : "task";
    const relatedTypeParam = searchParams.get("relatedType") || "Lead";
    const relatedIdParam = searchParams.get("relatedId") || "";
    const relatedNameParam = searchParams.get("relatedName") || "Lead";
    const source = String(searchParams.get("source") || "").toLowerCase();
    setReturnToRequestsAfterSubmit(source === "requests");

    const byType = relatedOptions.filter((option) => option.type === relatedTypeParam);
    const selectedRecord =
      byType.find((option) => option.id === relatedIdParam) ||
      byType[0] ||
      relatedOptions[0];

    const today = toLocalDateInputValue(new Date());
    const prefix = activityType === "call" ? "Call" : activityType === "meeting" ? "Meeting" : "Task";

    setEditingActivity(null);
    setForm({
      ...createDefaultForm(currentUserId, relatedOptions),
      activityType,
      status: activityType === "task" ? "Pending" : "Scheduled",
      stage: getDefaultStageByActivityType(activityType),
      relatedType: selectedRecord?.type || relatedTypeParam,
      relatedId: selectedRecord?.id || relatedIdParam,
      title: `${prefix}: ${relatedNameParam || selectedRecord?.name || "Lead"}`,
      callDate: activityType === "call" ? today : "",
      meetingDate: activityType === "meeting" ? today : "",
    });
    setShowModal(true);

    const nextParams = new URLSearchParams(searchParams);
    ["create", "relatedType", "relatedId", "relatedName", "source"].forEach((key) => nextParams.delete(key));
    setSearchParams(nextParams, { replace: true });
  }, [currentUserId, relatedOptions, searchParams, setSearchParams]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openCreateModal = () => {
    const nextDefaultType = ["task", "meeting", "call"].includes(activeSidebar) ? activeSidebar : "task";
    setEditingActivity(null);
    setFormErrors({});
    setForm({
      ...createDefaultForm(currentUserId, relatedOptions),
      activityType: nextDefaultType,
      status: nextDefaultType === "task" ? "Pending" : "Scheduled",
      stage: getDefaultStageByActivityType(nextDefaultType),
    });
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
  const minDate = useMemo(() => getTodayDateInputValue(), []);
  const minDateTime = useMemo(() => getCurrentDateTimeInputValue(), []);
  const currentModule = MODULE_CONFIG[activeSidebar] || MODULE_CONFIG.all;
  const clearFieldError = (field) => {
    setFormErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormErrors({});
  };

  const closeProposalModal = () => {
    setShowProposalModal(false);
    setProposalTargetLead({ id: "", name: "", email: "" });
    setProposalSubmitMessage("");
    setProposalSubmitError(false);
    setRedirectAfterProposalSubmit("");
  };

  const closeCompleteModal = () => {
    setShowCompleteModal(false);
    setCompletionTarget(null);
    setCompletionForm({
      outcome: "",
      reason: "",
      rescheduleDateTime: "",
    });
  };

  const handleProposalFieldChange = (field, value) => {
    setProposalForm((prev) => ({ ...prev, [field]: value }));
    if (proposalSubmitMessage) {
      setProposalSubmitMessage("");
      setProposalSubmitError(false);
    }
  };

  const handleCreateAndSendProposal = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (proposalBusy) return;

    const subjectText = String(proposalForm.subject || "").trim();
    if (!subjectText) {
      setProposalSubmitMessage("Subject is required.");
      setProposalSubmitError(true);
      return;
    }

    if (!proposalTargetLead.id) {
      setProposalSubmitMessage("Lead information is missing for proposal.");
      setProposalSubmitError(true);
      return;
    }

    if (proposalForm.sendEmail && !String(proposalForm.email || "").trim()) {
      setProposalSubmitMessage("Customer email is required to send proposal.");
      setProposalSubmitError(true);
      return;
    }

    const amountText = String(proposalForm.amount ?? "").trim();
    if (amountText && Number.isNaN(Number(amountText))) {
      setProposalSubmitMessage("Proposal amount must be a valid number.");
      setProposalSubmitError(true);
      return;
    }

    try {
      setProposalSubmitMessage("");
      setProposalSubmitError(false);
      setProposalBusy(true);
      const payload = {
        subject: subjectText,
        amount: amountText === "" ? null : Number(amountText),
        currency: proposalForm.currency,
        validUntil: proposalForm.validUntil || null,
        message: proposalForm.message,
        terms: proposalForm.terms,
        email: proposalForm.email,
        sendEmail: proposalForm.sendEmail,
      };

      const res = await axios.post(
        `http://localhost:5000/api/leads/${proposalTargetLead.id}/proposal`,
        payload,
        { headers: apiHeaders }
      );

      const previewText = res.data?.emailPreviewUrl ? ` Preview: ${res.data.emailPreviewUrl}` : "";
      setProposalSubmitMessage(res.data?.message || "Proposal created successfully.");
      setProposalSubmitError(false);
      setToast(`${res.data?.message || "Proposal created"}.${previewText}`.trim());
      setShowProposalModal(false);
      if (redirectAfterProposalSubmit) {
        navigate(redirectAfterProposalSubmit);
        return;
      }
      await refreshAll();
    } catch (error) {
      const message = error.response?.data?.message || "Failed to create proposal.";
      setProposalSubmitMessage(message);
      setProposalSubmitError(true);
      setToast(message);
    } finally {
      setProposalBusy(false);
    }
  };

  const applyReminderPreset = (minutesBefore) => {
    const referenceDate = getDraftReferenceDate(form);
    if (!referenceDate) {
      setToast("Set call/meeting/task schedule first, then apply a reminder preset.");
      return;
    }

    const reminderDate = new Date(referenceDate.getTime() - minutesBefore * 60 * 1000);
    if (Number.isNaN(reminderDate.getTime())) {
      setToast("Unable to calculate reminder time.");
      return;
    }

    setForm((prev) => ({
      ...prev,
      reminderTime: toLocalDateTimeInputValue(reminderDate),
    }));
    clearFieldError("reminderTime");
  };

  const taskBoardColumns = useMemo(() => {
    const columns = TASK_BOARD_COLUMNS.reduce((acc, label) => ({ ...acc, [label]: [] }), {});
    activities.forEach((activity) => {
      columns[getTaskBoardStatus(activity.status)].push(activity);
    });
    return columns;
  }, [activities]);
  const meetingBoardColumns = useMemo(() => {
    const columns = MEETING_BOARD_COLUMNS.reduce((acc, label) => ({ ...acc, [label]: [] }), {});
    activities.forEach((activity) => {
      columns[getMeetingBoardStatus(activity)].push(activity);
    });
    return columns;
  }, [activities]);
  const callBoardColumns = useMemo(() => {
    const columns = CALL_BOARD_COLUMNS.reduce((acc, label) => ({ ...acc, [label]: [] }), {});
    activities.forEach((activity) => {
      columns[getCallBoardStatus(activity)].push(activity);
    });
    return columns;
  }, [activities]);
  const filteredDashboardToday = useMemo(
    () => (dashboard?.today || []).filter((item) => activeSidebar === "all" || item.activityType === activeSidebar),
    [activeSidebar, dashboard]
  );
  const filteredDashboardUpcoming = useMemo(
    () => (dashboard?.upcoming || []).filter((item) => activeSidebar === "all" || item.activityType === activeSidebar),
    [activeSidebar, dashboard]
  );
  const filteredDashboardOverdue = useMemo(
    () => (dashboard?.overdue || []).filter((item) => activeSidebar === "all" || item.activityType === activeSidebar),
    [activeSidebar, dashboard]
  );
  const statsCards = useMemo(() => {
    if (activeSidebar === "all") {
      return dashboard?.summary
        ? [
            { label: "Today's Activities", value: dashboard.summary.today, tone: "blue" },
            { label: "Upcoming", value: dashboard.summary.upcoming, tone: "orange" },
            { label: "Overdue", value: dashboard.summary.overdue, tone: "red" },
            { label: "Completed", value: dashboard.summary.completed, tone: "green" },
          ]
        : [];
    }

    const selectedActivities = activities.filter((item) => item.activityType === activeSidebar);
    const upcomingCount = selectedActivities.filter((item) => {
      const sourceDate = new Date(item.startDateTime || item.dueDate || item.createdAt);
      return sourceDate >= startOfDay(new Date()) && item.status !== "Completed";
    }).length;
    const overdueCount = selectedActivities.filter((item) => {
      const sourceDate = new Date(item.startDateTime || item.dueDate || item.createdAt);
      return sourceDate < startOfDay(new Date()) && item.status !== "Completed";
    }).length;
    const completedCount = selectedActivities.filter((item) => item.status === "Completed").length;

    return [
      { label: `Today's ${currentModule.sectionLabel}`, value: filteredDashboardToday.length, tone: "blue" },
      { label: `Upcoming ${currentModule.sectionLabel}`, value: upcomingCount, tone: "orange" },
      { label: `Overdue ${currentModule.sectionLabel}`, value: overdueCount, tone: "red" },
      { label: `Completed ${currentModule.sectionLabel}`, value: completedCount, tone: "green" },
    ];
  }, [activeSidebar, activities, currentModule.sectionLabel, dashboard, filteredDashboardToday.length]);

  const openEditModal = (activity) => {
    setEditingActivity(activity);
    setFormErrors({});
    setForm({
      activityType: activity.activityType,
      title: activity.title || "",
      description: activity.description || "",
      owner: activity.owner?._id || "",
      dueDate: toLocalDateTimeInputValue(activity.dueDate),
      priority: activity.priority || "Medium",
      status: activity.status || "Pending",
      relatedType: activity.relatedTo?.recordType || "Lead",
      relatedId: activity.relatedTo?.recordId?._id || activity.relatedTo?.recordId || "",
      reminderTime: toLocalDateTimeInputValue(activity.reminderTime),
      reminderChannels: {
        popup: activity.reminderChannels?.popup ?? true,
        email: activity.reminderChannels?.email ?? false,
      },
      recurrence: activity.recurrence || "none",
      location: activity.location || "",
      participants: activity.participants?.join(", ") || "",
      meetingDate: toLocalDateInputValue(activity.startDateTime),
      startTime: toLocalTimeInputValue(activity.startDateTime),
      endTime: toLocalTimeInputValue(activity.endDateTime),
      callType: activity.call?.callType || "Outbound",
      callDuration: activity.call?.callDuration || 30,
      callNotes: activity.call?.callNotes || "",
      callDate: toLocalDateInputValue(activity.startDateTime),
      callTime: toLocalTimeInputValue(activity.startDateTime),
      outcome: activity.outcome || "",
      requiresFollowUp: Boolean(activity.requiresFollowUp),
      stage: activity.stage || getDefaultStageByActivityType(activity.activityType),
      followUpType: activity.followUpType || "",
      followUpInDays: Number(activity.followUpInDays) || 1,
    });
    setShowModal(true);
  };

  const submitActivity = async (event) => {
    event.preventDefault();
    const validationErrors = validateActivityForm(form);
    if (Object.keys(validationErrors).length) {
      setFormErrors(validationErrors);
      setToast("Please fix validation errors before saving.");
      return;
    }

    setFormErrors({});
    const normalizedReminderTime = parseDateValue(form.reminderTime);
    const normalizedDueDate = parseDateValue(form.dueDate);
    const normalizedMeetingStart = buildDateTime(form.meetingDate, form.startTime);
    const normalizedMeetingEnd = buildDateTime(form.meetingDate, form.endTime);
    const normalizedCallStart = buildDateTime(form.callDate, form.callTime);

    const payload = {
      ...form,
      reminderTime: normalizedReminderTime ? normalizedReminderTime.toISOString() : null,
      dueDate: normalizedDueDate ? normalizedDueDate.toISOString() : null,
      startDateTime:
        form.activityType === "meeting"
          ? (normalizedMeetingStart ? normalizedMeetingStart.toISOString() : null)
          : form.activityType === "call"
            ? (normalizedCallStart ? normalizedCallStart.toISOString() : null)
            : undefined,
      endDateTime:
        form.activityType === "meeting"
          ? (normalizedMeetingEnd ? normalizedMeetingEnd.toISOString() : null)
          : undefined,
      participants: form.participants,
      outcome: form.outcome || "",
      requiresFollowUp: Boolean(form.requiresFollowUp),
      stage: form.stage || "",
      followUpType: form.requiresFollowUp ? (form.followUpType || "") : "",
      followUpInDays: form.requiresFollowUp ? Number(form.followUpInDays || 1) : 1,
      taskTitle: form.activityType === "task" ? form.title : undefined,
      meetingTitle: form.activityType === "meeting" ? form.title : undefined,
      callSubject: form.activityType === "call" ? form.title : undefined,
      callStatus: form.activityType === "call" ? form.status : undefined,
    };

    try {
      if (editingActivity) {
        await axios.put(`http://localhost:5000/api/activities/${editingActivity._id}`, payload, { headers: apiHeaders });
      } else {
        await axios.post("http://localhost:5000/api/activities", payload, { headers: apiHeaders });
      }

      setShowModal(false);
      setToast("Activity saved successfully.");
      if (returnToRequestsAfterSubmit) {
        navigate("/requests");
        return;
      }
      await refreshAll();
    } catch (error) {
      setToast(error.response?.data?.message || "Failed to save activity.");
    }
  };

  const handleDelete = async (activityId) => {
    if (!window.confirm("Delete this activity?")) return;
    await axios.delete(`http://localhost:5000/api/activities/${activityId}`, { headers: apiHeaders });
    await refreshAll();
  };

  const openCompleteModal = (activity) => {
    setCompletionTarget(activity);
    setCompletionForm({
      outcome: "",
      reason: "",
      rescheduleDateTime: "",
    });
    setShowCompleteModal(true);
  };

  const handleComplete = async () => {
    if (!completionTarget?._id) return;

    const outcome = String(completionForm.outcome || "").trim();
    const reason = String(completionForm.reason || "").trim();
    const needsReason = ["not_interested", "no_response", "follow_up_needed"].includes(outcome);
    const needsReschedule = ["no_response", "follow_up_needed"].includes(outcome);

    if (!outcome) {
      setToast("Please choose completion outcome.");
      return;
    }

    if (needsReason && !reason) {
      setToast(outcome === "not_interested" ? "Please enter reason for Not Interested." : "Please enter follow-up reason.");
      return;
    }

    const parsedReschedule = needsReschedule ? parseDateValue(completionForm.rescheduleDateTime) : null;
    if (needsReschedule && !parsedReschedule) {
      setToast("Please select valid reschedule date and time.");
      return;
    }

    try {
      setCompleteBusy(true);
      const payload = {
        outcome,
        stage: getDefaultStageByActivityType(completionTarget.activityType),
        outcomeReason: reason,
        rescheduleDateTime: parsedReschedule ? parsedReschedule.toISOString() : null,
      };

      await axios.post(
        `http://localhost:5000/api/activities/${completionTarget._id}/complete`,
        payload,
        { headers: apiHeaders }
      );

      setToast(
        needsReschedule
          ? "Activity completed and follow-up has been rescheduled."
          : "Activity completed successfully."
      );
      closeCompleteModal();
      await refreshAll();
    } catch (error) {
      setToast(error.response?.data?.message || "Failed to complete activity.");
    } finally {
      setCompleteBusy(false);
    }
  };

  const handleReschedule = async (activity) => {
    const defaultDateTime = toLocalDateTimeInputValue(activity.startDateTime || activity.dueDate || Date.now());
    const nextValue = window.prompt(
      "Enter the new datetime in YYYY-MM-DDTHH:mm format",
      defaultDateTime
    );
    if (!nextValue) return;

    const parsedNext = parseDateValue(nextValue);
    if (!parsedNext) {
      setToast("Invalid datetime format. Use YYYY-MM-DDTHH:mm");
      return;
    }

    const nextIso = parsedNext.toISOString();
    const payload = activity.activityType === "task"
      ? { dueDate: nextIso, reminderTime: nextIso }
      : { startDateTime: nextIso, reminderTime: nextIso };
    await axios.post(`http://localhost:5000/api/activities/${activity._id}/reschedule`, payload, { headers: apiHeaders });
    await refreshAll();
  };

  const renderTaskBoard = () => (
    <div className="task-page">
      <div className="task-page__header">
        <div>
          <h1>Tasks</h1>
        </div>
        <div className="task-page__top-actions">
          <div className="task-page__search">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search records"
            />
          </div>
          <button className="task-page__create-btn" onClick={openCreateModal}>Create Task</button>
        </div>
      </div>

      <div className="task-page__viewbar">
        <button className="task-page__view-pill active">All Tasks</button>
      </div>

      <div className="task-page__toolbar">
        <div className="task-page__toolbar-right">
          <select value={filter} onChange={(event) => setFilter(event.target.value)} className="task-page__select">
            <option value="all">Tasks by Status</option>
            {FILTER_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="task-page__select">
            <option value="all">All Owners</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>{user.name || user.username}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="task-page__select">
            <option value="all">All Priorities</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="task-board-layout">
        <div className="task-board-scroll">
          <section className="task-board">
            {TASK_BOARD_COLUMNS.map((column) => (
              <div key={column} className="task-column">
                <div className="task-column__header">
                  <div className="task-column__title">
                    <span>{column}</span>
                    <strong>{taskBoardColumns[column]?.length || 0}</strong>
                  </div>
                </div>
                <div className="task-column__body">
                  {(taskBoardColumns[column] || []).length === 0 ? (
                    <div className="task-column__empty">No Tasks found.</div>
                  ) : (
                    (taskBoardColumns[column] || []).map((task) => (
                      <article key={task._id} className="task-card">
                        <button className="task-card__edit" onClick={() => openEditModal(task)} aria-label="Edit task">
                          +
                        </button>
                        <h3>{task.title}</h3>
                        <p>{formatDate(task.startDateTime || task.dueDate)}</p>
                        <p>{task.priority}</p>
                        <p>{task.owner?.name || task.owner?.username || "-"}</p>
                        <p>{task.relatedTo?.recordName || "-"}</p>
                        <div className="task-card__actions">
                          {task.status !== "Completed" ? (
                            <button onClick={() => openCompleteModal(task)}>Complete</button>
                          ) : null}
                          <button onClick={() => handleReschedule(task)}>Reschedule</button>
                          <button onClick={() => handleDelete(task._id)}>Delete</button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );

  const renderMeetingBoard = () => (
    <div className="task-page meeting-page">
      <div className="task-page__header">
        <div>
          <h1>Meetings</h1>
        </div>
        <div className="task-page__top-actions">
          <div className="task-page__search">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search meetings"
            />
          </div>
          <button className="task-page__create-btn" onClick={openCreateModal}>Create Meeting</button>
        </div>
      </div>

      <div className="task-page__viewbar">
        <button className="task-page__view-pill active">All Meetings</button>
      </div>

      <div className="task-page__toolbar">
        <div className="task-page__toolbar-right">
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="task-page__select">
            <option value="all">All Owners</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>{user.name || user.username}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="task-page__select">
            <option value="all">All Priorities</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="task-board-layout">
        <div className="task-board-scroll">
          <section className="task-board">
            {MEETING_BOARD_COLUMNS.map((column) => (
              <div key={column} className="task-column">
                <div className="task-column__header meeting-column__header">
                  <div className="task-column__title">
                    <span>{column}</span>
                    <strong>{meetingBoardColumns[column]?.length || 0}</strong>
                  </div>
                </div>
                <div className="task-column__body">
                  {(meetingBoardColumns[column] || []).length === 0 ? (
                    <div className="task-column__empty">No Meetings found.</div>
                  ) : (
                    (meetingBoardColumns[column] || []).map((meeting) => (
                      <article key={meeting._id} className="task-card meeting-card">
                        <button className="task-card__edit" onClick={() => openEditModal(meeting)} aria-label="Edit meeting">
                          +
                        </button>
                        <h3>{meeting.title}</h3>
                        <p>{formatDateTime(meeting.startDateTime || meeting.dueDate)}</p>
                        <p>{meeting.location || "No location"}</p>
                        <p>{meeting.owner?.name || meeting.owner?.username || "-"}</p>
                        <p>{meeting.relatedTo?.recordName || "-"}</p>
                        <div className="task-card__actions">
                          {meeting.status !== "Completed" ? (
                            <button onClick={() => openCompleteModal(meeting)}>Complete</button>
                          ) : null}
                          <button onClick={() => handleReschedule(meeting)}>Reschedule</button>
                          <button onClick={() => handleDelete(meeting._id)}>Delete</button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );

  const renderCallBoard = () => (
    <div className="task-page call-page">
      <div className="task-page__header">
        <div>
          <h1>Calls</h1>
        </div>
        <div className="task-page__top-actions">
          <div className="task-page__search">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search calls"
            />
          </div>
          <button className="task-page__create-btn" onClick={openCreateModal}>Create Call</button>
        </div>
      </div>

      <div className="task-page__viewbar">
        <button className="task-page__view-pill active">All Calls</button>
      </div>

      <div className="task-page__toolbar">
        <div className="task-page__toolbar-right">
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="task-page__select">
            <option value="all">All Owners</option>
            {users.map((user) => (
              <option key={user._id} value={user._id}>{user.name || user.username}</option>
            ))}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="task-page__select">
            <option value="all">All Priorities</option>
            {PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="task-board-layout">
        <div className="task-board-scroll">
          <section className="task-board">
            {CALL_BOARD_COLUMNS.map((column) => (
              <div key={column} className="task-column">
                <div className="task-column__header call-column__header">
                  <div className="task-column__title">
                    <span>{column}</span>
                    <strong>{callBoardColumns[column]?.length || 0}</strong>
                  </div>
                </div>
                <div className="task-column__body">
                  {(callBoardColumns[column] || []).length === 0 ? (
                    <div className="task-column__empty">No Calls found.</div>
                  ) : (
                    (callBoardColumns[column] || []).map((call) => (
                      <article key={call._id} className="task-card call-card">
                        <button className="task-card__edit" onClick={() => openEditModal(call)} aria-label="Edit call">
                          +
                        </button>
                        <h3>{call.title}</h3>
                        <p>{formatDateTime(call.startDateTime || call.dueDate)}</p>
                        <p>{call.call?.callType || "Outbound"}</p>
                        <p>{call.owner?.name || call.owner?.username || "-"}</p>
                        <p>{call.relatedTo?.recordName || "-"}</p>
                        <div className="task-card__actions">
                          {call.status !== "Completed" ? (
                            <button onClick={() => openCompleteModal(call)}>Complete</button>
                          ) : null}
                          <button onClick={() => handleReschedule(call)}>Reschedule</button>
                          <button onClick={() => handleDelete(call._id)}>Delete</button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content activity-module">
        {reminderPopups.length > 0 ? (
          <div className="activity-reminder-popups">
            {reminderPopups.map((popup) => (
              <div key={popup.id} className="activity-reminder-popup" role="alert" aria-live="assertive">
                <button
                  type="button"
                  className="activity-reminder-close"
                  onClick={() => setReminderPopups((prev) => prev.filter((item) => item.id !== popup.id))}
                  aria-label="Dismiss reminder"
                >
                  x
                </button>
                <div className="activity-reminder-title">Reminder: {popup.title}</div>
                <div className="activity-reminder-meta">{String(popup.type || "").toUpperCase()} • {popup.relatedTo}</div>
                <div className="activity-reminder-time">Starts at {formatDateTime(popup.reminderTime)}</div>
              </div>
            ))}
          </div>
        ) : null}
        {activeSidebar === "task" ? renderTaskBoard() : activeSidebar === "meeting" ? renderMeetingBoard() : activeSidebar === "call" ? renderCallBoard() : (
        <>
        <div className="activity-topbar">
          <div>
            <h1>{currentModule.title}</h1>
            <p>{currentModule.description}</p>
          </div>
          <div className="activity-topbar__actions">
            <div className="notification-badge">
              Notifications
              <span>{notifications.length}</span>
            </div>
            <button className="activity-primary-btn" onClick={openCreateModal}>
              {currentModule.addLabel}
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
                onClick={() => {
                  setActiveSidebar(item.value);
                  if (["task", "meeting", "call"].includes(item.value)) {
                    setSearchParams({ type: item.value });
                  } else {
                    setSearchParams({});
                  }
                }}
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
              {activeSidebar === "all" ? (
                <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
                  {TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              ) : null}
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
                <h3>Today's {currentModule.sectionLabel}</h3>
                <div className="activity-section-list">
                  {filteredDashboardToday.slice(0, 4).map((item) => (
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
                <h3>Upcoming {currentModule.sectionLabel}</h3>
                <div className="activity-section-list">
                  {filteredDashboardUpcoming.slice(0, 4).map((item) => (
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
                <h3>Overdue {currentModule.sectionLabel}</h3>
                <div className="activity-section-list">
                  {filteredDashboardOverdue.slice(0, 4).map((item) => (
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
                <h2>{currentModule.title} Dashboard</h2>
                <p>
                  {activeSidebar === "all"
                    ? "Unified list of tasks, meetings, and calls with quick actions."
                    : `${currentModule.sectionLabel} only view with quick actions.`}
                </p>
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
                                <button onClick={() => openCompleteModal(activity)}>Complete</button>
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
                    <h2>{currentModule.title} Calendar</h2>
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
                  <h2>{currentModule.title} Reports</h2>
                  <p>
                    {activeSidebar === "all"
                      ? "Tasks completed, overdue tasks, meetings scheduled, and call logs."
                      : `${currentModule.sectionLabel} metrics and ownership breakdown.`}
                  </p>
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
                      <Bar dataKey="count" fill="#efb521" />
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
                <h2>{currentModule.title} Timeline</h2>
                <p>Chronological view of {currentModule.timelineLabel} for quick follow-up.</p>
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
        </>
        )}
        {showModal && typeof document !== "undefined"
          ? createPortal(
            <div className="activity-modal-overlay" onClick={closeModal}>
              <div className="activity-modal" onClick={(event) => event.stopPropagation()}>
                <div className="activity-card-header">
                  <div>
                    <h2>{editingActivity ? "Edit Activity" : "Create Activity"}</h2>
                    <p>Tasks, meetings, and calls share one workflow with type-specific fields.</p>
                  </div>
                </div>

                <form className="activity-form" onSubmit={submitActivity} noValidate>
                <div className="activity-form-grid">
                  <label>
                    Activity Type
                    <select
                      value={form.activityType}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setFormErrors({});
                        setForm((prev) => ({
                          ...prev,
                          activityType: nextType,
                          status: nextType === "task" ? "Pending" : "Scheduled",
                          stage: prev.stage || getDefaultStageByActivityType(nextType),
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
                    <input
                      value={form.title}
                      onChange={(event) => updateField("title", event.target.value)}
                      className={formErrors.title ? "activity-input-error" : ""}
                      required
                    />
                    {formErrors.title ? <span className="activity-form-error">{formErrors.title}</span> : null}
                  </label>
                  <label>
                    Owner
                    <select
                      value={form.owner}
                      onChange={(event) => updateField("owner", event.target.value)}
                      className={formErrors.owner ? "activity-input-error" : ""}
                    >
                      {users.map((user) => (
                        <option key={user._id} value={user._id}>{user.name || user.username}</option>
                      ))}
                    </select>
                    {formErrors.owner ? <span className="activity-form-error">{formErrors.owner}</span> : null}
                  </label>
                  <label>
                    Priority
                    <select value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
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
                        clearFieldError("relatedType");
                        clearFieldError("relatedId");
                      }}
                      className={formErrors.relatedType ? "activity-input-error" : ""}
                    >
                      <option value="Lead">Lead</option>
                      <option value="Contact">Contact</option>
                      <option value="Deal">Deal</option>
                    </select>
                    {formErrors.relatedType ? <span className="activity-form-error">{formErrors.relatedType}</span> : null}
                  </label>
                  <label>
                    Related Record
                    <select
                      value={form.relatedId}
                      onChange={(event) => updateField("relatedId", event.target.value)}
                      className={formErrors.relatedId ? "activity-input-error" : ""}
                    >
                      {relatedByType.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    {formErrors.relatedId ? <span className="activity-form-error">{formErrors.relatedId}</span> : null}
                  </label>
                  <label>
                    Reminder Time
                    <input
                      type="datetime-local"
                      min={minDateTime}
                      value={form.reminderTime}
                      onChange={(event) => updateField("reminderTime", event.target.value)}
                      className={formErrors.reminderTime ? "activity-input-error" : ""}
                    />
                    <small className="activity-form-hint">Required for email reminders. Optional for popup reminders.</small>
                    {formErrors.reminderTime ? <span className="activity-form-error">{formErrors.reminderTime}</span> : null}
                    <div className="activity-reminder-presets" role="group" aria-label="Quick reminder presets">
                      <button type="button" onClick={() => applyReminderPreset(5)}>5m before</button>
                      <button type="button" onClick={() => applyReminderPreset(15)}>15m before</button>
                      <button type="button" onClick={() => applyReminderPreset(30)}>30m before</button>
                    </div>
                  </label>
                  <label>
                    Recurrence
                    <select value={form.recurrence} onChange={(event) => updateField("recurrence", event.target.value)}>
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
                      <input
                        type="datetime-local"
                        min={minDateTime}
                        value={form.dueDate}
                        onChange={(event) => updateField("dueDate", event.target.value)}
                        className={formErrors.dueDate ? "activity-input-error" : ""}
                        required
                      />
                      {formErrors.dueDate ? <span className="activity-form-error">{formErrors.dueDate}</span> : null}
                    </label>
                    <label>
                      Status
                      <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
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
                      <input
                        type="date"
                        min={minDate}
                        value={form.meetingDate}
                        onChange={(event) => updateField("meetingDate", event.target.value)}
                        className={formErrors.meetingDate ? "activity-input-error" : ""}
                        required
                      />
                      {formErrors.meetingDate ? <span className="activity-form-error">{formErrors.meetingDate}</span> : null}
                    </label>
                    <label>
                      Start Time
                      <input
                        type="time"
                        value={form.startTime}
                        onChange={(event) => updateField("startTime", event.target.value)}
                        className={formErrors.startTime ? "activity-input-error" : ""}
                        required
                      />
                      {formErrors.startTime ? <span className="activity-form-error">{formErrors.startTime}</span> : null}
                    </label>
                    <label>
                      End Time
                      <input
                        type="time"
                        value={form.endTime}
                        onChange={(event) => updateField("endTime", event.target.value)}
                        className={formErrors.endTime ? "activity-input-error" : ""}
                        required
                      />
                      {formErrors.endTime ? <span className="activity-form-error">{formErrors.endTime}</span> : null}
                    </label>
                    <label>
                      Location
                      <input value={form.location} onChange={(event) => updateField("location", event.target.value)} />
                    </label>
                    <label className="span-2">
                      Participants
                      <input value={form.participants} onChange={(event) => updateField("participants", event.target.value)} placeholder="Comma separated names or emails" />
                    </label>
                    <label>
                      Status
                      <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {form.activityType === "call" ? (
                  <div className="activity-form-grid">
                    <label>
                      Call Type
                      <select value={form.callType} onChange={(event) => updateField("callType", event.target.value)}>
                        <option value="Inbound">Inbound</option>
                        <option value="Outbound">Outbound</option>
                      </select>
                    </label>
                    <label>
                      Call Date
                      <input
                        type="date"
                        min={minDate}
                        value={form.callDate}
                        onChange={(event) => updateField("callDate", event.target.value)}
                        className={formErrors.callDate ? "activity-input-error" : ""}
                        required
                      />
                      {formErrors.callDate ? <span className="activity-form-error">{formErrors.callDate}</span> : null}
                    </label>
                    <label>
                      Call Time
                      <input
                        type="time"
                        value={form.callTime}
                        onChange={(event) => updateField("callTime", event.target.value)}
                        className={formErrors.callTime ? "activity-input-error" : ""}
                        required
                      />
                      {formErrors.callTime ? <span className="activity-form-error">{formErrors.callTime}</span> : null}
                    </label>
                    <label>
                      Duration (mins)
                      <input
                        type="number"
                        min="1"
                        value={form.callDuration}
                        onChange={(event) => updateField("callDuration", event.target.value)}
                        className={formErrors.callDuration ? "activity-input-error" : ""}
                      />
                      {formErrors.callDuration ? <span className="activity-form-error">{formErrors.callDuration}</span> : null}
                    </label>
                    <label>
                      Status
                      <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                <div className="activity-form-grid">
                  <label>
                    Outcome
                    <select
                      value={form.outcome}
                      onChange={(event) => updateField("outcome", event.target.value)}
                      className={formErrors.outcome ? "activity-input-error" : ""}
                    >
                      {OUTCOME_OPTIONS.map((item) => (
                        <option key={item.value || "none"} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    {formErrors.outcome ? <span className="activity-form-error">{formErrors.outcome}</span> : null}
                    <small className="activity-form-hint">Required when marking activity as completed.</small>
                  </label>
                  <label>
                    Stage
                    <select
                      value={form.stage}
                      onChange={(event) => updateField("stage", event.target.value)}
                      className={formErrors.stage ? "activity-input-error" : ""}
                    >
                      {STAGE_OPTIONS.map((item) => (
                        <option key={item.value || "none"} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    {formErrors.stage ? <span className="activity-form-error">{formErrors.stage}</span> : null}
                    <small className="activity-form-hint">Used by CRM automation for lead progression.</small>
                  </label>
                  <label className="span-2 activity-inline-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(form.requiresFollowUp)}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          requiresFollowUp: checked,
                          followUpType: checked ? prev.followUpType : "",
                          followUpInDays: checked ? (Number(prev.followUpInDays) || 1) : 1,
                        }));
                        clearFieldError("followUpInDays");
                      }}
                    />
                    <span>Requires Follow-up</span>
                  </label>
                  {form.requiresFollowUp ? (
                    <>
                      <label>
                        Follow-up Type
                        <select
                          value={form.followUpType}
                          onChange={(event) => updateField("followUpType", event.target.value)}
                        >
                          {FOLLOW_UP_TYPE_OPTIONS.map((item) => (
                            <option key={item.value || "auto"} value={item.value}>{item.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Follow-up In (days)
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={form.followUpInDays}
                          onChange={(event) => updateField("followUpInDays", event.target.value)}
                          className={formErrors.followUpInDays ? "activity-input-error" : ""}
                        />
                        {formErrors.followUpInDays ? <span className="activity-form-error">{formErrors.followUpInDays}</span> : null}
                      </label>
                    </>
                  ) : null}
                </div>

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
                      clearFieldError("description");
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
                  <button type="button" className="secondary" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="activity-primary-btn">
                    {editingActivity ? "Save Activity" : "Create Activity"}
                  </button>
                </div>
                </form>
              </div>
            </div>,
            document.body
          )
          : null}
        {showProposalModal && typeof document !== "undefined"
          ? createPortal(
            <div className="activity-modal-overlay" onClick={closeProposalModal}>
              <div className="activity-modal" onClick={(event) => event.stopPropagation()}>
                <div className="activity-card-header">
                  <div>
                    <h2>Create Proposal</h2>
                    <p>Create and send proposal for {proposalTargetLead.name || "Lead"}.</p>
                  </div>
                </div>

                <form className="activity-form" onSubmit={handleCreateAndSendProposal} noValidate>
                  <div className="activity-form-grid">
                    <label>
                      Subject
                      <input
                        value={proposalForm.subject}
                        onChange={(event) => handleProposalFieldChange("subject", event.target.value)}
                      />
                    </label>
                    <label>
                      Amount
                      <input
                        type="number"
                        min="0"
                        value={proposalForm.amount}
                        onChange={(event) => handleProposalFieldChange("amount", event.target.value)}
                      />
                    </label>
                    <label>
                      Currency
                      <input
                        value={proposalForm.currency}
                        onChange={(event) => handleProposalFieldChange("currency", event.target.value.toUpperCase())}
                        placeholder="INR"
                      />
                    </label>
                    <label>
                      Valid Until
                      <input
                        type="date"
                        value={proposalForm.validUntil}
                        onChange={(event) => handleProposalFieldChange("validUntil", event.target.value)}
                      />
                    </label>
                    <label className="span-2">
                      <span>Customer Email</span>
                      <div className="activity-proposal-email-row">
                        <label className="activity-proposal-checkbox">
                          <input
                            type="checkbox"
                            checked={proposalForm.sendEmail}
                            onChange={(event) => handleProposalFieldChange("sendEmail", event.target.checked)}
                          />
                          Send to customer email
                        </label>
                        <input
                          type="email"
                          value={proposalForm.email}
                          onChange={(event) => handleProposalFieldChange("email", event.target.value)}
                          placeholder="customer@email.com"
                          disabled={!proposalForm.sendEmail}
                        />
                      </div>
                    </label>
                    <label className="span-2">
                      Message
                      <textarea
                        rows="3"
                        value={proposalForm.message}
                        onChange={(event) => handleProposalFieldChange("message", event.target.value)}
                      />
                    </label>
                    <label className="span-2">
                      Terms
                      <textarea
                        rows="2"
                        value={proposalForm.terms}
                        onChange={(event) => handleProposalFieldChange("terms", event.target.value)}
                      />
                    </label>
                  </div>
                  {proposalSubmitMessage ? (
                    <div className={`activity-proposal-submit-message ${proposalSubmitError ? "error" : "success"}`}>
                      {proposalSubmitMessage}
                    </div>
                  ) : null}
                  <div className="activity-form-actions">
                    <button type="button" className="secondary" onClick={closeProposalModal}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="activity-primary-btn"
                      disabled={proposalBusy}
                      onClick={handleCreateAndSendProposal}
                    >
                      {proposalBusy ? "Sending Proposal..." : "Create Proposal & Send"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
          : null}
        {showCompleteModal && typeof document !== "undefined"
          ? createPortal(
            <div className="activity-modal-overlay" onClick={closeCompleteModal}>
              <div className="activity-modal activity-complete-modal" onClick={(event) => event.stopPropagation()}>
                <div className="activity-card-header">
                  <div>
                    <h2>Complete Activity</h2>
                    <p>
                      {completionTarget?.title || "Activity"} - choose outcome to update lead stage and follow-up actions.
                    </p>
                  </div>
                </div>

                <div className="activity-form">
                  <div className="activity-complete-outcomes" role="group" aria-label="Completion outcome">
                    {COMPLETE_OUTCOME_OPTIONS.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        className={`activity-complete-outcome-btn ${completionForm.outcome === item.value ? "active" : ""}`}
                        onClick={() => setCompletionForm((prev) => ({ ...prev, outcome: item.value }))}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {["not_interested", "no_response", "follow_up_needed"].includes(completionForm.outcome) ? (
                    <label className="full-width">
                      {completionForm.outcome === "not_interested" ? "Reason for Lost" : "Follow-up Reason"}
                      <textarea
                        rows="3"
                        value={completionForm.reason}
                        onChange={(event) =>
                          setCompletionForm((prev) => ({ ...prev, reason: event.target.value }))
                        }
                        placeholder={
                          completionForm.outcome === "not_interested"
                            ? "Enter why this lead is not interested"
                            : "Enter follow-up reason"
                        }
                      />
                    </label>
                  ) : null}

                  {["no_response", "follow_up_needed"].includes(completionForm.outcome) ? (
                    <label>
                      Reschedule Date & Time
                      <input
                        type="datetime-local"
                        value={completionForm.rescheduleDateTime}
                        onChange={(event) =>
                          setCompletionForm((prev) => ({ ...prev, rescheduleDateTime: event.target.value }))
                        }
                      />
                    </label>
                  ) : null}

                  <div className="activity-form-actions">
                    <button type="button" className="secondary" onClick={closeCompleteModal}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="activity-primary-btn"
                      onClick={handleComplete}
                      disabled={completeBusy}
                    >
                      {completeBusy ? "Saving..." : "Confirm Completion"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
          : null}
      </div>
    </div>
  );
}

export default ActivityModule;
