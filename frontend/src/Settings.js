import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./Settings.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

function applyThemePreference(theme) {
  if (typeof document === "undefined") return;
  const preferredTheme = theme || "light";
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const resolvedTheme = preferredTheme === "system" ? (systemDark ? "dark" : "light") : preferredTheme;

  document.documentElement.dataset.theme = resolvedTheme === "dark" ? "dark" : "light";
  localStorage.setItem("theme", preferredTheme);
}

function syncNotificationPreferences(preferences = {}) {
  localStorage.setItem("crmAppNotifications", preferences.appNotifications === false ? "false" : "true");
  localStorage.setItem("crmDesktopNotifications", preferences.desktopNotifications ? "true" : "false");
  localStorage.setItem("crmEmailNotifications", preferences.emailNotifications === false ? "false" : "true");
}

const settingsNav = [
  { id: "profile", label: "User Profile" },
  { id: "securityPermissions", label: "Security & Permissions" },
  { id: "customization", label: "Customization" },
  { id: "notifications", label: "Notifications" },
  { id: "integrations", label: "Integrations" },
  { id: "systemConfiguration", label: "System Configuration" }
];

function getToken() {
  return localStorage.getItem("token");
}

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [formData, setFormData] = useState(null);
  const [activeSection, setActiveSection] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const role = settings?.role || "EMPLOYEE";
  const isAdmin = role === "ADMIN";

  const visibleNav = useMemo(() => {
    if (isAdmin) return settingsNav;
    return settingsNav.filter((item) => ["profile", "securityPermissions", "customization", "notifications"].includes(item.id));
  }, [isAdmin]);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = getToken();
      if (!token) {
        setError("No login session found. Please log in again.");
        return;
      }

      const response = await axios.get(`${API_BASE}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      applyThemePreference(response.data?.preferences?.theme);
      syncNotificationPreferences(response.data?.preferences);
      setSettings(response.data);
      setFormData({
        ...response.data,
        profile: {
          ...response.data.profile,
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        }
      });
      setActiveSection("profile");
    } catch (err) {
      const status = err.response?.status;
      const apiMessage = err.response?.data?.message;
      if (status === 401) {
        setError("Your session expired. Please log in again.");
        localStorage.removeItem("token");
        setTimeout(() => navigate("/login"), 1200);
      } else {
        setError(apiMessage || "Unable to load settings.");
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateProfile = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      profile: { ...prev.profile, [field]: value }
    }));
  };

  const updatePreferences = (field, value) => {
    if (field === "theme") {
      applyThemePreference(value);
    }
    setFormData((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, [field]: value }
    }));
  };

  const updateSection = (section, field, value) => {
    setFormData((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [section]: {
          ...(prev.sections?.[section] || {}),
          [field]: value
        }
      }
    }));
  };

  const updateNestedSection = (section, parent, field, value) => {
    setFormData((prev) => ({
      ...prev,
      sections: {
        ...prev.sections,
        [section]: {
          ...(prev.sections?.[section] || {}),
          [parent]: {
            ...(prev.sections?.[section]?.[parent] || {}),
            [field]: value
          }
        }
      }
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage("");
      setError("");
      const token = getToken();
      if (!token) {
        setError("No login session found. Please log in again.");
        return;
      }

      const response = await axios.put(`${API_BASE}/api/settings`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(response.data);
      setFormData({
        ...response.data,
        profile: {
          ...response.data.profile,
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        }
      });
      applyThemePreference(response.data?.preferences?.theme);
      syncNotificationPreferences(response.data?.preferences);
      localStorage.setItem("name", response.data.profile?.name || "");
      setMessage("Settings saved successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-layout">
        <Sidebar />
        <main className="main-content settings-page">
          <div className="settings-state">Loading settings...</div>
        </main>
      </div>
    );
  }

  if (!settings || !formData) {
    return (
      <div className="dashboard-layout">
        <Sidebar />
        <main className="main-content settings-page">
          <div className="settings-state">{error || "Settings are not available right now."}</div>
        </main>
      </div>
    );
  }

  const sections = formData.sections || {};

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content settings-page">
        <form className="settings-layout" onSubmit={handleSubmit}>
          <header className="settings-header">
            <div>
              <p className="settings-kicker">CRM Settings</p>
              <h1>Settings</h1>
              <p>Manage the core settings your CRM actually needs: profile, permissions, customization, alerts, integrations, and system rules.</p>
            </div>
            <div className="settings-header-actions">
              <span className="settings-role">{role}</span>
              <button type="button" className="settings-button secondary" onClick={fetchSettings}>
                Reset
              </button>
              <button type="submit" className="settings-button primary" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </header>

          {message && <div className="settings-alert success">{message}</div>}
          {error && <div className="settings-alert error">{error}</div>}

          <div className="settings-body">
            <aside className="settings-nav" aria-label="Settings sections">
              {visibleNav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeSection === item.id ? "active" : ""}
                  onClick={() => setActiveSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </aside>

            <div className="settings-content">
              {activeSection === "profile" && (
                <SettingsSection title="User Profile Settings" description="Update your name, email, phone, and password.">
                  <TextField label="Full name" value={formData.profile.name} onChange={(value) => updateProfile("name", value)} />
                  <TextField label="Email" type="email" value={formData.profile.email} onChange={(value) => updateProfile("email", value)} />
                  <TextField label="Phone" value={formData.profile.phone} onChange={(value) => updateProfile("phone", value)} />
                  <TextField label="Username" value={formData.profile.username} readOnly />
                  <TextField label="Department" value={formData.profile.department} onChange={(value) => updateProfile("department", value)} />
                  <TextField label="Designation" value={formData.profile.designation} onChange={(value) => updateProfile("designation", value)} />
                  <Divider label="Change Password" />
                  <TextField label="Current password" type="password" value={formData.profile.currentPassword} onChange={(value) => updateProfile("currentPassword", value)} />
                  <TextField label="New password" type="password" value={formData.profile.newPassword} onChange={(value) => updateProfile("newPassword", value)} />
                  <TextField label="Confirm new password" type="password" value={formData.profile.confirmPassword} onChange={(value) => updateProfile("confirmPassword", value)} />
                </SettingsSection>
              )}

              {activeSection === "securityPermissions" && (
                <SettingsSection title="Security & Permissions" description="Control role access, session security, and privacy preferences.">
                  {isAdmin && (
                    <>
                      <SelectField
                        label="Default new user role"
                        value={sections.userAccess?.defaultRole}
                        onChange={(value) => updateSection("userAccess", "defaultRole", value)}
                        options={[
                          ["EMPLOYEE", "Employee"],
                          ["MANAGER", "Manager"]
                        ]}
                      />
                      <ToggleField label="Managers can create users" helper="Allow managers to add team members." checked={sections.userAccess?.allowManagersCreateUsers} onChange={(value) => updateSection("userAccess", "allowManagersCreateUsers", value)} />
                      <ToggleField label="Employee must have manager" helper="Require reporting manager assignment." checked={sections.userAccess?.requireManagerForEmployee} onChange={(value) => updateSection("userAccess", "requireManagerForEmployee", value)} />
                      <ToggleField label="Require MFA" helper="Require multi-factor authentication when supported." checked={sections.security?.mfaRequired} onChange={(value) => updateSection("security", "mfaRequired", value)} />
                      <NumberField label="Session timeout (minutes)" value={sections.security?.sessionTimeoutMinutes} onChange={(value) => updateSection("security", "sessionTimeoutMinutes", value)} />
                      <NumberField label="Password rotation (days)" value={sections.security?.passwordRotationDays} onChange={(value) => updateSection("security", "passwordRotationDays", value)} />
                    </>
                  )}
                  <ToggleField label="Profile visible to team" helper="Let coworkers see your profile details." checked={formData.preferences.profileVisibleToTeam} onChange={(value) => updatePreferences("profileVisibleToTeam", value)} />
                  <ToggleField label="Activity visible to managers" helper="Allow managers to see your CRM activity." checked={formData.preferences.activityVisibleToManagers} onChange={(value) => updatePreferences("activityVisibleToManagers", value)} />
                  <ToggleField label="Share email with team" helper="Show your email inside team views." checked={formData.preferences.shareEmailWithTeam} onChange={(value) => updatePreferences("shareEmailWithTeam", value)} />
                  {isAdmin && <TextAreaField label="IP whitelist" value={sections.security?.ipWhitelist} onChange={(value) => updateSection("security", "ipWhitelist", value)} helper="Separate IP addresses with commas. Leave blank to allow all." />}
                </SettingsSection>
              )}

              {activeSection === "customization" && (
                <SettingsSection title="Customization Settings" description="Configure custom fields, theme, language, timezone, and personal workspace preferences.">
                  <SelectField
                    label="Theme"
                    value={formData.preferences.theme}
                    onChange={(value) => updatePreferences("theme", value)}
                    options={[
                      ["dark", "Dark"],
                      ["system", "System"]
                    ]}
                  />
                  <SelectField
                    label="Density"
                    value={formData.preferences.density}
                    onChange={(value) => updatePreferences("density", value)}
                    options={[
                      ["comfortable", "Comfortable"],
                      ["compact", "Compact"],
                      ["spacious", "Spacious"]
                    ]}
                  />
                  <TextField label="Language" value="English" readOnly />
                  <SelectField
                    label="Timezone"
                    value={formData.preferences.timezone}
                    onChange={(value) => updatePreferences("timezone", value)}
                    options={[
                      ["Asia/Kolkata", "Asia/Kolkata"],
                      ["UTC", "UTC"],
                      ["America/New_York", "America/New_York"]
                    ]}
                  />
                </SettingsSection>
              )}

              {activeSection === "notifications" && (
                <SettingsSection title="Notification Settings" description="Configure email, SMS, and in-app alert behavior.">
                  <ToggleField label="Email notifications" helper="Receive important CRM alerts by email." checked={formData.preferences.emailNotifications} onChange={(value) => updatePreferences("emailNotifications", value)} />
                  <ToggleField label="SMS notifications" helper="Receive urgent alerts by SMS when configured." checked={formData.preferences.smsNotifications} onChange={(value) => updatePreferences("smsNotifications", value)} />
                  <ToggleField label="App notifications" helper="Show alerts inside the CRM." checked={formData.preferences.appNotifications} onChange={(value) => updatePreferences("appNotifications", value)} />
                  <ToggleField label="Desktop alerts" helper="Show browser notifications while working." checked={formData.preferences.desktopNotifications} onChange={(value) => updatePreferences("desktopNotifications", value)} />
                  {isAdmin && (
                    <>
                      <ToggleField label="Lead assigned alert" helper="Notify users when a lead is assigned." checked={sections.notificationDefaults?.leadAssigned} onChange={(value) => updateSection("notificationDefaults", "leadAssigned", value)} />
                      <ToggleField label="Deal won alert" helper="Notify stakeholders when a deal closes won." checked={sections.notificationDefaults?.dealWon} onChange={(value) => updateSection("notificationDefaults", "dealWon", value)} />
                      <ToggleField label="Invoice overdue alert" helper="Notify owners when invoices pass due date." checked={sections.notificationDefaults?.invoiceOverdue} onChange={(value) => updateSection("notificationDefaults", "invoiceOverdue", value)} />
                      <ToggleField label="Low inventory alert" helper="Notify users when stock needs attention." checked={sections.notificationDefaults?.lowInventory} onChange={(value) => updateSection("notificationDefaults", "lowInventory", value)} />
                      <ToggleField label="Daily digest" helper="Send a daily activity summary." checked={sections.notificationDefaults?.dailyDigest} onChange={(value) => updateSection("notificationDefaults", "dailyDigest", value)} />
                    </>
                  )}
                </SettingsSection>
              )}

              {isAdmin && activeSection === "integrations" && (
                <SettingsSection title="Integration Settings" description="Connect email, calendar, webhooks, and third-party apps.">
                  <ToggleField label="Email integration enabled" helper="Use SMTP settings for system email." checked={sections.integrations?.emailConnected} onChange={(value) => updateSection("integrations", "emailConnected", value)} />
                  <ToggleField label="Calendar integration enabled" helper="Allow calendar links for CRM meetings and tasks." checked={sections.integrations?.calendarConnected} onChange={(value) => updateSection("integrations", "calendarConnected", value)} />
                  <TextField label="Google Calendar URL" value={sections.integrations?.googleCalendarUrl} onChange={(value) => updateSection("integrations", "googleCalendarUrl", value)} />
                  <TextField label="Microsoft Calendar URL" value={sections.integrations?.microsoftCalendarUrl} onChange={(value) => updateSection("integrations", "microsoftCalendarUrl", value)} />
                  <TextField label="Webhook URL" value={sections.integrations?.webhookUrl} onChange={(value) => updateSection("integrations", "webhookUrl", value)} />
                  <TextAreaField label="Third-party apps" value={sections.integrations?.thirdPartyApps} onChange={(value) => updateSection("integrations", "thirdPartyApps", value)} helper="Separate app names with commas." />
                  <Divider label="Email SMTP" />
                  <TextField label="Service" value={sections.email?.service} onChange={(value) => updateSection("email", "service", value)} />
                  <TextField label="SMTP host" value={sections.email?.host} onChange={(value) => updateSection("email", "host", value)} />
                  <NumberField label="SMTP port" value={sections.email?.port} onChange={(value) => updateSection("email", "port", value)} />
                  <TextField label="SMTP user" value={sections.email?.auth?.user} onChange={(value) => updateNestedSection("email", "auth", "user", value)} />
                  <TextField label="SMTP password" type="password" value={sections.email?.auth?.pass} onChange={(value) => updateNestedSection("email", "auth", "pass", value)} />
                  <ToggleField label="Use secure SMTP" helper="Enable for SSL/TLS SMTP connections." checked={sections.email?.secure} onChange={(value) => updateSection("email", "secure", value)} />
                </SettingsSection>
              )}

              {isAdmin && activeSection === "systemConfiguration" && (
                <SettingsSection title="System Configuration" description="Manage workflow rules, automation, data retention, backup, and export behavior.">
                  <TextAreaField label="Workflow rules" value={sections.systemConfiguration?.workflowRules} onChange={(value) => updateSection("systemConfiguration", "workflowRules", value)} helper="Separate workflow rules with commas." />
                  <ToggleField label="Automation enabled" helper="Turn CRM automation rules on or off." checked={sections.systemConfiguration?.automationEnabled} onChange={(value) => updateSection("systemConfiguration", "automationEnabled", value)} />
                  <ToggleField label="Auto backup enabled" helper="Keep scheduled backup behavior enabled." checked={sections.systemConfiguration?.autoBackupEnabled} onChange={(value) => updateSection("systemConfiguration", "autoBackupEnabled", value)} />
                  <NumberField label="Data retention (days)" value={sections.systemConfiguration?.dataRetentionDays} onChange={(value) => updateSection("systemConfiguration", "dataRetentionDays", value)} />
                  <ToggleField label="Allow data export" helper="Allow authorized users to export CRM data." checked={sections.systemConfiguration?.allowDataExport} onChange={(value) => updateSection("systemConfiguration", "allowDataExport", value)} />
                  <Divider label="Sales & Lead Rules" />
                  <TextAreaField label="Deal stages" value={sections.pipeline?.dealStages} onChange={(value) => updateSection("pipeline", "dealStages", value)} helper="Separate stages with commas." />
                  <TextAreaField label="Lead sources" value={sections.leadManagement?.leadSources} onChange={(value) => updateSection("leadManagement", "leadSources", value)} helper="Separate sources with commas." />
                  <NumberField label="Follow-up SLA (hours)" value={sections.leadManagement?.followUpSlaHours} onChange={(value) => updateSection("leadManagement", "followUpSlaHours", value)} />
                  <ToggleField label="Auto assign leads" helper="Distribute new leads to available sales users." checked={sections.leadManagement?.autoAssignLeads} onChange={(value) => updateSection("leadManagement", "autoAssignLeads", value)} />
                </SettingsSection>
              )}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

function SettingsSection({ title, description, children }) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-grid two-col">{children}</div>
    </section>
  );
}

function Divider({ label }) {
  return <div className="settings-divider">{label}</div>;
}

function TextField({ label, value = "", onChange, type = "text", readOnly = false }) {
  return (
    <label className={`settings-field ${readOnly ? "readonly" : ""}`}>
      <span>{label}</span>
      <input type={type} value={value || ""} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value = "", onChange }) {
  return <TextField label={label} type="number" value={value} onChange={onChange} />;
}

function SelectField({ label, value = "", onChange, options }) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({ label, value = "", onChange, helper }) {
  return (
    <label className="settings-field wide">
      <span>{label}</span>
      <textarea rows="4" value={value || ""} onChange={(event) => onChange(event.target.value)} />
      {helper && <small>{helper}</small>}
    </label>
  );
}

function ToggleField({ label, helper, checked, onChange }) {
  return (
    <label className="settings-toggle">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <span className="settings-switch" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {helper && <small>{helper}</small>}
      </span>
    </label>
  );
}
