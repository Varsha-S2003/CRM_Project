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

module.exports = {
  sendPasswordResetEmail
};
