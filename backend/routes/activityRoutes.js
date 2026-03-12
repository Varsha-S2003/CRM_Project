const express = require("express");
const mongoose = require("mongoose");
const Activity = require("../models/activity");
const User = require("../models/user");
const Lead = require("../models/lead");
const Contact = require("../models/contact");
const Deal = require("../models/deal");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const CRM_MODELS = { Lead, Contact, Deal };
const TYPE_TO_STATUS = {
  task: ["Pending", "Completed"],
  meeting: ["Scheduled", "Completed", "Cancelled"],
  call: ["Scheduled", "Completed"],
};

const getStartOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getEndOfDay = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const addDays = (value, days) => {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const getWeekStart = (value = new Date()) => {
  const date = getStartOfDay(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
};

const getWeekEnd = (value = new Date()) => getEndOfDay(addDays(getWeekStart(value), 6));

const asObjectId = (value) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const getActivityDate = (activity) => activity.startDateTime || activity.dueDate || activity.createdAt;

const computeNextRecurrence = (activity) => {
  if (!activity || !activity.recurrence || activity.recurrence === "none") return null;
  const sourceDate = getActivityDate(activity);
  if (!sourceDate) return null;

  const nextStart = new Date(sourceDate);
  if (activity.recurrence === "daily") nextStart.setDate(nextStart.getDate() + 1);
  if (activity.recurrence === "weekly") nextStart.setDate(nextStart.getDate() + 7);
  if (activity.recurrence === "monthly") nextStart.setMonth(nextStart.getMonth() + 1);

  const clone = {
    activityType: activity.activityType,
    title: activity.title,
    description: activity.description,
    owner: activity.owner,
    status: activity.activityType === "task" ? "Pending" : "Scheduled",
    priority: activity.priority,
    dueDate: activity.dueDate ? new Date(activity.dueDate) : undefined,
    startDateTime: activity.startDateTime ? new Date(activity.startDateTime) : undefined,
    endDateTime: activity.endDateTime ? new Date(activity.endDateTime) : undefined,
    location: activity.location,
    participants: activity.participants,
    reminderTime: activity.reminderTime ? new Date(activity.reminderTime) : undefined,
    reminderChannels: activity.reminderChannels,
    recurrence: activity.recurrence,
    relatedTo: activity.relatedTo,
    task: activity.task,
    meeting: activity.meeting,
    call: activity.call,
  };

  if (clone.startDateTime) {
    const duration = activity.endDateTime && activity.startDateTime
      ? new Date(activity.endDateTime).getTime() - new Date(activity.startDateTime).getTime()
      : 0;
    clone.startDateTime = nextStart;
    clone.endDateTime = duration ? new Date(nextStart.getTime() + duration) : clone.endDateTime;
  }

  if (clone.dueDate) {
    const due = new Date(activity.dueDate);
    if (activity.recurrence === "daily") due.setDate(due.getDate() + 1);
    if (activity.recurrence === "weekly") due.setDate(due.getDate() + 7);
    if (activity.recurrence === "monthly") due.setMonth(due.getMonth() + 1);
    clone.dueDate = due;
  }

  if (clone.reminderTime) {
    const reminder = new Date(activity.reminderTime);
    if (activity.recurrence === "daily") reminder.setDate(reminder.getDate() + 1);
    if (activity.recurrence === "weekly") reminder.setDate(reminder.getDate() + 7);
    if (activity.recurrence === "monthly") reminder.setMonth(reminder.getMonth() + 1);
    clone.reminderTime = reminder;
  }

  if (clone.meeting?.reminder) {
    const reminder = new Date(activity.meeting.reminder);
    if (activity.recurrence === "daily") reminder.setDate(reminder.getDate() + 1);
    if (activity.recurrence === "weekly") reminder.setDate(reminder.getDate() + 7);
    if (activity.recurrence === "monthly") reminder.setMonth(reminder.getMonth() + 1);
    clone.meeting = { ...clone.meeting, reminder };
  }

  return clone;
};

const ensureRelatedRecord = async (recordType, recordId) => {
  const Model = CRM_MODELS[recordType];
  if (!Model) {
    throw new Error("Invalid related record type");
  }
  const record = await Model.findById(recordId);
  if (!record) {
    throw new Error(`${recordType} not found`);
  }
  return record;
};

const getRecordName = (record) => {
  if (!record) return "";
  return record.name || record.company || record.email || String(record._id);
};

const normalizeActivityPayload = async (payload, userId) => {
  const activityType = String(payload.activityType || "").toLowerCase();
  if (!["task", "meeting", "call"].includes(activityType)) {
    throw new Error("Invalid activity type");
  }

  const relatedType = payload.relatedTo?.recordType || payload.relatedType;
  const relatedId = payload.relatedTo?.recordId || payload.relatedId;
  const relatedRecord = await ensureRelatedRecord(relatedType, relatedId);

  const ownerId = payload.owner || payload.taskOwner || payload.meetingOwner || payload.callOwner || userId;
  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new Error("Owner not found");
  }

  const statusFallback = activityType === "task" ? "Pending" : "Scheduled";
  const status = payload.status || payload.callStatus || statusFallback;
  if (!TYPE_TO_STATUS[activityType].includes(status)) {
    throw new Error("Invalid activity status");
  }

  const base = {
    activityType,
    title:
      payload.title ||
      payload.taskTitle ||
      payload.meetingTitle ||
      payload.callSubject,
    description: payload.description || payload.callNotes || "",
    owner: owner._id,
    status,
    priority: payload.priority || "Medium",
    dueDate: payload.dueDate || null,
    startDateTime:
      payload.startDateTime ||
      (payload.meetingDate && payload.startTime
        ? new Date(`${payload.meetingDate}T${payload.startTime}`)
        : payload.callDate && payload.callTime
          ? new Date(`${payload.callDate}T${payload.callTime}`)
          : null),
    endDateTime:
      payload.endDateTime ||
      (payload.meetingDate && payload.endTime
        ? new Date(`${payload.meetingDate}T${payload.endTime}`)
        : null),
    location: payload.location || "",
    participants: Array.isArray(payload.participants)
      ? payload.participants.filter(Boolean)
      : typeof payload.participants === "string"
        ? payload.participants.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
    reminderTime: payload.reminderTime || payload.reminder || null,
    reminderChannels: {
      popup: payload.reminderChannels?.popup ?? true,
      email: payload.reminderChannels?.email ?? Boolean(payload.emailReminder),
    },
    recurrence: payload.recurrence || "none",
    relatedTo: {
      recordType: relatedType,
      recordId: relatedRecord._id,
      recordName: getRecordName(relatedRecord),
    },
    task: activityType === "task" ? { taskTitle: payload.taskTitle || payload.title || "" } : undefined,
    meeting:
      activityType === "meeting"
        ? {
            meetingTitle: payload.meetingTitle || payload.title || "",
            reminder: payload.reminder || payload.reminderTime || null,
          }
        : undefined,
    call:
      activityType === "call"
        ? {
            callSubject: payload.callSubject || payload.title || "",
            callType: payload.callType || "Outbound",
            callDuration: Number(payload.callDuration) || 0,
            callNotes: payload.callNotes || payload.description || "",
            callStatus: payload.callStatus || status,
          }
        : undefined,
    cancelledAt: status === "Cancelled" ? new Date() : null,
    completedAt: status === "Completed" ? new Date() : null,
  };

  if (!base.title) {
    throw new Error("Title is required");
  }

  return base;
};

const buildFilters = (query) => {
  const filter = {};
  const now = new Date();
  const todayStart = getStartOfDay(now);
  const todayEnd = getEndOfDay(now);
  const thisWeekStart = getWeekStart(now);
  const thisWeekEnd = getWeekEnd(now);
  const nextWeekStart = addDays(thisWeekEnd, 1);
  const nextWeekEnd = getEndOfDay(addDays(nextWeekStart, 6));

  if (query.activityType && query.activityType !== "all") {
    filter.activityType = String(query.activityType).toLowerCase();
  }
  if (query.owner && query.owner !== "all") {
    const ownerId = asObjectId(query.owner);
    if (ownerId) filter.owner = ownerId;
  }
  if (query.priority && query.priority !== "all") {
    filter.priority = query.priority;
  }
  if (query.status && query.status !== "all") {
    filter.status = query.status;
  }
  if (query.relatedType) {
    filter["relatedTo.recordType"] = query.relatedType;
  }
  if (query.relatedId) {
    const relatedId = asObjectId(query.relatedId);
    if (relatedId) filter["relatedTo.recordId"] = relatedId;
  }
  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: "i" } },
      { description: { $regex: query.search, $options: "i" } },
      { "relatedTo.recordName": { $regex: query.search, $options: "i" } },
      { location: { $regex: query.search, $options: "i" } },
    ];
  }

  const dateField = query.dateField === "dueDate" ? "dueDate" : "startDateTime";

  if (query.filter === "today") {
    filter.$or = [{ dueDate: { $gte: todayStart, $lte: todayEnd } }, { startDateTime: { $gte: todayStart, $lte: todayEnd } }];
  }
  if (query.filter === "thisWeek") {
    filter.$or = [{ dueDate: { $gte: thisWeekStart, $lte: thisWeekEnd } }, { startDateTime: { $gte: thisWeekStart, $lte: thisWeekEnd } }];
  }
  if (query.filter === "nextWeek") {
    filter.$or = [{ dueDate: { $gte: nextWeekStart, $lte: nextWeekEnd } }, { startDateTime: { $gte: nextWeekStart, $lte: nextWeekEnd } }];
  }
  if (query.filter === "overdue") {
    filter.status = { $nin: ["Completed", "Cancelled"] };
    filter.$or = [{ dueDate: { $lt: todayStart } }, { startDateTime: { $lt: todayStart } }];
  }
  if (query.filter === "completed") {
    filter.status = "Completed";
  }

  if (query.dateFrom || query.dateTo) {
    filter[dateField] = {};
    if (query.dateFrom) filter[dateField].$gte = new Date(query.dateFrom);
    if (query.dateTo) filter[dateField].$lte = getEndOfDay(new Date(query.dateTo));
  }

  return filter;
};

const populateActivity = (query) =>
  query
    .populate("owner", "username email role name")
    .populate("relatedTo.recordId");

router.get("/", verifyToken, async (req, res) => {
  try {
    const filter = buildFilters(req.query);
    const activities = await populateActivity(Activity.find(filter).sort({ startDateTime: 1, dueDate: 1, createdAt: -1 }));
    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    const activities = await populateActivity(Activity.find({}).sort({ startDateTime: 1, dueDate: 1 }));
    const now = new Date();
    const todayStart = getStartOfDay(now);
    const todayEnd = getEndOfDay(now);

    const today = [];
    const upcoming = [];
    const overdue = [];
    const completed = [];

    activities.forEach((activity) => {
      const activityDate = getActivityDate(activity);
      if (activity.status === "Completed") {
        completed.push(activity);
        return;
      }
      if (activity.status !== "Cancelled" && activityDate && activityDate < todayStart) {
        overdue.push(activity);
        return;
      }
      if (activityDate && activityDate >= todayStart && activityDate <= todayEnd) {
        today.push(activity);
        return;
      }
      if (activityDate && activityDate > todayEnd) {
        upcoming.push(activity);
      }
    });

    const summary = {
      total: activities.length,
      completed: completed.length,
      overdue: overdue.length,
      today: today.length,
      upcoming: upcoming.length,
      tasks: activities.filter((activity) => activity.activityType === "task").length,
      meetings: activities.filter((activity) => activity.activityType === "meeting").length,
      calls: activities.filter((activity) => activity.activityType === "call").length,
    };

    res.json({ summary, today, upcoming, overdue, completed });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/calendar", verifyToken, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const view = req.query.view || "month";
    let from = getStartOfDay(date);
    let to = getEndOfDay(date);

    if (view === "week") {
      from = getWeekStart(date);
      to = getWeekEnd(date);
    } else if (view === "month") {
      from = new Date(date.getFullYear(), date.getMonth(), 1);
      to = getEndOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    }

    const activities = await populateActivity(
      Activity.find({
        $or: [
          { startDateTime: { $gte: from, $lte: to } },
          { dueDate: { $gte: from, $lte: to } },
        ],
      }).sort({ startDateTime: 1, dueDate: 1 })
    );

    res.json({ view, from, to, activities });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/reports", verifyToken, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = getStartOfDay(now);

    const activities = await Activity.find({});
    const tasks = activities.filter((activity) => activity.activityType === "task");
    const meetings = activities.filter((activity) => activity.activityType === "meeting");
    const calls = activities.filter((activity) => activity.activityType === "call");

    const byOwner = {};
    const byType = { task: 0, meeting: 0, call: 0 };
    const byPriority = { Low: 0, Medium: 0, High: 0 };

    activities.forEach((activity) => {
      byType[activity.activityType] += 1;
      byPriority[activity.priority] = (byPriority[activity.priority] || 0) + 1;
      const ownerKey = String(activity.owner);
      byOwner[ownerKey] = (byOwner[ownerKey] || 0) + 1;
    });

    const owners = await User.find({ _id: { $in: Object.keys(byOwner) } }).select("username name");
    const ownerChart = owners.map((owner) => ({
      owner: owner.name || owner.username,
      count: byOwner[String(owner._id)] || 0,
    }));

    res.json({
      metrics: {
        tasksCompleted: tasks.filter((task) => task.status === "Completed").length,
        overdueTasks: tasks.filter((task) => task.status !== "Completed" && task.dueDate && task.dueDate < todayStart).length,
        meetingsScheduled: meetings.filter((meeting) => meeting.status === "Scheduled").length,
        callLogs: calls.length,
      },
      charts: {
        byType: Object.entries(byType).map(([name, value]) => ({ name, value })),
        byPriority: Object.entries(byPriority).map(([name, value]) => ({ name, value })),
        byOwner: ownerChart,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/notifications", verifyToken, async (req, res) => {
  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 1000 * 60 * 60 * 24);
    const activities = await populateActivity(
      Activity.find({
        status: { $nin: ["Completed", "Cancelled"] },
        reminderTime: { $gte: now, $lte: windowEnd },
      }).sort({ reminderTime: 1 })
    );

    const notifications = activities.map((activity) => ({
      id: activity._id,
      title: activity.title,
      type: activity.activityType,
      reminderTime: activity.reminderTime,
      owner: activity.owner,
      relatedTo: activity.relatedTo,
      popup: activity.reminderChannels?.popup ?? true,
      email: activity.reminderChannels?.email ?? false,
      emailStatus: activity.reminderChannels?.email ? "Queued for email reminder" : "Popup only",
    }));

    res.json({
      unreadCount: notifications.length,
      notifications,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const payload = await normalizeActivityPayload(req.body, req.user._id);
    const activity = await Activity.create(payload);
    const saved = await populateActivity(Activity.findById(activity._id));
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put("/:id", verifyToken, async (req, res) => {
  try {
    const existing = await Activity.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Activity not found" });
    }

    const payload = await normalizeActivityPayload({ ...existing.toObject(), ...req.body }, req.user._id);
    Object.assign(existing, payload);
    if (existing.status === "Completed") {
      existing.completedAt = existing.completedAt || new Date();
    } else {
      existing.completedAt = null;
    }
    if (existing.status === "Cancelled") {
      existing.cancelledAt = existing.cancelledAt || new Date();
    } else {
      existing.cancelledAt = null;
    }
    await existing.save();
    const saved = await populateActivity(Activity.findById(existing._id));
    res.json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deleted = await Activity.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res.json({ message: "Activity deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/complete", verifyToken, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    activity.status = "Completed";
    activity.completedAt = new Date();
    if (activity.activityType === "call") {
      activity.call = { ...activity.call?.toObject?.(), ...activity.call, callStatus: "Completed" };
    }
    await activity.save();

    if (activity.recurrence && activity.recurrence !== "none") {
      const nextActivity = computeNextRecurrence(activity.toObject());
      if (nextActivity) {
        await Activity.create(nextActivity);
      }
    }

    const saved = await populateActivity(Activity.findById(activity._id));
    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/:id/reschedule", verifyToken, async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    if (req.body.dueDate) activity.dueDate = new Date(req.body.dueDate);
    if (req.body.startDateTime) activity.startDateTime = new Date(req.body.startDateTime);
    if (req.body.endDateTime) activity.endDateTime = new Date(req.body.endDateTime);
    if (req.body.reminderTime) activity.reminderTime = new Date(req.body.reminderTime);
    activity.status = activity.activityType === "task" ? "Pending" : "Scheduled";

    await activity.save();
    const saved = await populateActivity(Activity.findById(activity._id));
    res.json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
