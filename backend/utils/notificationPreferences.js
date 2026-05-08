const AppSettings = require("../models/appSettings");
const Notification = require("../models/notification");
const User = require("../models/user");

const DEFAULT_ALERTS = {
  leadAssigned: true,
  dealWon: true,
  invoiceOverdue: true,
  lowInventory: true,
  dailyDigest: false,
};

async function getAppSettings() {
  let settings = await AppSettings.findOne();
  if (!settings) {
    settings = await AppSettings.create({});
  }
  return settings;
}

async function isAlertTypeEnabled(type) {
  if (!type) return true;
  const settings = await getAppSettings();
  const configured = settings.notificationDefaults?.[type];
  return configured === undefined ? DEFAULT_ALERTS[type] !== false : configured !== false;
}

async function getUserNotificationPreferences(userId) {
  if (!userId) {
    return {
      appNotifications: true,
      emailNotifications: true,
      desktopNotifications: false,
      smsNotifications: false,
    };
  }

  const user = await User.findById(userId).select("settings.preferences").lean();
  const preferences = user?.settings?.preferences || {};

  return {
    appNotifications: preferences.appNotifications !== false,
    emailNotifications: preferences.emailNotifications !== false,
    desktopNotifications: Boolean(preferences.desktopNotifications),
    smsNotifications: Boolean(preferences.smsNotifications),
  };
}

async function filterRecipientsForAppNotifications(recipients, type = null) {
  const ids = Array.from(
    new Set(
      (Array.isArray(recipients) ? recipients : [recipients])
        .map((recipient) => String(recipient || "").trim())
        .filter(Boolean)
    )
  );

  if (!ids.length || !(await isAlertTypeEnabled(type))) {
    return [];
  }

  const users = await User.find({ _id: { $in: ids } }).select("_id settings.preferences.appNotifications").lean();
  const enabled = new Set(
    users
      .filter((user) => user.settings?.preferences?.appNotifications !== false)
      .map((user) => String(user._id))
  );

  return ids.filter((id) => enabled.has(id));
}

async function createNotificationIfAllowed({ type = null, notification }) {
  const recipients = await filterRecipientsForAppNotifications(notification?.recipients || [], type);
  if (!recipients.length) return null;
  return Notification.create({ ...notification, recipients });
}

async function insertNotificationsIfAllowed({ type = null, notifications }) {
  const docs = [];
  for (const notification of notifications || []) {
    const recipients = await filterRecipientsForAppNotifications(notification?.recipients || [], type);
    if (recipients.length) {
      docs.push({ ...notification, recipients });
    }
  }
  if (!docs.length) return [];
  return Notification.insertMany(docs);
}

module.exports = {
  createNotificationIfAllowed,
  filterRecipientsForAppNotifications,
  getUserNotificationPreferences,
  insertNotificationsIfAllowed,
  isAlertTypeEnabled,
};
