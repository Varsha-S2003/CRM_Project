const express = require("express");
const mongoose = require("mongoose");
const Activity = require("../models/activity");
const User = require("../models/user");
const Lead = require("../models/lead");
const Contact = require("../models/contact");
const Deal = require("../models/deal");
const { verifyToken } = require("../middleware/authMiddleware");
const { sendActivityReminderEmail } = require("../utils/mailer");
const { addServiceInterval } = require("../utils/serviceLifecycle");
const { getUserNotificationPreferences } = require("../utils/notificationPreferences");

const router = express.Router();

const CRM_MODELS = { Lead, Contact, Deal };
const TYPE_TO_STATUS = {
  task: ["Pending", "Completed"],
  meeting: ["Scheduled", "Completed", "Cancelled"],
  call: ["Scheduled", "Completed"],
  email: ["Pending", "Completed"],
};

const SIMPLE_TYPE_MAP = {
  call: "call",
  email: "email",
  meeting: "meeting",
  task: "task",
};

const LEAD_ACTIVITY_REMINDER_MINUTES = 5;
const LEAD_STAGE_FROM_ACTIVITY_TYPE = {
  call: "contacted",
  meeting: "qualified",
};
const OUTCOME_TO_LEAD_STATUS = {
  not_interested: "lost",
  no_response: "contacted",
  follow_up_needed: "contacted",
};
const ACTIVITY_STAGE_TO_LEAD_STATUS = {
  contacted: "contacted",
  meeting: "contacted",
  qualified: "qualified",
};
const AUTO_FOLLOW_UP_TYPE_BY_STAGE = {
  contacted: "call",
  meeting: "meeting",
  qualified: "task",
};
const LEAD_STAGE_ORDER = {
  new: 1,
  contacted: 2,
  qualified: 3,
  proposal: 4,
  converted: 5,
  lost: 5,
};

const toLegacyStatus = (value, fallback = "Completed") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending") return "Pending";
  if (normalized === "completed") return "Completed";
  if (normalized === "scheduled") return "Scheduled";
  if (normalized === "cancelled") return "Cancelled";
  return fallback;
};

const toSimpleStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "scheduled") return "pending";
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "completed";
  return "completed";
};

const normalizeOutcome = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["interested", "not_interested", "no_response", "follow_up_needed"].includes(normalized)) {
    return normalized;
  }
  return "";
};

const normalizeStage = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["contacted", "meeting", "qualified"].includes(normalized)) {
    return normalized;
  }
  return "";
};

const normalizeFollowUpType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["task", "meeting", "call"].includes(normalized)) {
    return normalized;
  }
  return "";
};

const coerceBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  if (typeof value === "number") return value === 1;
  return fallback;
};

const coerceFollowUpDays = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(30, Math.round(parsed)));
};

const normalizeReasonText = (value) => String(value || "").trim();

const normalizeMeetingType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "call") return "Call";
  return "Video Meeting";
};

const normalizeJoinLink = (value) => {
  const link = String(value || "").trim();
  if (!link) return "";
  try {
    const parsed = new URL(link);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only http and https meeting links are supported");
    }
    return parsed.toString();
  } catch (error) {
    throw new Error("Meeting link must be a valid URL");
  }
};

const getActivityJoinLink = (activity) => String(
  activity?.meeting?.meetingLink ||
  activity?.meetingLink ||
  activity?.call?.teamsLink ||
  activity?.call?.joinLink ||
  activity?.teamsLink ||
  activity?.joinLink ||
  (typeof activity?.get === "function" ? activity.get("meeting.meetingLink") : "") ||
  (typeof activity?.get === "function" ? activity.get("call.teamsLink") : "") ||
  ""
).trim();

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

const getEstimatedEndDateTime = (activity) => {
  if (!activity) return null;

  const type = String(activity.activityType || "").toLowerCase();
  if (!["meeting", "call"].includes(type)) return null;

  const explicitEnd = activity.endDateTime ? new Date(activity.endDateTime) : null;
  if (explicitEnd && !Number.isNaN(explicitEnd.getTime())) {
    return explicitEnd;
  }

  const start = activity.startDateTime ? new Date(activity.startDateTime) : null;
  if (!start || Number.isNaN(start.getTime())) return null;

  if (type === "meeting") {
    return new Date(start.getTime() + (45 * 60 * 1000));
  }

  const durationMinutes = Number(activity.call?.callDuration);
  const safeDurationMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30;
  return new Date(start.getTime() + (safeDurationMinutes * 60 * 1000));
};

const isScheduledCallOrMeetingLocked = (activity, now = new Date()) => {
  if (!activity) return false;

  const type = String(activity.activityType || "").toLowerCase();
  const status = String(activity.status || "").toLowerCase();
  if (!["meeting", "call"].includes(type) || status !== "scheduled") return false;

  const estimatedEnd = getEstimatedEndDateTime(activity);
  if (!estimatedEnd) return false;

  return now.getTime() < estimatedEnd.getTime();
};

const isEarlyCompletionTransition = (activity, nextStatus, now = new Date()) => {
  const targetStatus = String(nextStatus || "").toLowerCase();
  if (targetStatus !== "completed") return false;

  const type = String(activity?.activityType || "").toLowerCase();
  const currentStatus = String(activity?.status || "").toLowerCase();
  if (!["meeting", "call"].includes(type) || currentStatus !== "scheduled") return false;

  const estimatedEnd = getEstimatedEndDateTime(activity);
  if (!estimatedEnd) return false;

  return now.getTime() < estimatedEnd.getTime();
};

const getLinkedLeadIdFromActivity = (activity) => {
  if (!activity) return null;

  const directLeadId = activity.leadId;
  if (directLeadId) return directLeadId;

  const relatedType = String(activity.relatedTo?.recordType || "").toLowerCase();
  if (relatedType !== "lead") return null;

  const relatedId = activity.relatedTo?.recordId;
  if (!relatedId) return null;
  if (typeof relatedId === "object" && relatedId._id) return relatedId._id;
  return relatedId;
};

const resolveLeadStatusFromCompletedActivity = (activity, currentStatus = "new") => {
  const normalizedOutcome = normalizeOutcome(activity?.outcome);
  if (normalizedOutcome === "interested") {
    const current = String(currentStatus || "new").toLowerCase();
    if (current === "new") return "contacted";
    if (current === "contacted") return "qualified";
    return "qualified";
  }

  const outcomeStatus = OUTCOME_TO_LEAD_STATUS[normalizeOutcome(activity?.outcome)];
  if (outcomeStatus) return outcomeStatus;

  const stageStatus = ACTIVITY_STAGE_TO_LEAD_STATUS[normalizeStage(activity?.stage)];
  if (stageStatus) return stageStatus;

  const activityType = String(activity?.activityType || "").toLowerCase();
  return LEAD_STAGE_FROM_ACTIVITY_TYPE[activityType] || null;
};

const buildTransitionReason = (activity, activityType, targetStatus) => {
  const base = `Auto-updated from completed ${activityType} activity`;
  const reasonText = normalizeReasonText(activity?.outcomeReason);

  if (targetStatus === "lost" && reasonText) {
    return `${base}. Lost reason: ${reasonText}`;
  }

  if (["no_response", "follow_up_needed"].includes(normalizeOutcome(activity?.outcome)) && reasonText) {
    return `${base}. Follow-up reason: ${reasonText}`;
  }

  return base;
};

const createAutoFollowUpActivity = async (activity) => {
  if (!activity) return null;

  const completed = String(activity.status || "").toLowerCase() === "completed";
  if (!completed) return null;

  if (!coerceBoolean(activity.requiresFollowUp, false)) return null;
  if (activity.followUpGeneratedAt) return null;

  const stage = normalizeStage(activity.stage);
  const defaultType = AUTO_FOLLOW_UP_TYPE_BY_STAGE[stage] || String(activity.activityType || "task").toLowerCase() || "task";
  const followUpType = normalizeFollowUpType(activity.followUpType) || defaultType;
  const followUpInDays = coerceFollowUpDays(activity.followUpInDays);
  const baseDate = getActivityDate(activity) || activity.completedAt || new Date();
  const nextStart = addDays(baseDate, followUpInDays);
  const nextStatus = followUpType === "task" ? "Pending" : "Scheduled";
  const sourceTitle = String(activity.title || "Activity").trim();

  const followUpPayload = {
    leadId: activity.leadId,
    type: followUpType,
    notes: activity.notes || activity.description || "",
    nextFollowUpDate: null,
    createdBy: activity.createdBy || activity.owner,
    activityType: followUpType,
    title: `Follow-up: ${sourceTitle}`,
    description: activity.description || activity.notes || "",
    owner: activity.owner,
    status: nextStatus,
    priority: activity.priority || "Medium",
    location: activity.location || "",
    participants: Array.isArray(activity.participants) ? activity.participants : [],
    reminderChannels: {
      popup: true,
      email: false,
    },
    recurrence: "none",
    relatedTo: activity.relatedTo,
    outcome: "",
    requiresFollowUp: false,
    stage,
    followUpType: "",
    followUpInDays: 1,
    followUpGeneratedAt: null,
  };

  if (followUpType === "task") {
    followUpPayload.dueDate = nextStart;
    followUpPayload.reminderTime = new Date(nextStart.getTime() - LEAD_ACTIVITY_REMINDER_MINUTES * 60 * 1000);
    followUpPayload.task = { taskTitle: `Follow-up: ${sourceTitle}` };
  }

  if (followUpType === "meeting") {
    const durationMs = 30 * 60 * 1000;
    followUpPayload.startDateTime = nextStart;
    followUpPayload.endDateTime = new Date(nextStart.getTime() + durationMs);
    followUpPayload.reminderTime = new Date(nextStart.getTime() - LEAD_ACTIVITY_REMINDER_MINUTES * 60 * 1000);
    followUpPayload.meeting = {
      meetingTitle: `Follow-up: ${sourceTitle}`,
      reminder: followUpPayload.reminderTime,
    };
  }

  if (followUpType === "call") {
    followUpPayload.startDateTime = nextStart;
    followUpPayload.reminderTime = new Date(nextStart.getTime() - LEAD_ACTIVITY_REMINDER_MINUTES * 60 * 1000);
    followUpPayload.call = {
      callSubject: `Follow-up: ${sourceTitle}`,
      callType: activity.call?.callType || "Outbound",
      callDuration: Number(activity.call?.callDuration) || 15,
      callNotes: "Auto-created follow-up from completed activity",
      callStatus: "Scheduled",
    };
  }

  const created = await Activity.create(enforceLeadCallMeetingReminder(followUpPayload));
  activity.followUpGeneratedAt = new Date();
  await activity.save();
  await updateLeadLastActivityAt(created);
  return created;
};

const enforceLeadCallMeetingReminder = (activity) => {
  if (!activity) return activity;

  const isLeadRecord = String(activity.relatedTo?.recordType || "").toLowerCase() === "lead";
  const isCallOrMeeting = ["call", "meeting"].includes(String(activity.activityType || "").toLowerCase());
  if (!isLeadRecord || !isCallOrMeeting) return activity;

  const start = activity.startDateTime ? new Date(activity.startDateTime) : null;
  if (!start || Number.isNaN(start.getTime())) return activity;

  const reminderTime = new Date(start.getTime() - LEAD_ACTIVITY_REMINDER_MINUTES * 60 * 1000);
  activity.reminderTime = reminderTime;

  if (activity.activityType === "meeting") {
    activity.meeting = { ...(activity.meeting || {}), reminder: reminderTime };
  }

  return activity;
};

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
  const requestedType = String(payload.activityType || payload.type || "").toLowerCase();
  const activityType = SIMPLE_TYPE_MAP[requestedType] || requestedType;
  if (!["task", "meeting", "call", "email"].includes(activityType)) {
    throw new Error("Invalid activity type");
  }

  const relatedType = payload.relatedTo?.recordType || payload.relatedType || (payload.leadId ? "Lead" : undefined);
  const relatedId = payload.relatedTo?.recordId || payload.relatedId || payload.leadId;
  const relatedRecord = await ensureRelatedRecord(relatedType, relatedId);

  const ownerId = payload.owner || payload.taskOwner || payload.meetingOwner || payload.callOwner || userId;
  const owner = await User.findById(ownerId);
  if (!owner) {
    throw new Error("Owner not found");
  }

  const statusFallback = payload.status
    ? toLegacyStatus(payload.status, activityType === "task" || activityType === "email" ? "Completed" : "Scheduled")
    : activityType === "task" || activityType === "email"
      ? "Completed"
      : "Scheduled";
  const status = payload.status
    ? toLegacyStatus(payload.status, statusFallback)
    : payload.callStatus || statusFallback;
  if (!TYPE_TO_STATUS[activityType].includes(status)) {
    throw new Error("Invalid activity status");
  }

  const requiresFollowUp = coerceBoolean(payload.requiresFollowUp, false);
  const followUpInDays = coerceFollowUpDays(payload.followUpInDays);
  const stage = normalizeStage(payload.stage);
  const outcome = normalizeOutcome(payload.outcome);
  const outcomeReason = normalizeReasonText(payload.outcomeReason);
  const followUpType = requiresFollowUp ? normalizeFollowUpType(payload.followUpType) : "";

  const base = {
    leadId: relatedType === "Lead" ? relatedRecord._id : undefined,
    type: activityType,
    notes: payload.notes || payload.description || payload.callNotes || "",
    nextFollowUpDate: payload.nextFollowUpDate || payload.followUpDate || null,
    createdBy: payload.createdBy || userId,
    activityType,
    title:
      payload.title ||
      payload.taskTitle ||
      payload.meetingTitle ||
      payload.callSubject,
    description: payload.description || payload.notes || payload.callNotes || "",
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
    outcome,
    outcomeReason,
    requiresFollowUp,
    stage,
    followUpType,
    followUpInDays,
    followUpGeneratedAt: payload.followUpGeneratedAt || null,
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
            meetingType: normalizeMeetingType(payload.meetingType || payload.meeting?.meetingType),
            meetingLink: normalizeJoinLink(payload.meeting?.meetingLink || payload.meetingLink || payload.joinLink),
            reminder: payload.reminder || payload.reminderTime || null,
          }
        : undefined,
    call:
      activityType === "call"
        ? {
            callSubject: payload.callSubject || payload.call?.callSubject || payload.title || "",
            callType: payload.callType || payload.call?.callType || "Outbound",
            callDuration: Number(payload.callDuration ?? payload.call?.callDuration) || 0,
            callNotes: payload.callNotes || payload.call?.callNotes || payload.description || "",
            callStatus: payload.callStatus || payload.call?.callStatus || status,
            provider: payload.call?.provider || payload.provider || "",
            providerCallSid: payload.call?.providerCallSid || payload.providerCallSid || "",
            providerStatus: payload.call?.providerStatus || payload.providerStatus || "",
            toNumber: payload.call?.toNumber || payload.toNumber || "",
            fromNumber: payload.call?.fromNumber || payload.fromNumber || "",
            teamsLink: payload.call?.teamsLink || payload.teamsLink || "",
            teamsMode: payload.call?.teamsMode || payload.teamsMode || "",
          }
        : undefined,
    cancelledAt: status === "Cancelled" ? new Date() : null,
    completedAt: status === "Completed" ? new Date() : null,
  };

  if (!base.title) {
    throw new Error("Title is required");
  }

  if (activityType === "meeting") {
    const meetingStart = base.startDateTime ? new Date(base.startDateTime) : null;
    const meetingEnd = base.endDateTime ? new Date(base.endDateTime) : null;
    if (meetingStart && Number.isNaN(meetingStart.getTime())) {
      throw new Error("Meeting start time is invalid");
    }
    if (meetingEnd && Number.isNaN(meetingEnd.getTime())) {
      throw new Error("Meeting end time is invalid");
    }
    if (meetingStart && meetingEnd && meetingEnd <= meetingStart) {
      throw new Error("Meeting end time must be after the start time");
    }
  }

  return enforceLeadCallMeetingReminder(base);
};

const updateLeadLastActivityAt = async (activity) => {
  if (!activity) return;

  const leadId = getLinkedLeadIdFromActivity(activity);
  if (!leadId) return;

  await Lead.findByIdAndUpdate(leadId, {
    lastActivityAt: new Date(),
    lastActivityDate: new Date(),
  });
};

const updateLeadStageFromCompletedActivity = async (activity, actorId = null) => {
  if (!activity) return;

  const activityType = String(activity.activityType || "").toLowerCase();

  const leadId = getLinkedLeadIdFromActivity(activity);
  if (!leadId) return;

  const lead = await Lead.findById(leadId);
  if (!lead) return;

  const currentStatus = String(lead.status || "new").toLowerCase();
  if (["converted", "lost"].includes(currentStatus)) return;

  const targetStatus = resolveLeadStatusFromCompletedActivity(activity, currentStatus);
  if (!targetStatus) return;

  const currentOrder = LEAD_STAGE_ORDER[currentStatus] || 0;
  const targetOrder = LEAD_STAGE_ORDER[targetStatus] || 0;
  if (currentOrder >= targetOrder) return;

  lead.status = targetStatus;
  lead.stageTimestamps = lead.stageTimestamps || {};
  if (targetStatus === "contacted" && !lead.stageTimestamps.contactedAt) {
    lead.stageTimestamps.contactedAt = new Date();
  }
  if (targetStatus === "qualified" && !lead.stageTimestamps.qualifiedAt) {
    lead.stageTimestamps.qualifiedAt = new Date();
  }

  lead.transitionHistory = Array.isArray(lead.transitionHistory) ? lead.transitionHistory : [];
  lead.transitionHistory.push({
    fromStatus: currentStatus,
    toStatus: targetStatus,
    performedBy: actorId || null,
    performedAt: new Date(),
    reason: buildTransitionReason(activity, activityType, targetStatus),
    approvalRequired: false,
    approvalState: "none",
  });

  const reasonText = normalizeReasonText(activity?.outcomeReason);
  if (targetStatus === "lost" && reasonText) {
    const priorNotes = normalizeReasonText(lead.notes);
    lead.notes = priorNotes
      ? `${priorNotes}\nLost reason: ${reasonText}`
      : `Lost reason: ${reasonText}`;
  }

  lead.pendingTransitionApproval = undefined;
  await lead.save();
};

const buildFilters = (query, user = null) => {
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
  const role = String(user?.role || "").toUpperCase();
  if (role === "EMPLOYEE") {
    const employeeOwnerId = asObjectId(user?._id);
    if (employeeOwnerId) {
      filter.owner = employeeOwnerId;
    }
  } else if (query.owner && query.owner !== "all") {
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

const getAssignedUserId = (activity) => {
  const assignedTo = activity?.relatedTo?.recordId?.assignedTo;
  if (!assignedTo) return "";
  if (typeof assignedTo === "object") {
    return String(assignedTo._id || assignedTo.id || assignedTo.userId || "");
  }
  return String(assignedTo);
};

const getOwnerId = (activity) => {
  const owner = activity?.owner;
  if (!owner) return "";
  if (typeof owner === "object") {
    return String(owner._id || owner.id || "");
  }
  return String(owner);
};

const getActivityReminderRecipient = (activity) => {
  const relatedRecord = activity?.relatedTo?.recordId;
  const relatedType = String(activity?.relatedTo?.recordType || "").toLowerCase();

  const relatedEmail = String(
    relatedRecord?.email ||
    relatedRecord?.secondaryEmail ||
    ""
  ).trim();

  const relatedName = String(
    relatedRecord?.name ||
    [relatedRecord?.firstName, relatedRecord?.lastName].filter(Boolean).join(" ").trim() ||
    relatedRecord?.company ||
    activity?.relatedTo?.recordName ||
    ""
  ).trim();

  if (relatedEmail) {
    return {
      email: relatedEmail,
      name: relatedName || activity?.relatedTo?.recordName || "Client",
      target: relatedType || "client",
    };
  }

  const ownerEmail = String(activity?.owner?.email || "").trim();
  const ownerName = String(activity?.owner?.name || activity?.owner?.username || "").trim();
  if (ownerEmail) {
    return {
      email: ownerEmail,
      name: ownerName || "there",
      target: "owner",
    };
  }

  return {
    email: "",
    name: "",
    target: relatedType || "client",
  };
};

router.get("/", verifyToken, async (req, res) => {
  try {
    const filter = buildFilters(req.query, req.user);
    const activities = await populateActivity(Activity.find(filter).sort({ startDateTime: 1, dueDate: 1, createdAt: -1 }));
    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/dashboard", verifyToken, async (req, res) => {
  try {
    const filter = buildFilters({}, req.user);
    const activities = await populateActivity(Activity.find(filter).sort({ startDateTime: 1, dueDate: 1 }));
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

    const scopeFilter = buildFilters({}, req.user);
    const activities = await populateActivity(
      Activity.find({
        ...scopeFilter,
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
    const filter = buildFilters({}, req.user);

    const activities = await Activity.find(filter);
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

router.get("/usecases", verifyToken, async (req, res) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    const currentUserId = String(req.user?._id || "");

    const baseFilter = {
      activityType: "meeting",
      outcome: "interested",
      "relatedTo.recordType": "Lead",
    };

    const activities = await populateActivity(
      Activity.find(baseFilter).sort({ startDateTime: -1, dueDate: -1, createdAt: -1 })
    );

    const scopedActivities = role === "EMPLOYEE"
      ? activities.filter((activity) => {
          const assignedId = getAssignedUserId(activity);
          const ownerId = getOwnerId(activity);
          return assignedId === currentUserId || ownerId === currentUserId;
        })
      : activities;

    res.json(scopedActivities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/notifications", verifyToken, async (req, res) => {
  try {
    const preferences = await getUserNotificationPreferences(req.user._id);
    const mode = String(req.query.mode || "popup").toLowerCase();
    const isDashboardMode = mode === "dashboard";
    const now = new Date();
    const windowStart = isDashboardMode
      ? new Date(now.getTime() - 1000 * 60 * 30)
      : new Date(now.getTime() - 1000 * 60);
    const windowEnd = isDashboardMode
      ? new Date(now.getTime() + 1000 * 60 * 60)
      : new Date(now.getTime() + 1000 * 15);

    const notificationFilter = {
        owner: req.user._id,
        status: { $nin: ["Completed", "Cancelled"] },
        reminderTime: { $gte: windowStart, $lte: windowEnd },
    };

    if (!isDashboardMode) {
      notificationFilter.$or = [
        { "notificationState.popupNotifiedAt": { $exists: false } },
        { "notificationState.popupNotifiedAt": null },
        {
          $and: [
            { "reminderChannels.email": true },
            {
              $or: [
                { "notificationState.emailNotifiedAt": { $exists: false } },
                { "notificationState.emailNotifiedAt": null },
              ],
            },
          ],
        },
      ];
    }

    const activities = await populateActivity(
      Activity.find(notificationFilter).sort({ reminderTime: 1 })
    );

    const emailSendMap = new Map();
    const emailNotifiedActivityIds = [];

    const emailCandidates = activities.filter((activity) => {
      const emailEnabled = activity.reminderChannels?.email === true;
      const emailAlreadySent = Boolean(activity.notificationState?.emailNotifiedAt);
      const recipient = getActivityReminderRecipient(activity);
      return preferences.emailNotifications && emailEnabled && !emailAlreadySent && Boolean(recipient.email);
    });

    await Promise.all(
      emailCandidates.map(async (activity) => {
        const activityId = String(activity._id);
        const recipient = getActivityReminderRecipient(activity);
        try {
          const emailResponse = await sendActivityReminderEmail({
            to: recipient.email,
            ownerName: activity.owner?.name || activity.owner?.username,
            recipientName: recipient.name,
            activity: {
              ...activity.toObject(),
              joinLink: getActivityJoinLink(activity),
            },
          });

          emailNotifiedActivityIds.push(activity._id);
          emailSendMap.set(activityId, {
            sent: true,
            target: recipient.target,
            to: recipient.email,
            preview: emailResponse?.preview || null,
            hasJoinLink: Boolean(getActivityJoinLink(activity)),
          });
        } catch (emailErr) {
          emailSendMap.set(activityId, {
            sent: false,
            target: recipient.target,
            to: recipient.email,
            error: emailErr.message,
          });
        }
      })
    );

    if (emailNotifiedActivityIds.length > 0) {
      await Activity.updateMany(
        { _id: { $in: emailNotifiedActivityIds } },
        { $set: { "notificationState.emailNotifiedAt": now } }
      );
    }

    const notifications = preferences.appNotifications ? activities.map((activity) => {
      const activityId = String(activity._id);
      const emailEnabled = activity.reminderChannels?.email === true;
      const emailAlreadySent = Boolean(activity.notificationState?.emailNotifiedAt);
      const emailAttempt = emailSendMap.get(activityId);
      const recipient = getActivityReminderRecipient(activity);

      let emailStatus = "Popup only";
      if (emailEnabled) {
        if (emailAttempt?.sent) {
          emailStatus = emailAttempt.preview
            ? `Email sent to ${emailAttempt.target} (${emailAttempt.to})${emailAttempt.hasJoinLink ? " with join link" : " without join link"} (preview available)`
            : `Email sent to ${emailAttempt.target} (${emailAttempt.to})${emailAttempt.hasJoinLink ? " with join link" : " without join link"}`;
        } else if (emailAttempt?.sent === false) {
          emailStatus = `Email failed: ${emailAttempt.error}`;
        } else if (emailAlreadySent) {
          emailStatus = "Email already sent";
        } else if (!preferences.emailNotifications) {
          emailStatus = "Email skipped: email notifications disabled";
        } else if (!recipient.email) {
          emailStatus = `Email skipped: ${recipient.target} email missing`;
        } else {
          emailStatus = `Queued for email reminder to ${recipient.target}`;
        }
      }

      return {
      id: activity._id,
      title: activity.title,
      type: activity.activityType,
      reminderTime: activity.reminderTime,
      startDateTime: activity.startDateTime || activity.dueDate || null,
      scheduledTime: getActivityDate(activity) || null,
      displayTime: activity.startDateTime || activity.dueDate || getActivityDate(activity) || null,
      owner: activity.owner,
      relatedTo: activity.relatedTo,
      joinLink: getActivityJoinLink(activity),
      popup: activity.reminderChannels?.popup ?? true,
      email: activity.reminderChannels?.email ?? false,
      emailStatus,
      };
    }) : [];

    if (preferences.appNotifications && !isDashboardMode && activities.length > 0) {
      const popupCandidateIds = activities
        .filter((activity) => activity.reminderChannels?.popup !== false)
        .map((activity) => activity._id);

      if (popupCandidateIds.length > 0) {
      await Activity.updateMany(
        { _id: { $in: popupCandidateIds } },
        { $set: { "notificationState.popupNotifiedAt": now } }
      );
      }
    }

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
    await updateLeadLastActivityAt(activity);
    if (activity.status === "Completed") {
      await updateLeadStageFromCompletedActivity(activity, req.user._id);
      await createAutoFollowUpActivity(activity);
    }
    const saved = await populateActivity(Activity.findById(activity._id));
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// GET /api/activities/:leadId - return activities for a lead sorted by latest
router.get("/:leadId", verifyToken, async (req, res) => {
  try {
    const { leadId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(leadId)) {
      return res.status(400).json({ message: "Invalid lead id" });
    }

    const activities = await populateActivity(
      Activity.find({
        $or: [
          { leadId },
          {
            "relatedTo.recordType": "Lead",
            "relatedTo.recordId": leadId,
          },
        ],
      }).sort({ createdAt: -1 })
    );

    return res.json(activities);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.put("/:id", verifyToken, async (req, res) => {
  try {
    const existing = await Activity.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Activity not found" });
    }

    const onlyStatusUpdate =
      Object.keys(req.body || {}).length > 0 &&
      Object.keys(req.body || {}).every((key) => ["status", "notes", "nextFollowUpDate", "outcome", "outcomeReason", "requiresFollowUp", "stage", "followUpType", "followUpInDays"].includes(key));

    if (onlyStatusUpdate) {
      const intendedStatus = req.body.status !== undefined
        ? toLegacyStatus(req.body.status, existing.status || "Completed")
        : existing.status;
      if (isEarlyCompletionTransition(existing, intendedStatus)) {
        const estimatedEnd = getEstimatedEndDateTime(existing);
        return res.status(400).json({
          message: `This ${existing.activityType} can be completed only after ${estimatedEnd ? estimatedEnd.toISOString() : "the estimated end time"}.`,
        });
      }

      if (req.body.status !== undefined) {
        existing.status = toLegacyStatus(req.body.status, existing.status || "Completed");
      }
      if (req.body.notes !== undefined) {
        existing.notes = String(req.body.notes || "").trim();
        existing.description = existing.notes;
      }
      if (req.body.nextFollowUpDate !== undefined) {
        existing.nextFollowUpDate = req.body.nextFollowUpDate ? new Date(req.body.nextFollowUpDate) : null;
      }
      if (req.body.outcome !== undefined) {
        existing.outcome = normalizeOutcome(req.body.outcome);
      }
      if (req.body.outcomeReason !== undefined) {
        existing.outcomeReason = normalizeReasonText(req.body.outcomeReason);
      }
      if (req.body.requiresFollowUp !== undefined) {
        existing.requiresFollowUp = coerceBoolean(req.body.requiresFollowUp, existing.requiresFollowUp);
      }
      if (req.body.stage !== undefined) {
        existing.stage = normalizeStage(req.body.stage);
      }
      if (req.body.followUpType !== undefined) {
        existing.followUpType = normalizeFollowUpType(req.body.followUpType);
      }
      if (req.body.followUpInDays !== undefined) {
        existing.followUpInDays = coerceFollowUpDays(req.body.followUpInDays);
      }

      existing.type = existing.activityType;
      existing.createdBy = existing.createdBy || req.user._id;

      if (toSimpleStatus(existing.status) === "completed") {
        existing.completedAt = existing.completedAt || new Date();
      } else {
        existing.completedAt = null;
      }

      await existing.save();
      await updateLeadLastActivityAt(existing);
      if (existing.status === "Completed") {
        await updateLeadStageFromCompletedActivity(existing, req.user._id);
        await createAutoFollowUpActivity(existing);
      }
      const savedSimple = await populateActivity(Activity.findById(existing._id));
      return res.json(savedSimple);
    }

    const previousJoinLink = getActivityJoinLink(existing);
    const payload = await normalizeActivityPayload({ ...existing.toObject(), ...req.body }, req.user._id);
    if (isEarlyCompletionTransition({ ...existing.toObject(), ...payload }, payload.status)) {
      const estimatedEnd = getEstimatedEndDateTime({ ...existing.toObject(), ...payload });
      return res.status(400).json({
        message: `This ${existing.activityType} can be completed only after ${estimatedEnd ? estimatedEnd.toISOString() : "the estimated end time"}.`,
      });
    }

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
    const nextJoinLink = getActivityJoinLink(existing);
    const reminderChanged =
      req.body.reminderTime !== undefined ||
      req.body.reminder !== undefined ||
      req.body.reminderChannels !== undefined ||
      req.body.emailReminder !== undefined;
    if (previousJoinLink !== nextJoinLink || reminderChanged) {
      existing.notificationState = {
        ...(existing.notificationState?.toObject?.() || existing.notificationState || {}),
        emailNotifiedAt: null,
      };
    }
    await existing.save();
    await updateLeadLastActivityAt(existing);
    if (existing.status === "Completed") {
      await updateLeadStageFromCompletedActivity(existing, req.user._id);
      await createAutoFollowUpActivity(existing);
    }
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

    if (isScheduledCallOrMeetingLocked(activity)) {
      const estimatedEnd = getEstimatedEndDateTime(activity);
      const activityLabel = String(activity.activityType || "activity");
      const safeEstimatedText = estimatedEnd ? estimatedEnd.toISOString() : "the estimated end time";
      return res.status(400).json({
        message: `This ${activityLabel} can be completed only after ${safeEstimatedText}.`,
      });
    }

    const outcome = normalizeOutcome(req.body?.outcome);
    const stage = normalizeStage(req.body?.stage || activity.stage);
    const outcomeReason = normalizeReasonText(req.body?.outcomeReason);
    const requiresReschedule = ["no_response", "follow_up_needed"].includes(outcome);

    if (!outcome) {
      return res.status(400).json({ message: "Outcome is required to complete activity" });
    }

    if (outcome === "not_interested" && !outcomeReason) {
      return res.status(400).json({ message: "Reason is required for Not Interested" });
    }

    if (requiresReschedule && !outcomeReason) {
      return res.status(400).json({ message: "Follow-up reason is required" });
    }

    let rescheduleDate = null;
    if (requiresReschedule) {
      rescheduleDate = req.body?.rescheduleDateTime ? new Date(req.body.rescheduleDateTime) : null;
      if (!rescheduleDate || Number.isNaN(rescheduleDate.getTime())) {
        return res.status(400).json({ message: "Valid reschedule date and time is required" });
      }
    }

    activity.status = "Completed";
    activity.completedAt = new Date();
    activity.outcome = outcome;
    activity.stage = stage;
    activity.outcomeReason = outcomeReason;
    if (requiresReschedule) {
      activity.requiresFollowUp = false;
      activity.followUpGeneratedAt = null;
      activity.nextFollowUpDate = rescheduleDate;
    }
    if (activity.activityType === "call") {
      activity.call = { ...activity.call?.toObject?.(), ...activity.call, callStatus: "Completed" };
    }

    const serviceContinuationDecision = String(req.body?.serviceContinuationDecision || "").trim().toLowerCase();
    const serviceDetails = {
      servicePlan: String(req.body?.servicePlan || "").trim(),
      billingCycle: String(req.body?.billingCycle || "").trim(),
      customCycleValue: String(req.body?.customCycleValue || "").trim(),
      customCycleUnit: String(req.body?.customCycleUnit || "").trim(),
      usersOrSeats: String(req.body?.usersOrSeats || "").trim(),
      estimatedValue: String(req.body?.estimatedValue || "").trim(),
      billingOwner: String(req.body?.billingOwner || "").trim(),
      reminderDays: String(req.body?.reminderDays || "").trim(),
      renewalPolicy: String(req.body?.renewalPolicy || "").trim(),
      serviceContinuationDecision,
      billingNotes: String(req.body?.billingNotes || "").trim(),
    };

    const nextCustomerEmailAt = addServiceInterval(
      activity.completedAt || new Date(),
      serviceDetails.billingCycle,
      serviceDetails.customCycleValue,
      serviceDetails.customCycleUnit
    );

    if (serviceContinuationDecision) {
      activity.serviceBilling = {
        ...(activity.serviceBilling?.toObject?.() || activity.serviceBilling || {}),
        ...serviceDetails,
        nextCustomerEmailAt,
        customerEmailSentAt: null,
      };
    }

    await activity.save();

    if (requiresReschedule) {
      const followUpTitle = `Follow-up: ${String(activity.title || "Activity")}`;
      const followUpDesc = outcomeReason
        ? `${String(activity.description || activity.notes || "").trim()}\nFollow-up reason: ${outcomeReason}`.trim()
        : (activity.description || activity.notes || "");
      const nextStatus = activity.activityType === "task" ? "Pending" : "Scheduled";
      const nextPayload = {
        leadId: activity.leadId,
        type: activity.activityType,
        notes: followUpDesc,
        nextFollowUpDate: null,
        createdBy: activity.createdBy || activity.owner,
        activityType: activity.activityType,
        title: followUpTitle,
        description: followUpDesc,
        owner: activity.owner,
        status: nextStatus,
        priority: activity.priority || "Medium",
        location: activity.location || "",
        participants: Array.isArray(activity.participants) ? activity.participants : [],
        reminderChannels: {
          popup: true,
          email: false,
        },
        recurrence: "none",
        relatedTo: activity.relatedTo,
        outcome: "",
        outcomeReason: "",
        requiresFollowUp: false,
        stage: stage || activity.stage || "",
        followUpType: "",
        followUpInDays: 1,
        followUpGeneratedAt: null,
      };

      if (activity.activityType === "task") {
        nextPayload.dueDate = rescheduleDate;
        nextPayload.reminderTime = new Date(rescheduleDate.getTime() - LEAD_ACTIVITY_REMINDER_MINUTES * 60 * 1000);
        nextPayload.task = { taskTitle: followUpTitle };
      }

      if (activity.activityType === "meeting") {
        const currentDuration = activity.endDateTime && activity.startDateTime
          ? new Date(activity.endDateTime).getTime() - new Date(activity.startDateTime).getTime()
          : 30 * 60 * 1000;
        nextPayload.startDateTime = rescheduleDate;
        nextPayload.endDateTime = new Date(rescheduleDate.getTime() + Math.max(15 * 60 * 1000, currentDuration));
        nextPayload.reminderTime = new Date(rescheduleDate.getTime() - LEAD_ACTIVITY_REMINDER_MINUTES * 60 * 1000);
        nextPayload.meeting = {
          meetingTitle: followUpTitle,
          reminder: nextPayload.reminderTime,
        };
      }

      if (activity.activityType === "call") {
        nextPayload.startDateTime = rescheduleDate;
        nextPayload.reminderTime = new Date(rescheduleDate.getTime() - LEAD_ACTIVITY_REMINDER_MINUTES * 60 * 1000);
        nextPayload.call = {
          callSubject: followUpTitle,
          callType: activity.call?.callType || "Outbound",
          callDuration: Number(activity.call?.callDuration) || 15,
          callNotes: followUpDesc,
          callStatus: "Scheduled",
        };
      }

      const createdFollowUp = await Activity.create(enforceLeadCallMeetingReminder(nextPayload));
      await updateLeadLastActivityAt(createdFollowUp);
    }

    await updateLeadLastActivityAt(activity);
    await updateLeadStageFromCompletedActivity(activity, req.user._id);
    await createAutoFollowUpActivity(activity);

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
    activity.notificationState = {
      ...(activity.notificationState?.toObject?.() || activity.notificationState || {}),
      emailNotifiedAt: null,
    };

    enforceLeadCallMeetingReminder(activity);

    await activity.save();
    const saved = await populateActivity(Activity.findById(activity._id));
    res.json(saved);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
