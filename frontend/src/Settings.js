import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./Settings.css";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";

const labelsByRole = {
  ADMIN: {
    title: "System Settings",
    subtitle: "Control organization-wide branding, security, automation, and your admin preferences."
  },
  MANAGER: {
    title: "Manager Settings",
    subtitle: "Tune team visibility, approvals, and alerts for your management workflow."
  },
  EMPLOYEE: {
    title: "Workspace Settings",
    subtitle: "Personalize your workspace, reminders, and notification experience."
  }
};

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(null);
  const [formData, setFormData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No login session found. Please log in again.");
        setLoading(false);
        return;
      }
      const response = await axios.get(`${API_BASE}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(response.data);
      setFormData(response.data);
    } catch (err) {
      console.error("Failed to load settings", err);
      const status = err.response?.status;
      const message = err.response?.data?.message;

      if (status === 401) {
        setError("Your session expired or token is invalid. Please log in again.");
        localStorage.removeItem("token");
        setTimeout(() => navigate("/login"), 1200);
      } else if (status === 404) {
        setError("Settings API route was not found. Please restart the backend server.");
      } else if (status === 500) {
        setError(`Backend settings error: ${message || "internal server error"}`);
      } else {
        setError(message || "Unable to load settings.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateProfile = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      profile: { ...prev.profile, [field]: value }
    }));
  };

  const updatePreferences = (field, value) => {
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
          ...prev.sections[section],
          [field]: value
        }
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage("");
      setError("");
      const token = localStorage.getItem("token");
      if (!token) {
        setError("No login session found. Please log in again.");
        return;
      }
      const response = await axios.put(`${API_BASE}/api/settings`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(response.data);
      setFormData(response.data);
      localStorage.setItem("name", response.data.profile?.name || "");
      setMessage("Settings saved successfully.");
    } catch (err) {
      console.error("Failed to save settings", err);
      setError(
        err.response?.data?.message ||
        `Unable to save settings${err.response?.status ? ` (${err.response.status})` : ""}.`
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-layout">
        <Sidebar />
        <div className="main-content settings-page">
          <div className="settings-loading-card">Loading settings...</div>
        </div>
      </div>
    );
  }

  if (!settings || !formData) {
    return (
      <div className="dashboard-layout">
        <Sidebar />
        <div className="main-content settings-page">
          <div className="settings-loading-card">
            {error || "Settings are not available right now."}
          </div>
        </div>
      </div>
    );
  }

  const role = settings?.role || "EMPLOYEE";
  const heroCopy = labelsByRole[role] || labelsByRole.EMPLOYEE;

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content settings-page">
        <div className="settings-shell">
          <div className="settings-hero">
            <div>
              <h1>{heroCopy.title}</h1>
              <p>{heroCopy.subtitle}</p>
            </div>
            <div className="settings-role-chip">{role}</div>
          </div>

          {message && <div className="settings-alert success">{message}</div>}
          {error && <div className="settings-alert error">{error}</div>}

          <form onSubmit={handleSubmit} className="settings-form">
            <section className="settings-card">
              <div className="settings-card-head">
                <h2>Profile</h2>
                <p>Basic identity details visible across the CRM.</p>
              </div>
              <div className="settings-grid two-col">
                <label className="settings-field">
                  <span>Full Name</span>
                  <input
                    type="text"
                    value={formData.profile.name}
                    onChange={(e) => updateProfile("name", e.target.value)}
                  />
                </label>
                <label className="settings-field">
                  <span>Phone</span>
                  <input
                    type="text"
                    value={formData.profile.phone}
                    onChange={(e) => updateProfile("phone", e.target.value)}
                  />
                </label>
                <label className="settings-field">
                  <span>Department</span>
                  <input
                    type="text"
                    value={formData.profile.department}
                    onChange={(e) => updateProfile("department", e.target.value)}
                  />
                </label>
                <label className="settings-field">
                  <span>Designation</span>
                  <input
                    type="text"
                    value={formData.profile.designation}
                    onChange={(e) => updateProfile("designation", e.target.value)}
                  />
                </label>
                <label className="settings-field readonly">
                  <span>Username</span>
                  <input type="text" value={formData.profile.username} readOnly />
                </label>
                <label className="settings-field readonly">
                  <span>Email</span>
                  <input type="text" value={formData.profile.email} readOnly />
                </label>
              </div>
            </section>

            <section className="settings-card">
              <div className="settings-card-head">
                <h2>Preferences</h2>
                <p>Choose how your workspace should look and notify you.</p>
              </div>
              <div className="settings-grid three-col">
                <label className="settings-field">
                  <span>Theme</span>
                  <select
                    value={formData.preferences.theme}
                    onChange={(e) => updatePreferences("theme", e.target.value)}
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>Density</span>
                  <select
                    value={formData.preferences.density}
                    onChange={(e) => updatePreferences("density", e.target.value)}
                  >
                    <option value="comfortable">Comfortable</option>
                    <option value="compact">Compact</option>
                    <option value="spacious">Spacious</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>Language</span>
                  <select
                    value={formData.preferences.language}
                    onChange={(e) => updatePreferences("language", e.target.value)}
                  >
                    <option value="English">English</option>
                    <option value="Hindi">Hindi</option>
                    <option value="Tamil">Tamil</option>
                  </select>
                </label>
                <label className="settings-field">
                  <span>Timezone</span>
                  <select
                    value={formData.preferences.timezone}
                    onChange={(e) => updatePreferences("timezone", e.target.value)}
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </label>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.preferences.emailNotifications)}
                    onChange={(e) => updatePreferences("emailNotifications", e.target.checked)}
                  />
                  <div>
                    <strong>Email Notifications</strong>
                    <span>Receive updates for important activity by email.</span>
                  </div>
                </label>
                <label className="settings-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.preferences.desktopNotifications)}
                    onChange={(e) => updatePreferences("desktopNotifications", e.target.checked)}
                  />
                  <div>
                    <strong>Desktop Alerts</strong>
                    <span>Show in-app and browser notifications while working.</span>
                  </div>
                </label>
              </div>
            </section>

            {role === "ADMIN" && (
              <>
                <section className="settings-card">
                  <div className="settings-card-head">
                    <h2>Organization</h2>
                    <p>Branding and workspace defaults that affect the whole CRM.</p>
                  </div>
                  <div className="settings-grid three-col">
                    <label className="settings-field">
                      <span>Company Name</span>
                      <input
                        type="text"
                        value={formData.sections.organization.companyName}
                        onChange={(e) => updateSection("organization", "companyName", e.target.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Support Email</span>
                      <input
                        type="email"
                        value={formData.sections.organization.supportEmail}
                        onChange={(e) => updateSection("organization", "supportEmail", e.target.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Primary Color</span>
                      <input
                        type="text"
                        value={formData.sections.organization.primaryColor}
                        onChange={(e) => updateSection("organization", "primaryColor", e.target.value)}
                      />
                    </label>
                    <label className="settings-field">
                      <span>Accent Color</span>
                      <input
                        type="text"
                        value={formData.sections.organization.accentColor}
                        onChange={(e) => updateSection("organization", "accentColor", e.target.value)}
                      />
                    </label>
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.sections.organization.compactSidebar)}
                        onChange={(e) => updateSection("organization", "compactSidebar", e.target.checked)}
                      />
                      <div>
                        <strong>Compact Sidebar</strong>
                        <span>Reduce sidebar spacing for a denser navigation layout.</span>
                      </div>
                    </label>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <h2>Security</h2>
                    <p>Protect your CRM with stronger auth and session controls.</p>
                  </div>
                  <div className="settings-grid three-col">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.sections.security.mfaRequired)}
                        onChange={(e) => updateSection("security", "mfaRequired", e.target.checked)}
                      />
                      <div>
                        <strong>Require MFA</strong>
                        <span>Force multi-factor authentication for admin accounts.</span>
                      </div>
                    </label>
                    <label className="settings-field">
                      <span>Session Timeout (minutes)</span>
                      <input
                        type="number"
                        value={formData.sections.security.sessionTimeoutMinutes}
                        onChange={(e) =>
                          updateSection("security", "sessionTimeoutMinutes", e.target.value)
                        }
                      />
                    </label>
                    <label className="settings-field">
                      <span>Password Rotation (days)</span>
                      <input
                        type="number"
                        value={formData.sections.security.passwordRotationDays}
                        onChange={(e) =>
                          updateSection("security", "passwordRotationDays", e.target.value)
                        }
                      />
                    </label>
                    <label className="settings-field full-span">
                      <span>IP Whitelist</span>
                      <textarea
                        rows="3"
                        value={formData.sections.security.ipWhitelist}
                        onChange={(e) => updateSection("security", "ipWhitelist", e.target.value)}
                      />
                    </label>
                  </div>
                </section>

                <section className="settings-card">
                  <div className="settings-card-head">
                    <h2>Automation</h2>
                    <p>Define how leads, approvals, alerts, and admin activity should flow.</p>
                  </div>
                  <div className="settings-grid two-col">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.sections.automation.leadAutoAssign)}
                        onChange={(e) => updateSection("automation", "leadAutoAssign", e.target.checked)}
                      />
                      <div>
                        <strong>Lead Auto Assign</strong>
                        <span>Automatically distribute new leads to available staff.</span>
                      </div>
                    </label>
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.sections.automation.dealApprovalRequired)}
                        onChange={(e) =>
                          updateSection("automation", "dealApprovalRequired", e.target.checked)
                        }
                      />
                      <div>
                        <strong>Deal Approval Required</strong>
                        <span>Hold large deals for manager/admin approval before closure.</span>
                      </div>
                    </label>
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.sections.automation.inventoryAlerts)}
                        onChange={(e) => updateSection("automation", "inventoryAlerts", e.target.checked)}
                      />
                      <div>
                        <strong>Inventory Alerts</strong>
                        <span>Send low-stock and reorder threshold alerts automatically.</span>
                      </div>
                    </label>
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.sections.automation.onboardingEmails)}
                        onChange={(e) =>
                          updateSection("automation", "onboardingEmails", e.target.checked)
                        }
                      />
                      <div>
                        <strong>Onboarding Emails</strong>
                        <span>Email welcome and setup instructions when staff are added.</span>
                      </div>
                    </label>
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.sections.automation.auditAlerts)}
                        onChange={(e) => updateSection("automation", "auditAlerts", e.target.checked)}
                      />
                      <div>
                        <strong>Audit Alerts</strong>
                        <span>Notify admins when critical account changes happen.</span>
                      </div>
                    </label>
                    <label className="settings-field">
                      <span>Approval Mode</span>
                      <select
                        value={formData.sections.automation.approvalMode}
                        onChange={(e) => updateSection("automation", "approvalMode", e.target.value)}
                      >
                        <option value="balanced">Balanced</option>
                        <option value="strict">Strict</option>
                        <option value="fast">Fast Track</option>
                      </select>
                    </label>
                  </div>
                </section>
              </>
            )}

            {role === "MANAGER" && (
              <section className="settings-card">
                <div className="settings-card-head">
                  <h2>Team Controls</h2>
                  <p>Manage how you monitor pipeline activity and team performance.</p>
                </div>
                <div className="settings-grid two-col">
                  <label className="settings-field">
                    <span>Lead Visibility</span>
                    <select
                      value={formData.sections.team.leadVisibility}
                      onChange={(e) => updateSection("team", "leadVisibility", e.target.value)}
                    >
                      <option value="team">Entire Team</option>
                      <option value="assigned">Assigned Only</option>
                      <option value="department">Department</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Deal Approval Limit</span>
                    <input
                      type="number"
                      value={formData.sections.team.dealApprovalLimit}
                      onChange={(e) => updateSection("team", "dealApprovalLimit", e.target.value)}
                    />
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.sections.team.weeklyDigest)}
                      onChange={(e) => updateSection("team", "weeklyDigest", e.target.checked)}
                    />
                    <div>
                      <strong>Weekly Digest</strong>
                      <span>Receive a weekly summary of team activity and bottlenecks.</span>
                    </div>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.sections.team.performanceNotifications)}
                      onChange={(e) =>
                        updateSection("team", "performanceNotifications", e.target.checked)
                      }
                    />
                    <div>
                      <strong>Performance Notifications</strong>
                      <span>Alert managers when win-rate or conversion trends shift sharply.</span>
                    </div>
                  </label>
                </div>
              </section>
            )}

            {role === "EMPLOYEE" && (
              <section className="settings-card">
                <div className="settings-card-head">
                  <h2>Workspace</h2>
                  <p>Choose how your day-to-day sales workspace should behave.</p>
                </div>
                <div className="settings-grid two-col">
                  <label className="settings-field">
                    <span>Dashboard Layout</span>
                    <select
                      value={formData.sections.workspace.dashboardLayout}
                      onChange={(e) => updateSection("workspace", "dashboardLayout", e.target.value)}
                    >
                      <option value="focus">Focus</option>
                      <option value="pipeline">Pipeline</option>
                      <option value="metrics">Metrics</option>
                    </select>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.sections.workspace.leadReminders)}
                      onChange={(e) => updateSection("workspace", "leadReminders", e.target.checked)}
                    />
                    <div>
                      <strong>Lead Reminders</strong>
                      <span>Prompt follow-ups for overdue or untouched leads.</span>
                    </div>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.sections.workspace.taskNotifications)}
                      onChange={(e) =>
                        updateSection("workspace", "taskNotifications", e.target.checked)
                      }
                    />
                    <div>
                      <strong>Task Notifications</strong>
                      <span>Show alerts for due tasks, assignments, and ownership changes.</span>
                    </div>
                  </label>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.sections.workspace.dailySummary)}
                      onChange={(e) => updateSection("workspace", "dailySummary", e.target.checked)}
                    />
                    <div>
                      <strong>Daily Summary</strong>
                      <span>Get an end-of-day summary of progress and pending work.</span>
                    </div>
                  </label>
                </div>
              </section>
            )}

            <div className="settings-actions">
              <button type="button" className="settings-secondary" onClick={fetchSettings}>
                Reset
              </button>
              <button type="submit" className="settings-primary" disabled={saving}>
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
