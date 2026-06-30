import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import "./ServiceAnalysisModule.css";

const BILLING_CYCLE_OPTIONS = [
  { value: "monthly", label: "Monthly", months: 1 },
  { value: "quarterly", label: "Quarterly", months: 3 },
  { value: "6_months", label: "6 Months", months: 6 },
  { value: "yearly", label: "Yearly", months: 12 },
  { value: "custom", label: "Custom cadence", months: 0 },
];

const CUSTOM_UNITS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

const STORAGE_KEY = "crm_service_analysis_draft";

const getTodayInputValue = () => new Date().toISOString().slice(0, 10);

const defaultForm = {
  customerName: "",
  serviceName: "",
  serviceType: "subscription",
  billingCycle: "monthly",
  customCycleValue: "10",
  customCycleUnit: "minutes",
  startDate: getTodayInputValue(),
  usersOrSeats: "",
  estimatedValue: "",
  billingOwner: "",
  reminderDays: "7",
  renewalPolicy: "auto",
  notes: "",
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatBillingCycleLabel = (form) => {
  if (form.billingCycle !== "custom") {
    return BILLING_CYCLE_OPTIONS.find((option) => option.value === form.billingCycle)?.label || "Monthly";
  }

  const amount = String(form.customCycleValue || "").trim();
  const unit = CUSTOM_UNITS.find((option) => option.value === form.customCycleUnit)?.label || "Minutes";
  return amount ? `Every ${amount} ${unit.toLowerCase()}` : `Custom cadence (${unit.toLowerCase()})`;
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const calculateNextBillingDate = (form) => {
  const start = new Date(form.startDate || getTodayInputValue());
  if (Number.isNaN(start.getTime())) return null;

  if (form.billingCycle !== "custom") {
    const option = BILLING_CYCLE_OPTIONS.find((item) => item.value === form.billingCycle) || BILLING_CYCLE_OPTIONS[0];
    return addMonths(start, option.months || 1);
  }

  const amount = Number(form.customCycleValue);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const next = new Date(start);
  const unit = String(form.customCycleUnit || "minutes").toLowerCase();
  if (unit === "months") {
    return addMonths(next, amount);
  }
  if (unit === "weeks") {
    next.setDate(next.getDate() + amount * 7);
  } else if (unit === "days") {
    next.setDate(next.getDate() + amount);
  } else if (unit === "hours") {
    next.setHours(next.getHours() + amount);
  } else {
    next.setMinutes(next.getMinutes() + amount);
  }
  return next;
};

function ServiceAnalysisModule() {
  const [form, setForm] = useState(defaultForm);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      setForm((prev) => ({ ...prev, ...parsed }));
    } catch (_error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  const nextBillingDate = useMemo(() => calculateNextBillingDate(form), [form]);
  const lifecycleSummary = useMemo(() => {
    const customer = form.customerName.trim() || "the customer";
    const service = form.serviceName.trim() || "the service";
    const cycleLabel = formatBillingCycleLabel(form);
    const owner = form.billingOwner.trim() || "assigned owner";
    const seats = form.usersOrSeats.trim() || "not specified";
    const value = form.estimatedValue.trim() || "not specified";
    const reminderDays = form.reminderDays.trim() || "7";
    const renewal = form.renewalPolicy === "manual" ? "manual review" : "auto renewal";

    return [
      `Customer: ${customer}`,
      `Service: ${service}`,
      `Service type: ${form.serviceType}`,
      `Billing cycle: ${cycleLabel}`,
      `Start date: ${formatDate(form.startDate)}`,
      `Next billing date: ${formatDate(nextBillingDate)}`,
      `Users / seats: ${seats}`,
      `Estimated value: ${value}`,
      `Billing owner: ${owner}`,
      `Renewal policy: ${renewal}`,
      `Reminder window: ${reminderDays} days before renewal`,
      `Notes: ${form.notes.trim() || "-"}`,
    ].join("\n");
  }, [form, nextBillingDate]);

  const updateField = (field, value) => {
    setMessage("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setMessage("Service analysis draft saved locally.");
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(lifecycleSummary);
      setMessage("Summary copied to clipboard.");
    } catch (_error) {
      setMessage("Copy is not available in this browser.");
    }
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setForm(defaultForm);
    setMessage("Draft cleared.");
  };

  return (
    <div className="dashboard-layout service-analysis-layout">
      <Sidebar />
      <main className="main-content service-analysis-page">
        <section className="service-analysis-hero">
          <div>
            <p className="service-analysis-kicker">Need Analysis</p>
            <h1>Service Billing Lifecycle Form</h1>
            <p>
              Capture the service details, billing cadence, and renewal plan in one place.
              Monthly, quarterly, yearly, and custom cycles are supported.
            </p>
          </div>
          <div className="service-analysis-hero-card">
            <span>Current cycle</span>
            <strong>{formatBillingCycleLabel(form)}</strong>
            <small>Next billing: {formatDate(nextBillingDate)}</small>
          </div>
        </section>

        <section className="service-analysis-grid">
          <form className="service-analysis-form card-surface" onSubmit={handleSubmit}>
            <div className="service-analysis-section">
              <h2>Service Details</h2>
              <div className="service-analysis-row">
                <label>
                  Customer Name
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(event) => updateField("customerName", event.target.value)}
                    placeholder="Customer or company name"
                  />
                </label>
                <label>
                  Service Name
                  <input
                    type="text"
                    value={form.serviceName}
                    onChange={(event) => updateField("serviceName", event.target.value)}
                    placeholder="Service / plan name"
                  />
                </label>
              </div>

              <div className="service-analysis-row">
                <label>
                  Service Type
                  <select value={form.serviceType} onChange={(event) => updateField("serviceType", event.target.value)}>
                    <option value="subscription">Subscription</option>
                    <option value="storage">Storage</option>
                    <option value="license">License</option>
                    <option value="managed_service">Managed Service</option>
                  </select>
                </label>
                <label>
                  Billing Owner
                  <input
                    type="text"
                    value={form.billingOwner}
                    onChange={(event) => updateField("billingOwner", event.target.value)}
                    placeholder="Owner responsible for billing"
                  />
                </label>
              </div>
            </div>

            <div className="service-analysis-section">
              <h2>Billing Lifecycle</h2>
              <div className="service-analysis-row">
                <label>
                  Billing Cycle
                  <select value={form.billingCycle} onChange={(event) => updateField("billingCycle", event.target.value)}>
                    {BILLING_CYCLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Start Date
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => updateField("startDate", event.target.value)}
                  />
                </label>
              </div>

              {form.billingCycle === "custom" ? (
                <div className="service-analysis-row service-analysis-row--custom">
                  <label>
                    Custom Interval
                    <input
                      type="number"
                      min="1"
                      value={form.customCycleValue}
                      onChange={(event) => updateField("customCycleValue", event.target.value)}
                      placeholder="5 or 10"
                    />
                  </label>
                  <label>
                    Custom Unit
                    <select
                      value={form.customCycleUnit}
                      onChange={(event) => updateField("customCycleUnit", event.target.value)}
                    >
                      {CUSTOM_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="service-analysis-row">
                <label>
                  Users / Seats
                  <input
                    type="number"
                    min="0"
                    value={form.usersOrSeats}
                    onChange={(event) => updateField("usersOrSeats", event.target.value)}
                    placeholder="Number of users or seats"
                  />
                </label>
                <label>
                  Estimated Value
                  <input
                    type="text"
                    value={form.estimatedValue}
                    onChange={(event) => updateField("estimatedValue", event.target.value)}
                    placeholder="e.g. Rs. 25,000 / month"
                  />
                </label>
              </div>

              <div className="service-analysis-row">
                <label>
                  Reminder Window (days)
                  <input
                    type="number"
                    min="0"
                    value={form.reminderDays}
                    onChange={(event) => updateField("reminderDays", event.target.value)}
                  />
                </label>
                <label>
                  Renewal Policy
                  <select
                    value={form.renewalPolicy}
                    onChange={(event) => updateField("renewalPolicy", event.target.value)}
                  >
                    <option value="auto">Auto renewal</option>
                    <option value="manual">Manual review</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="service-analysis-section">
              <h2>Analysis Notes</h2>
              <label className="service-analysis-notes">
                Notes
                <textarea
                  rows="6"
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                  placeholder="Capture the service scope, approvals, escalation rules, or billing exceptions."
                />
              </label>
            </div>

            <div className="service-analysis-actions">
              <button type="submit" className="btn-primary">
                Save Draft
              </button>
              <button type="button" className="btn-secondary" onClick={handleCopySummary}>
                Copy Summary
              </button>
              <button type="button" className="btn-ghost" onClick={handleReset}>
                Clear Draft
              </button>
            </div>

            {message ? <div className="service-analysis-message" role="status">{message}</div> : null}
          </form>

          <aside className="service-analysis-preview card-surface">
            <div className="preview-header">
              <h2>Lifecycle Preview</h2>
              <span>{formatBillingCycleLabel(form)}</span>
            </div>

            <div className="preview-grid">
              <div>
                <span>Start date</span>
                <strong>{formatDate(form.startDate)}</strong>
              </div>
              <div>
                <span>Next billing</span>
                <strong>{formatDate(nextBillingDate)}</strong>
              </div>
              <div>
                <span>Seats</span>
                <strong>{form.usersOrSeats || "-"}</strong>
              </div>
              <div>
                <span>Reminder</span>
                <strong>{form.reminderDays || "7"} days</strong>
              </div>
            </div>

            <label className="service-analysis-summary">
              Summary
              <textarea rows="16" readOnly value={lifecycleSummary} />
            </label>
          </aside>
        </section>
      </main>
    </div>
  );
}

export default ServiceAnalysisModule;