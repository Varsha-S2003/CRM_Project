const express = require("express");
const router = express.Router();
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
      emailNotifications: Boolean(user.settings?.preferences?.emailNotifications),
      desktopNotifications: Boolean(user.settings?.preferences?.desktopNotifications)
    }
  };

  if (role === "ADMIN") {
    return {
      ...base,
      sections: {
        organization: {
          companyName: appSettings.companyName,
          supportEmail: appSettings.supportEmail,
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
    user.phone = typeof profile.phone === "string" ? profile.phone.trim() : user.phone;
    user.department = typeof profile.department === "string" ? profile.department.trim() : user.department;
    user.designation = typeof profile.designation === "string" ? profile.designation.trim() : user.designation;

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
          : Boolean(user.settings.preferences?.emailNotifications),
      desktopNotifications:
        typeof preferences.desktopNotifications === "boolean"
          ? preferences.desktopNotifications
          : Boolean(user.settings.preferences?.desktopNotifications)
    };

    if (role === "ADMIN") {
      const appSettings = await getOrCreateAppSettings();
      const organization = sections.organization || {};
      const security = sections.security || {};
      const automation = sections.automation || {};

      appSettings.companyName = organization.companyName?.trim() || appSettings.companyName;
      appSettings.supportEmail = organization.supportEmail?.trim() || appSettings.supportEmail;
      // allow admin to configure frontend URL here as well
      if (typeof organization.frontendUrl === "string" && organization.frontendUrl.trim()) {
        appSettings.frontendUrl = organization.frontendUrl.trim();
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

      // Handle email configuration
      if (sections.email) {
        const email = sections.email;
        appSettings.email = {
          service: email.service?.trim() || "",
          host: email.host?.trim() || "",
          port: Number(email.port) || 587,
          secure: typeof email.secure === "boolean" ? email.secure : false,
          auth: {
            user: email.auth?.user?.trim() || "",
            pass: email.auth?.pass || ""
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
