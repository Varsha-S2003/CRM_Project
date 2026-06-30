const Activity = require("../models/activity");
const { sendServiceContinuationEmail } = require("./mailer");

const SERVICE_EMAIL_SCAN_INTERVAL_MS = 60 * 1000;

function addServiceInterval(baseDate, billingCycle, customCycleValue, customCycleUnit) {
  const start = new Date(baseDate);
  if (Number.isNaN(start.getTime())) return null;

  const cycle = String(billingCycle || "").trim().toLowerCase();
  if (cycle === "monthly") {
    start.setMonth(start.getMonth() + 1);
    return start;
  }
  if (cycle === "quarterly") {
    start.setMonth(start.getMonth() + 3);
    return start;
  }
  if (cycle === "6_months") {
    start.setMonth(start.getMonth() + 6);
    return start;
  }
  if (cycle === "yearly") {
    start.setFullYear(start.getFullYear() + 1);
    return start;
  }

  if (cycle === "custom") {
    const amount = Number(customCycleValue);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const unit = String(customCycleUnit || "").trim().toLowerCase();

    if (unit === "minutes") return new Date(start.getTime() + amount * 60 * 1000);
    if (unit === "hours") return new Date(start.getTime() + amount * 60 * 60 * 1000);
    if (unit === "days") return new Date(start.getTime() + amount * 24 * 60 * 60 * 1000);
    if (unit === "weeks") return new Date(start.getTime() + amount * 7 * 24 * 60 * 60 * 1000);
    if (unit === "months") {
      start.setMonth(start.getMonth() + amount);
      return start;
    }
  }

  return null;
}

async function sendDueServiceContinuationEmails(now = new Date()) {
  const dueActivities = await Activity.find({
    status: "Completed",
    completedAt: { $ne: null },
    "serviceBilling.nextCustomerEmailAt": { $lte: now },
    $or: [
      { "serviceBilling.customerEmailSentAt": { $exists: false } },
      { "serviceBilling.customerEmailSentAt": null },
    ],
  }).populate("relatedTo.recordId");

  let sent = 0;
  for (const activity of dueActivities) {
    const serviceBilling = activity.serviceBilling || {};
    try {
      const relatedRecord = activity?.relatedTo?.recordId;
      const email = String(relatedRecord?.email || relatedRecord?.secondaryEmail || "").trim();
      if (!email) {
        continue;
      }

      await sendServiceContinuationEmail({
        to: email,
        recipientName: relatedRecord?.name || relatedRecord?.company || activity?.relatedTo?.recordName || "Customer",
        activity,
        serviceDetails: serviceBilling,
      });

      activity.serviceBilling = {
        ...serviceBilling,
        customerEmailSentAt: now,
      };
      await activity.save();
      sent += 1;
    } catch (error) {
      console.error("Service continuation email failed:", error.message);
    }
  }

  return { sent, checked: dueActivities.length };
}

function startServiceLifecycleJob() {
  setInterval(() => {
    sendDueServiceContinuationEmails().catch((error) => {
      console.error("Service lifecycle job failed:", error.message);
    });
  }, SERVICE_EMAIL_SCAN_INTERVAL_MS);
}

module.exports = {
  addServiceInterval,
  sendDueServiceContinuationEmails,
  startServiceLifecycleJob,
};