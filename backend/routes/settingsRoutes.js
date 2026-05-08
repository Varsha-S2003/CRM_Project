const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { verifyToken } = require("../middleware/authMiddleware");
const AppSettings = require("../models/appSettings");
const User = require("../models/user");

async function getOrCreateAppSettings() {
  let settings = await AppSettings.findOne();
  if (!settings) {
    settings = await AppSettings.create({});
  }
  return settings;
}

function listToText(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function textToList(value, fallback = []) {
  if (typeof value !== "string") {
    return fallback;
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : fallback;
}

function numberOrFallback(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function buildResponseForRole(user, appSettings) {
  const role = (user.role || "").toUpperCase();
  const base = {
    role,
    profile: {
      name: user.name || "",
      username: user.username || "",
      email: user.email || "",
      phone: user.phone || "",
      department: user.department || "",
      designation: user.designation || "",
      employee_id: user.employee_id || ""
    },
    preferences: {
      theme: user.settings?.preferences?.theme || "light",
      density: user.settings?.preferences?.density || "comfortable",
      language: user.settings?.preferences?.language || "English",
      timezone: user.settings?.preferences?.timezone || "Asia/Kolkata",
      emailNotifications: user.settings?.preferences?.emailNotifications !== false,
      desktopNotifications: Boolean(user.settings?.preferences?.desktopNotifications),
      smsNotifications: Boolean(user.settings?.preferences?.smsNotifications),
      appNotifications: user.settings?.preferences?.appNotifications !== false,
      profileVisibleToTeam: user.settings?.preferences?.profileVisibleToTeam !== false,
      activityVisibleToManagers: user.settings?.preferences?.activityVisibleToManagers !== false,
      shareEmailWithTeam: Boolean(user.settings?.preferences?.shareEmailWithTeam)
    }
  };

  if (role === "ADMIN") {
    return {
      ...base,
      sections: {
        organization: {
          companyName: appSettings.companyName,
          supportEmail: appSettings.supportEmail,
          frontendUrl: appSettings.frontendUrl || "http://localhost:3000",
          backendUrl: appSettings.backendUrl || "http://localhost:5000",
          primaryColor: appSettings.branding?.primaryColor || "#4f46e5",
          accentColor: appSettings.branding?.accentColor || "#22c55e",
          compactSidebar: Boolean(appSettings.branding?.compactSidebar)
        },
        security: {
          mfaRequired: Boolean(appSettings.security?.mfaRequired),
          sessionTimeoutMinutes: appSettings.security?.sessionTimeoutMinutes || 480,
          passwordRotationDays: appSettings.security?.passwordRotationDays || 90,
          ipWhitelist: (appSettings.security?.ipWhitelist || []).join(", ")
        },
        automation: {
          leadAutoAssign: Boolean(appSettings.automation?.leadAutoAssign),
          dealApprovalRequired: Boolean(appSettings.automation?.dealApprovalRequired),
          inventoryAlerts: Boolean(appSettings.automation?.inventoryAlerts),
          onboardingEmails: Boolean(user.settings?.adminSettings?.onboardingEmails),
          auditAlerts: Boolean(user.settings?.adminSettings?.auditAlerts),
          approvalMode: user.settings?.adminSettings?.approvalMode || "balanced"
        },
        pipeline: {
          dealStages: listToText(appSettings.pipeline?.dealStages || [
            "Qualification",
            "Need Analysis",
            "Value Proposition",
            "Proposal",
            "Negotiation",
            "Closed Won",
            "Closed Lost"
          ]),
          defaultProbability: appSettings.pipeline?.defaultProbability ?? 10,
          staleDealDays: appSettings.pipeline?.staleDealDays ?? 14,
          requireLostReason: appSettings.pipeline?.requireLostReason !== false
        },
        leadManagement: {
          leadSources: listToText(appSettings.leadManagement?.leadSources || [
            "Website",
            "Referral",
            "Email Campaign",
            "Social Media",
            "Cold Call"
          ]),
          autoAssignLeads: appSettings.leadManagement?.autoAssignLeads !== false,
          followUpSlaHours: appSettings.leadManagement?.followUpSlaHours ?? 24,
          duplicateLeadRule: appSettings.leadManagement?.duplicateLeadRule || "email_or_phone"
        },
        invoiceDefaults: {
          currency: appSettings.invoiceDefaults?.currency || "INR",
          paymentTermsDays: appSettings.invoiceDefaults?.paymentTermsDays ?? 15,
          gstPercent: appSettings.invoiceDefaults?.gstPercent ?? 18,
          invoicePrefix: appSettings.invoiceDefaults?.invoicePrefix || "INV",
          notes: appSettings.invoiceDefaults?.notes || "Thank you for your business.",
          terms: appSettings.invoiceDefaults?.terms || "Payment is due by the invoice due date."
        },
        notificationDefaults: {
          leadAssigned: appSettings.notificationDefaults?.leadAssigned !== false,
          dealWon: appSettings.notificationDefaults?.dealWon !== false,
          invoiceOverdue: appSettings.notificationDefaults?.invoiceOverdue !== false,
          lowInventory: appSettings.notificationDefaults?.lowInventory !== false,
          dailyDigest: Boolean(appSettings.notificationDefaults?.dailyDigest)
        },
        userAccess: {
          defaultRole: appSettings.userAccess?.defaultRole || "EMPLOYEE",
          allowManagersCreateUsers: Boolean(appSettings.userAccess?.allowManagersCreateUsers),
          requireManagerForEmployee: appSettings.userAccess?.requireManagerForEmployee !== false
        },
        customization: {
          customLeadFields: listToText(appSettings.customization?.customLeadFields || ["Budget", "Decision Maker"]),
          customCustomerFields: listToText(appSettings.customization?.customCustomerFields || ["GSTIN", "Customer Type"]),
          defaultTheme: appSettings.customization?.defaultTheme || "light",
          defaultDensity: appSettings.customization?.defaultDensity || "comfortable"
        },
        integrations: {
          emailConnected: Boolean(appSettings.integrations?.emailConnected),
          calendarConnected: Boolean(appSettings.integrations?.calendarConnected),
          googleCalendarUrl: appSettings.integrations?.googleCalendarUrl || "",
          microsoftCalendarUrl: appSettings.integrations?.microsoftCalendarUrl || "",
          webhookUrl: appSettings.integrations?.webhookUrl || "",
          thirdPartyApps: listToText(appSettings.integrations?.thirdPartyApps || ["Google Workspace", "Microsoft 365"])
        },
        systemConfiguration: {
          workflowRules: listToText(appSettings.systemConfiguration?.workflowRules || [
            "Assign new leads",
            "Create follow-up task after lead contact"
          ]),
          automationEnabled: appSettings.systemConfiguration?.automationEnabled !== false,
          autoBackupEnabled: appSettings.systemConfiguration?.autoBackupEnabled !== false,
          dataRetentionDays: appSettings.systemConfiguration?.dataRetentionDays ?? 365,
          allowDataExport: appSettings.systemConfiguration?.allowDataExport !== false
        },
        email: {
          service: appSettings.email?.service || "",
          host: appSettings.email?.host || "",
          port: appSettings.email?.port || 587,
          secure: Boolean(appSettings.email?.secure),
          auth: {
            user: appSettings.email?.auth?.user || "",
            pass: appSettings.email?.auth?.pass ? "******" : ""
          }
        }
      }
    };
  }

  if (role === "MANAGER") {
    return {
      ...base,
      sections: {
        team: {
          leadVisibility: user.settings?.managerSettings?.leadVisibility || "team",
          dealApprovalLimit: user.settings?.managerSettings?.dealApprovalLimit || 50000,
          weeklyDigest: Boolean(user.settings?.managerSettings?.weeklyDigest),
          performanceNotifications: Boolean(user.settings?.managerSettings?.performanceNotifications)
        }
      }
    };
  }

  return {
    ...base,
    sections: {
      workspace: {
        dashboardLayout: user.settings?.employeeSettings?.dashboardLayout || "focus",
        leadReminders: Boolean(user.settings?.employeeSettings?.leadReminders),
        taskNotifications: Boolean(user.settings?.employeeSettings?.taskNotifications),
        dailySummary: Boolean(user.settings?.employeeSettings?.dailySummary)
      }
    }
  };
}

router.get("/", verifyToken, async (req, res) => {
  try {
    const appSettings = await getOrCreateAppSettings();
    const refreshedUser = await User.findById(req.user._id).select("-password");
    res.json(buildResponseForRole(refreshedUser, appSettings));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/", verifyToken, async (req, res) => {
  try {
    const role = (req.user.role || "").toUpperCase();
    const { profile = {}, preferences = {}, sections = {} } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.name = typeof profile.name === "string" ? profile.name.trim() : user.name;
    if (typeof profile.email === "string" && profile.email.trim() && profile.email.trim() !== user.email) {
      const normalizedEmail = profile.email.trim().toLowerCase();
      const existingEmailUser = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id }
      }).select("_id");
      if (existingEmailUser) {
        return res.status(409).json({ message: "Email is already used by another account." });
      }
      user.email = normalizedEmail;
    }
    user.phone = typeof profile.phone === "string" ? profile.phone.trim() : user.phone;
    user.department = typeof profile.department === "string" ? profile.department.trim() : user.department;
    user.designation = typeof profile.designation === "string" ? profile.designation.trim() : user.designation;

    if (profile.newPassword || profile.confirmPassword || profile.currentPassword) {
      if (!profile.currentPassword) {
        return res.status(400).json({ message: "Current password is required to change password." });
      }
      if (!profile.newPassword || profile.newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters." });
      }
      if (profile.newPassword !== profile.confirmPassword) {
        return res.status(400).json({ message: "New password and confirmation do not match." });
      }
      const passwordMatches = await bcrypt.compare(profile.currentPassword, user.password);
      if (!passwordMatches) {
        return res.status(400).json({ message: "Current password is incorrect." });
      }
      user.password = await bcrypt.hash(profile.newPassword, 10);
    }

    user.settings = user.settings || {};
    user.settings.preferences = {
      ...user.settings.preferences,
      theme: preferences.theme || user.settings.preferences?.theme || "light",
      density: preferences.density || user.settings.preferences?.density || "comfortable",
      language: preferences.language || user.settings.preferences?.language || "English",
      timezone: preferences.timezone || user.settings.preferences?.timezone || "Asia/Kolkata",
      emailNotifications:
        typeof preferences.emailNotifications === "boolean"
          ? preferences.emailNotifications
          : user.settings.preferences?.emailNotifications !== false,
      desktopNotifications:
        typeof preferences.desktopNotifications === "boolean"
          ? preferences.desktopNotifications
          : Boolean(user.settings.preferences?.desktopNotifications),
      smsNotifications:
        typeof preferences.smsNotifications === "boolean"
          ? preferences.smsNotifications
          : Boolean(user.settings.preferences?.smsNotifications),
      appNotifications:
        typeof preferences.appNotifications === "boolean"
          ? preferences.appNotifications
          : user.settings.preferences?.appNotifications !== false,
      profileVisibleToTeam:
        typeof preferences.profileVisibleToTeam === "boolean"
          ? preferences.profileVisibleToTeam
          : user.settings.preferences?.profileVisibleToTeam !== false,
      activityVisibleToManagers:
        typeof preferences.activityVisibleToManagers === "boolean"
          ? preferences.activityVisibleToManagers
          : user.settings.preferences?.activityVisibleToManagers !== false,
      shareEmailWithTeam:
        typeof preferences.shareEmailWithTeam === "boolean"
          ? preferences.shareEmailWithTeam
          : Boolean(user.settings.preferences?.shareEmailWithTeam)
    };

    if (role === "ADMIN") {
      const appSettings = await getOrCreateAppSettings();
      const organization = sections.organization || {};
      const security = sections.security || {};
      const automation = sections.automation || {};
      const pipeline = sections.pipeline || {};
      const leadManagement = sections.leadManagement || {};
      const invoiceDefaults = sections.invoiceDefaults || {};
      const notificationDefaults = sections.notificationDefaults || {};
      const userAccess = sections.userAccess || {};
      const customization = sections.customization || {};
      const integrations = sections.integrations || {};
      const systemConfiguration = sections.systemConfiguration || {};

      appSettings.companyName = organization.companyName?.trim() || appSettings.companyName;
      appSettings.supportEmail = organization.supportEmail?.trim() || appSettings.supportEmail;
      // allow admin to configure frontend URL here as well
      if (typeof organization.frontendUrl === "string" && organization.frontendUrl.trim()) {
        appSettings.frontendUrl = organization.frontendUrl.trim();
      }
      if (typeof organization.backendUrl === "string" && organization.backendUrl.trim()) {
        appSettings.backendUrl = organization.backendUrl.trim();
      }
      // email settings come from organization.email sub‑object; overwrite individual fields
      if (organization.email && typeof organization.email === "object") {
        appSettings.email = {
          ...appSettings.email,
          service: organization.email.service || appSettings.email.service,
          host: organization.email.host || appSettings.email.host,
          port: organization.email.port || appSettings.email.port,
          secure:
            typeof organization.email.secure === "boolean"
              ? organization.email.secure
              : appSettings.email.secure,
          auth: {
            user: organization.email.user || appSettings.email.auth?.user,
            pass: organization.email.pass || appSettings.email.auth?.pass
          }
        };
      }
      appSettings.branding = {
        ...appSettings.branding,
        primaryColor: organization.primaryColor || appSettings.branding?.primaryColor || "#4f46e5",
        accentColor: organization.accentColor || appSettings.branding?.accentColor || "#22c55e",
        compactSidebar:
          typeof organization.compactSidebar === "boolean"
            ? organization.compactSidebar
            : Boolean(appSettings.branding?.compactSidebar)
      };
      appSettings.security = {
        ...appSettings.security,
        mfaRequired:
          typeof security.mfaRequired === "boolean"
            ? security.mfaRequired
            : Boolean(appSettings.security?.mfaRequired),
        sessionTimeoutMinutes:
          Number(security.sessionTimeoutMinutes) || appSettings.security?.sessionTimeoutMinutes || 480,
        passwordRotationDays:
          Number(security.passwordRotationDays) || appSettings.security?.passwordRotationDays || 90,
        ipWhitelist:
          typeof security.ipWhitelist === "string"
            ? security.ipWhitelist.split(",").map((item) => item.trim()).filter(Boolean)
            : appSettings.security?.ipWhitelist || []
      };
      appSettings.automation = {
        ...appSettings.automation,
        leadAutoAssign:
          typeof automation.leadAutoAssign === "boolean"
            ? automation.leadAutoAssign
            : Boolean(appSettings.automation?.leadAutoAssign),
        dealApprovalRequired:
          typeof automation.dealApprovalRequired === "boolean"
            ? automation.dealApprovalRequired
            : Boolean(appSettings.automation?.dealApprovalRequired),
        inventoryAlerts:
          typeof automation.inventoryAlerts === "boolean"
            ? automation.inventoryAlerts
            : Boolean(appSettings.automation?.inventoryAlerts)
      };
      appSettings.pipeline = {
        ...appSettings.pipeline,
        dealStages: textToList(pipeline.dealStages, appSettings.pipeline?.dealStages || []),
        defaultProbability: numberOrFallback(
          pipeline.defaultProbability,
          appSettings.pipeline?.defaultProbability ?? 10
        ),
        staleDealDays: numberOrFallback(pipeline.staleDealDays, appSettings.pipeline?.staleDealDays ?? 14),
        requireLostReason:
          typeof pipeline.requireLostReason === "boolean"
            ? pipeline.requireLostReason
            : appSettings.pipeline?.requireLostReason !== false
      };
      appSettings.leadManagement = {
        ...appSettings.leadManagement,
        leadSources: textToList(leadManagement.leadSources, appSettings.leadManagement?.leadSources || []),
        autoAssignLeads:
          typeof leadManagement.autoAssignLeads === "boolean"
            ? leadManagement.autoAssignLeads
            : appSettings.leadManagement?.autoAssignLeads !== false,
        followUpSlaHours: numberOrFallback(
          leadManagement.followUpSlaHours,
          appSettings.leadManagement?.followUpSlaHours ?? 24
        ),
        duplicateLeadRule:
          ["email", "phone", "email_or_phone"].includes(leadManagement.duplicateLeadRule)
            ? leadManagement.duplicateLeadRule
            : appSettings.leadManagement?.duplicateLeadRule || "email_or_phone"
      };
      appSettings.invoiceDefaults = {
        ...appSettings.invoiceDefaults,
        currency: invoiceDefaults.currency?.trim() || appSettings.invoiceDefaults?.currency || "INR",
        paymentTermsDays: numberOrFallback(
          invoiceDefaults.paymentTermsDays,
          appSettings.invoiceDefaults?.paymentTermsDays ?? 15
        ),
        gstPercent: numberOrFallback(invoiceDefaults.gstPercent, appSettings.invoiceDefaults?.gstPercent ?? 18),
        invoicePrefix: invoiceDefaults.invoicePrefix?.trim() || appSettings.invoiceDefaults?.invoicePrefix || "INV",
        notes:
          typeof invoiceDefaults.notes === "string"
            ? invoiceDefaults.notes.trim()
            : appSettings.invoiceDefaults?.notes || "",
        terms:
          typeof invoiceDefaults.terms === "string"
            ? invoiceDefaults.terms.trim()
            : appSettings.invoiceDefaults?.terms || ""
      };
      appSettings.notificationDefaults = {
        ...appSettings.notificationDefaults,
        leadAssigned:
          typeof notificationDefaults.leadAssigned === "boolean"
            ? notificationDefaults.leadAssigned
            : appSettings.notificationDefaults?.leadAssigned !== false,
        dealWon:
          typeof notificationDefaults.dealWon === "boolean"
            ? notificationDefaults.dealWon
            : appSettings.notificationDefaults?.dealWon !== false,
        invoiceOverdue:
          typeof notificationDefaults.invoiceOverdue === "boolean"
            ? notificationDefaults.invoiceOverdue
            : appSettings.notificationDefaults?.invoiceOverdue !== false,
        lowInventory:
          typeof notificationDefaults.lowInventory === "boolean"
            ? notificationDefaults.lowInventory
            : appSettings.notificationDefaults?.lowInventory !== false,
        dailyDigest:
          typeof notificationDefaults.dailyDigest === "boolean"
            ? notificationDefaults.dailyDigest
            : Boolean(appSettings.notificationDefaults?.dailyDigest)
      };
      appSettings.userAccess = {
        ...appSettings.userAccess,
        defaultRole:
          ["EMPLOYEE", "MANAGER"].includes(userAccess.defaultRole)
            ? userAccess.defaultRole
            : appSettings.userAccess?.defaultRole || "EMPLOYEE",
        allowManagersCreateUsers:
          typeof userAccess.allowManagersCreateUsers === "boolean"
            ? userAccess.allowManagersCreateUsers
            : Boolean(appSettings.userAccess?.allowManagersCreateUsers),
        requireManagerForEmployee:
          typeof userAccess.requireManagerForEmployee === "boolean"
            ? userAccess.requireManagerForEmployee
            : appSettings.userAccess?.requireManagerForEmployee !== false
      };
      appSettings.customization = {
        ...appSettings.customization,
        customLeadFields: textToList(
          customization.customLeadFields,
          appSettings.customization?.customLeadFields || ["Budget", "Decision Maker"]
        ),
        customCustomerFields: textToList(
          customization.customCustomerFields,
          appSettings.customization?.customCustomerFields || ["GSTIN", "Customer Type"]
        ),
        defaultTheme: customization.defaultTheme || appSettings.customization?.defaultTheme || "light",
        defaultDensity: customization.defaultDensity || appSettings.customization?.defaultDensity || "comfortable"
      };
      appSettings.integrations = {
        ...appSettings.integrations,
        emailConnected:
          typeof integrations.emailConnected === "boolean"
            ? integrations.emailConnected
            : Boolean(appSettings.integrations?.emailConnected),
        calendarConnected:
          typeof integrations.calendarConnected === "boolean"
            ? integrations.calendarConnected
            : Boolean(appSettings.integrations?.calendarConnected),
        googleCalendarUrl:
          typeof integrations.googleCalendarUrl === "string"
            ? integrations.googleCalendarUrl.trim()
            : appSettings.integrations?.googleCalendarUrl || "",
        microsoftCalendarUrl:
          typeof integrations.microsoftCalendarUrl === "string"
            ? integrations.microsoftCalendarUrl.trim()
            : appSettings.integrations?.microsoftCalendarUrl || "",
        webhookUrl:
          typeof integrations.webhookUrl === "string"
            ? integrations.webhookUrl.trim()
            : appSettings.integrations?.webhookUrl || "",
        thirdPartyApps: textToList(
          integrations.thirdPartyApps,
          appSettings.integrations?.thirdPartyApps || ["Google Workspace", "Microsoft 365"]
        )
      };
      appSettings.systemConfiguration = {
        ...appSettings.systemConfiguration,
        workflowRules: textToList(
          systemConfiguration.workflowRules,
          appSettings.systemConfiguration?.workflowRules || [
            "Assign new leads",
            "Create follow-up task after lead contact"
          ]
        ),
        automationEnabled:
          typeof systemConfiguration.automationEnabled === "boolean"
            ? systemConfiguration.automationEnabled
            : appSettings.systemConfiguration?.automationEnabled !== false,
        autoBackupEnabled:
          typeof systemConfiguration.autoBackupEnabled === "boolean"
            ? systemConfiguration.autoBackupEnabled
            : appSettings.systemConfiguration?.autoBackupEnabled !== false,
        dataRetentionDays: numberOrFallback(
          systemConfiguration.dataRetentionDays,
          appSettings.systemConfiguration?.dataRetentionDays ?? 365
        ),
        allowDataExport:
          typeof systemConfiguration.allowDataExport === "boolean"
            ? systemConfiguration.allowDataExport
            : appSettings.systemConfiguration?.allowDataExport !== false
      };

      // Handle email configuration
      if (sections.email) {
        const email = sections.email;
        const currentPassword = appSettings.email?.auth?.pass || "";
        const incomingPassword = email.auth?.pass;
        appSettings.email = {
          service: email.service?.trim() || "",
          host: email.host?.trim() || "",
          port: Number(email.port) || 587,
          secure: typeof email.secure === "boolean" ? email.secure : false,
          auth: {
            user: email.auth?.user?.trim() || "",
            pass:
              incomingPassword && incomingPassword !== "******"
                ? incomingPassword
                : currentPassword
          }
        };
      }

      user.settings.adminSettings = {
        ...user.settings.adminSettings,
        onboardingEmails:
          typeof automation.onboardingEmails === "boolean"
            ? automation.onboardingEmails
            : Boolean(user.settings.adminSettings?.onboardingEmails),
        auditAlerts:
          typeof automation.auditAlerts === "boolean"
            ? automation.auditAlerts
            : Boolean(user.settings.adminSettings?.auditAlerts),
        approvalMode: automation.approvalMode || user.settings.adminSettings?.approvalMode || "balanced"
      };

      await Promise.all([user.save(), appSettings.save()]);
      const refreshedUser = await User.findById(req.user._id).select("-password");
      return res.json(buildResponseForRole(refreshedUser, appSettings));
    }

    if (role === "MANAGER") {
      const team = sections.team || {};
      user.settings.managerSettings = {
        ...user.settings.managerSettings,
        leadVisibility: team.leadVisibility || user.settings.managerSettings?.leadVisibility || "team",
        dealApprovalLimit:
          Number(team.dealApprovalLimit) || user.settings.managerSettings?.dealApprovalLimit || 50000,
        weeklyDigest:
          typeof team.weeklyDigest === "boolean"
            ? team.weeklyDigest
            : Boolean(user.settings.managerSettings?.weeklyDigest),
        performanceNotifications:
          typeof team.performanceNotifications === "boolean"
            ? team.performanceNotifications
            : Boolean(user.settings.managerSettings?.performanceNotifications)
      };
    }

    if (role === "EMPLOYEE") {
      const workspace = sections.workspace || {};
      user.settings.employeeSettings = {
        ...user.settings.employeeSettings,
        dashboardLayout: workspace.dashboardLayout || user.settings.employeeSettings?.dashboardLayout || "focus",
        leadReminders:
          typeof workspace.leadReminders === "boolean"
            ? workspace.leadReminders
            : Boolean(user.settings.employeeSettings?.leadReminders),
        taskNotifications:
          typeof workspace.taskNotifications === "boolean"
            ? workspace.taskNotifications
            : Boolean(user.settings.employeeSettings?.taskNotifications),
        dailySummary:
          typeof workspace.dailySummary === "boolean"
            ? workspace.dailySummary
            : Boolean(user.settings.employeeSettings?.dailySummary)
      };
    }

    await user.save();
    const appSettings = await getOrCreateAppSettings();
    const refreshedUser = await User.findById(req.user._id).select("-password");
    res.json(buildResponseForRole(refreshedUser, appSettings));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
