const express = require("express");
const twilio = require("twilio");
const Activity = require("../models/activity");
const Lead = require("../models/lead");
const Contact = require("../models/contact");
const Deal = require("../models/deal");
const User = require("../models/user");
const { sendTeamsCallInviteEmail } = require("../utils/mailer");
const { verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

const MISSED_STATUSES = new Set(["busy", "failed", "no-answer", "canceled", "cancelled"]);
const RELATED_MODEL_MAP = { Lead, Contact, Deal };

const getRecordEmail = (record) => {
  if (!record) return "";
  return String(record.email || record.secondaryEmail || "").trim();
};

const getRecordName = (record) => {
  if (!record) return "";
  return String(record.name || record.company || record.email || "").trim();
};

const buildTeamsCallLink = ({ participantEmails, mode = "video" }) => {
  const users = participantEmails.filter(Boolean).join(",");
  const withVideo = String(mode || "video").toLowerCase() === "voice" ? "false" : "true";
  return `https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(users)}&withVideo=${withVideo}`;
};

const getTwilioConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const defaultFrom = process.env.TWILIO_PHONE_NUMBER || "";
  const webhookBaseUrl = process.env.CALL_WEBHOOK_BASE_URL || "";
  const callMessage = process.env.CALL_TWIML_MESSAGE || "You have a call from Elogixa CRM.";
  return { accountSid, authToken, defaultFrom, webhookBaseUrl, callMessage };
};

const mapProviderStatusToCallStatus = (providerStatus) => {
  const normalized = String(providerStatus || "").trim().toLowerCase();
  if (!normalized) return "Scheduled";
  if (["queued", "initiated"].includes(normalized)) {
    return "Scheduled";
  }
  if (normalized === "ringing") return "Ringing";
  if (["in-progress", "in progress"].includes(normalized)) return "In Progress";
  if (normalized === "completed") return "Completed";
  if (MISSED_STATUSES.has(normalized)) return "Missed";
  return "Scheduled";
};

router.post("/dial", verifyToken, async (req, res) => {
  try {
    const { activityId, toNumber, fromNumber } = req.body || {};
    if (!activityId || !toNumber) {
      return res.status(400).json({ message: "activityId and toNumber are required" });
    }

    const { accountSid, authToken, defaultFrom, webhookBaseUrl, callMessage } = getTwilioConfig();
    if (!accountSid || !authToken || !(fromNumber || defaultFrom)) {
      return res.status(500).json({
        message: "Twilio config missing. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER",
      });
    }

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    if (String(activity.activityType || "").toLowerCase() !== "call") {
      return res.status(400).json({ message: "Only call activities can be dialed" });
    }

    const client = twilio(accountSid, authToken);
    const callbackUrl = webhookBaseUrl
      ? `${webhookBaseUrl.replace(/\/$/, "")}/api/calls/twilio/webhook?activityId=${activity._id}`
      : undefined;

    const createdCall = await client.calls.create({
      to: toNumber,
      from: fromNumber || defaultFrom,
      twiml: `<Response><Say voice=\"alice\">${String(callMessage).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Say></Response>`,
      statusCallback: callbackUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });

    const providerStatus = String(createdCall.status || "queued");
    activity.call = {
      ...(activity.call?.toObject?.() || activity.call || {}),
      provider: "twilio",
      providerCallSid: createdCall.sid,
      providerStatus,
      toNumber,
      fromNumber: fromNumber || defaultFrom,
      callStatus: mapProviderStatusToCallStatus(providerStatus),
    };

    // Keep activity open unless call has definitively ended.
    activity.status = activity.call.callStatus === "Completed" ? "Completed" : "Scheduled";
    await activity.save();

    return res.json({
      message: "Call initiated",
      provider: "twilio",
      sid: createdCall.sid,
      status: providerStatus,
      activity,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to dial call" });
  }
});

router.post("/send-teams-link", verifyToken, async (req, res) => {
  try {
    const { activityId, mode = "video", recipientEmail } = req.body || {};
    if (!activityId) {
      return res.status(400).json({ message: "activityId is required" });
    }

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    if (String(activity.activityType || "").toLowerCase() !== "call") {
      return res.status(400).json({ message: "Teams link is available only for call activities" });
    }

    const owner = await User.findById(activity.owner).select("name username email");
    const ownerEmail = String(owner?.email || "").trim();
    const ownerName = String(owner?.name || owner?.username || "CRM Team").trim() || "CRM Team";

    const recordType = String(activity.relatedTo?.recordType || "");
    const recordId = activity.relatedTo?.recordId;
    const Model = RELATED_MODEL_MAP[recordType];
    const relatedRecord = Model && recordId ? await Model.findById(recordId).lean() : null;

    const resolvedRecipientEmail = String(recipientEmail || getRecordEmail(relatedRecord)).trim();
    if (!resolvedRecipientEmail) {
      return res.status(400).json({
        message: "Recipient email not found on related record. Provide recipientEmail manually.",
      });
    }

    const participantEmails = [ownerEmail, resolvedRecipientEmail].filter(Boolean);
    if (participantEmails.length === 0) {
      return res.status(400).json({ message: "No valid Teams participant emails available" });
    }

    const teamsMode = String(mode || "video").toLowerCase() === "voice" ? "voice" : "video";
    const teamsLink = buildTeamsCallLink({ participantEmails, mode: teamsMode });

    const recipientName = getRecordName(relatedRecord) || activity.relatedTo?.recordName || "there";
    const mailResult = await sendTeamsCallInviteEmail({
      to: resolvedRecipientEmail,
      recipientName,
      ownerName,
      activity,
      teamsLink,
      mode: teamsMode,
    });

    activity.call = {
      ...(activity.call?.toObject?.() || activity.call || {}),
      provider: "teams",
      teamsLink,
      teamsMode,
      callStatus: "Scheduled",
    };
    activity.status = "Scheduled";
    await activity.save();

    return res.json({
      message: "Teams call link sent by email",
      teamsLink,
      recipientEmail: resolvedRecipientEmail,
      preview: mailResult.preview || null,
      activity,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Failed to send Teams link" });
  }
});

router.post("/twilio/webhook", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const { activityId } = req.query || {};
    const callSid = req.body?.CallSid;
    const callStatus = req.body?.CallStatus;
    const callDuration = req.body?.CallDuration;
    const from = req.body?.From;
    const to = req.body?.To;

    let activity = null;
    if (activityId) {
      activity = await Activity.findById(activityId);
    }
    if (!activity && callSid) {
      activity = await Activity.findOne({ "call.providerCallSid": callSid });
    }

    if (!activity) {
      return res.status(200).send("ok");
    }

    const normalizedCallStatus = mapProviderStatusToCallStatus(callStatus);
    activity.call = {
      ...(activity.call?.toObject?.() || activity.call || {}),
      provider: "twilio",
      providerCallSid: callSid || activity.call?.providerCallSid || "",
      providerStatus: String(callStatus || "").trim().toLowerCase(),
      toNumber: to || activity.call?.toNumber || "",
      fromNumber: from || activity.call?.fromNumber || "",
      callStatus: normalizedCallStatus,
      callDuration:
        Number.isFinite(Number(callDuration)) && Number(callDuration) >= 0
          ? Number(callDuration)
          : Number(activity.call?.callDuration) || 0,
    };

    if (normalizedCallStatus === "Completed") {
      activity.status = "Completed";
      activity.completedAt = activity.completedAt || new Date();
    } else if (normalizedCallStatus === "Missed") {
      activity.status = "Scheduled";
      activity.completedAt = null;
    } else {
      activity.status = "Scheduled";
      activity.completedAt = null;
    }

    await activity.save();
    return res.status(200).send("ok");
  } catch (error) {
    return res.status(200).send("ok");
  }
});

module.exports = router;
