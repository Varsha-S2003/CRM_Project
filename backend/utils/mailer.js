const nodemailer = require("nodemailer");
const AppSettings = require("../models/appSettings");

let transporter;

function buildEnvEmailConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };
}

function hasCompleteEmailConfig(config) {
  return Boolean(config?.host && config?.auth?.user && config?.auth?.pass);
}

function isEtherealConfig(config) {
  return config?.host === "smtp.ethereal.email";
}

function isGmailConfig(config) {
  return config?.host === "smtp.gmail.com" || config?.service === "gmail";
}

async function getEmailConfig() {
  const envConfig = buildEnvEmailConfig();
  if (hasCompleteEmailConfig(envConfig)) {
    try {
      await AppSettings.updateOne({}, { $set: { email: envConfig } }, { upsert: true });
      console.log("SMTP settings loaded from .env.");
    } catch (e) {
      console.error("Failed to persist env SMTP settings:", e.message);
    }
    return envConfig;
  }

  const settings = await AppSettings.findOne();
  if (hasCompleteEmailConfig(settings?.email)) {
    return settings.email;
  }

  return {};
}

async function getTransporter() {
  transporter = null;

  console.log("Initializing email service...");
  let emailConfig = await getEmailConfig();

  if (process.env.NODE_ENV !== "production" && !hasCompleteEmailConfig(emailConfig)) {
    console.log("No real SMTP settings found; creating Ethereal test account...");
    const testAccount = await nodemailer.createTestAccount();
    emailConfig = {
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    };
  }

  if (!hasCompleteEmailConfig(emailConfig)) {
    const missing = [];
    if (!emailConfig.host) missing.push("SMTP host");
    if (!emailConfig.auth?.user) missing.push("SMTP username");
    if (!emailConfig.auth?.pass) missing.push("SMTP password");

    throw new Error(
      `Email not configured. Missing: ${missing.join(", ")}. Please configure email settings in the admin panel.`
    );
  }

  const newTransporter = nodemailer.createTransport({
    ...emailConfig,
    secure: emailConfig.secure || false,
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    await newTransporter.verify();
    console.log("Email service ready!");
  } catch (err) {
    console.error("Email connection failed:", err.message);
    const gmailHint = isGmailConfig(emailConfig)
      ? " Gmail SMTP usually requires a Google App Password, not the normal Gmail password."
      : "";
    throw new Error(
      `Failed to connect to email service: ${err.message}. Please check your email configuration.${gmailHint}`
    );
  }

  transporter = newTransporter;
  return transporter;
}

async function sendPasswordResetEmail({ to, resetUrl, name }) {
  const mailer = await getTransporter();
  const appName = "Elogixa CRM";
  const emailConfig = await getEmailConfig();
  const sender = emailConfig.auth?.user || "";

  const result = await mailer.sendMail({
    from: `"${appName}" <${sender}>`,
    to,
    subject: `${appName} - Password Reset`,
    text: [
      `Hello ${name || "there"},`,
      "",
      "We received a request to reset your password.",
      "",
      `Reset your password using this link: ${resetUrl}`,
      "",
      "This link will expire in 1 hour.",
      "",
      "If you did not request this, you can ignore this email."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4f46e5; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">${appName}</h1>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Password Reset</h2>
          <p style="color: #4b5563; font-size: 16px;">
            Hello ${name || "there"},<br>
            We received a request to reset your password for ${appName}.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="display: inline-block; padding: 14px 28px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">
            Or copy this link to your browser:<br>
            <span style="color: #4f46e5;">${resetUrl}</span>
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
            This link will expire in 1 hour.<br>
            If you did not request this, you can ignore this email.
          </p>
        </div>
      </div>
    `
  });

  const preview = isEtherealConfig(emailConfig) ? nodemailer.getTestMessageUrl(result) : null;
  if (preview) {
    console.log("Ethereal preview URL:", preview);
  }
  console.log("Password reset email sent to:", to);

  return { result, preview };
}

async function sendLeadProposalEmail({ to, leadName, company, proposal = {} }) {
  const mailer = await getTransporter();
  const appName = "Elogixa CRM";
  const emailConfig = await getEmailConfig();
  const sender = emailConfig.auth?.user || "";

  const amountValue = Number(proposal.amount);
  const hasAmount = Number.isFinite(amountValue) && amountValue >= 0;
  const currency = String(proposal.currency || "INR").trim().toUpperCase() || "INR";
  const subject = String(proposal.subject || "").trim() || `Proposal for ${company || leadName || "your requirement"}`;
  const message = String(proposal.message || "").trim();
  const terms = String(proposal.terms || "").trim();
  const validUntil = proposal.validUntil ? new Date(proposal.validUntil) : null;
  const validUntilLabel = validUntil && !Number.isNaN(validUntil.getTime())
    ? validUntil.toLocaleDateString()
    : "Not specified";

  const result = await mailer.sendMail({
    from: `"${appName}" <${sender}>`,
    to,
    subject,
    text: [
      `Hello ${leadName || "Customer"},`,
      "",
      "Please find our proposal details below:",
      hasAmount ? `Amount: ${currency} ${amountValue.toFixed(2)}` : "Amount: Not specified",
      `Valid Until: ${validUntilLabel}`,
      "",
      message || "No additional message provided.",
      "",
      terms ? `Terms: ${terms}` : "",
      "",
      `Regards,`,
      appName,
    ].filter(Boolean).join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
        <div style="background: #0f766e; padding: 16px 20px; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px;">${appName} Proposal</h2>
        </div>
        <div style="padding: 20px; background: #ffffff; color: #111827;">
          <p style="margin: 0 0 12px;">Hello ${leadName || "Customer"},</p>
          <p style="margin: 0 0 16px;">Please find our proposal details below.</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600; width: 160px;">Subject</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${subject}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Amount</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${hasAmount ? `${currency} ${amountValue.toFixed(2)}` : "Not specified"}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Valid Until</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${validUntilLabel}</td>
            </tr>
          </table>
          <p style="margin: 0 0 12px; white-space: pre-line;">${message || "No additional message provided."}</p>
          ${terms ? `<p style="margin: 0; white-space: pre-line;"><strong>Terms:</strong><br/>${terms}</p>` : ""}
        </div>
      </div>
    `,
  });

  const preview = isEtherealConfig(emailConfig) ? nodemailer.getTestMessageUrl(result) : null;
  if (preview) {
    console.log("Ethereal proposal preview URL:", preview);
  }

  return { result, preview };
}

async function sendActivityReminderEmail({
  to,
  ownerName,
  activity = {},
}) {
  const mailer = await getTransporter();
  const appName = "Elogixa CRM";
  const emailConfig = await getEmailConfig();
  const sender = emailConfig.auth?.user || "";

  const activityType = String(activity.activityType || "activity").toUpperCase();
  const title = String(activity.title || "Upcoming activity").trim();
  const relatedName = String(activity.relatedTo?.recordName || "CRM record").trim();
  const relatedType = String(activity.relatedTo?.recordType || "Record").trim();
  const reminderTime = activity.reminderTime ? new Date(activity.reminderTime) : null;
  const reminderLabel = reminderTime && !Number.isNaN(reminderTime.getTime())
    ? reminderTime.toLocaleString()
    : "Soon";
  const description = String(activity.description || activity.notes || "").trim();

  const result = await mailer.sendMail({
    from: `"${appName}" <${sender}>`,
    to,
    subject: `${appName} Reminder: ${title}`,
    text: [
      `Hello ${ownerName || "there"},`,
      "",
      "This is your upcoming CRM activity reminder.",
      `Type: ${activityType}`,
      `Title: ${title}`,
      `Related: ${relatedType} - ${relatedName}`,
      `Reminder Time: ${reminderLabel}`,
      description ? "" : null,
      description ? `Notes: ${description}` : null,
      "",
      "Please follow up on time.",
      appName,
    ].filter(Boolean).join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;">
        <div style="background: #1d4ed8; padding: 16px 20px; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px;">${appName} Activity Reminder</h2>
        </div>
        <div style="padding: 20px; background: #ffffff; color: #111827;">
          <p style="margin: 0 0 12px;">Hello ${ownerName || "there"},</p>
          <p style="margin: 0 0 16px;">This is your upcoming CRM activity reminder.</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600; width: 160px;">Type</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${activityType}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Title</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${title}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Related</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${relatedType} - ${relatedName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: 600;">Reminder Time</td>
              <td style="padding: 8px; border: 1px solid #e5e7eb;">${reminderLabel}</td>
            </tr>
          </table>
          ${description ? `<p style="margin: 0; white-space: pre-line;"><strong>Notes:</strong><br/>${description}</p>` : ""}
        </div>
      </div>
    `,
  });

  const preview = isEtherealConfig(emailConfig) ? nodemailer.getTestMessageUrl(result) : null;
  if (preview) {
    console.log("Ethereal activity reminder preview URL:", preview);
  }

  return { result, preview };
}

module.exports = {
  sendPasswordResetEmail,
  sendLeadProposalEmail,
  sendActivityReminderEmail,
};
