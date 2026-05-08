const Activity = require("../models/activity");
const AppSettings = require("../models/appSettings");
const Deal = require("../models/deal");
const Lead = require("../models/lead");
const Notification = require("../models/notification");
const User = require("../models/user");
const { sendDailyDigestEmail } = require("./mailer");

let lastDigestDate = "";

function getDigestDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function shouldSendDigestNow(now = new Date()) {
  return now.getHours() >= 18;
}

async function buildUserDigestSummary(user, now = new Date()) {
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const userId = user._id;
  const role = String(user.role || "").toUpperCase();
  const ownerFilter = role === "ADMIN" ? {} : { $or: [{ owner: userId }, { assignedTo: userId }] };
  const leadFilter = role === "ADMIN" ? {} : { assignedTo: userId };
  const dealFilter = role === "ADMIN" ? {} : { assignedTo: userId };

  const [dueActivities, openLeads, activeDeals, unreadNotifications] = await Promise.all([
    Activity.countDocuments({
      ...ownerFilter,
      status: { $nin: ["Completed", "Cancelled"] },
      $or: [{ dueDate: { $lte: dayEnd } }, { startDateTime: { $lte: dayEnd } }],
    }),
    Lead.countDocuments({
      ...leadFilter,
      status: { $nin: ["converted", "lost"] },
    }),
    Deal.countDocuments({
      ...dealFilter,
      status: { $ne: "Inactive" },
    }),
    Notification.countDocuments({
      recipients: userId,
      isRead: false,
    }),
  ]);

  return { dueActivities, openLeads, activeDeals, unreadNotifications };
}

async function runDailyDigestOnce({ force = false } = {}) {
  const now = new Date();
  const dateKey = getDigestDateKey(now);
  if (!force && (lastDigestDate === dateKey || !shouldSendDigestNow(now))) {
    return { sent: 0, skipped: true };
  }

  const settings = await AppSettings.findOne().lean();
  if (settings?.notificationDefaults?.dailyDigest !== true) {
    return { sent: 0, skipped: true };
  }

  const users = await User.find({
    email: { $type: "string", $ne: "" },
    "settings.preferences.emailNotifications": { $ne: false },
  }).select("_id name username email role settings.preferences").lean();

  let sent = 0;
  for (const user of users) {
    try {
      const summary = await buildUserDigestSummary(user, now);
      await sendDailyDigestEmail({
        to: user.email,
        recipientName: user.name || user.username,
        summary,
      });
      sent += 1;
    } catch (err) {
      console.error(`Daily digest failed for ${user.email}:`, err.message);
    }
  }

  lastDigestDate = dateKey;
  return { sent, skipped: false };
}

function startDailyDigestJob() {
  setInterval(() => {
    runDailyDigestOnce().catch((err) => {
      console.error("Daily digest job failed:", err.message);
    });
  }, 60 * 60 * 1000);
}

module.exports = {
  runDailyDigestOnce,
  startDailyDigestJob,
};
