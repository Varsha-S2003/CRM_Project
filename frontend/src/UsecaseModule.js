import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./ActivityModule.css";

const parseDateValue = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  // Handles values like "2026-04-16 11:10:00" (no timezone designator).
  const normalized = text.replace(" ", "T");
  const fallback = new Date(normalized);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
};

const formatDateTime = (value) => {
  const date = parseDateValue(value);
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

const parseUsecaseSections = (value) => {
  const text = String(value || "").trim();
  if (!text) return [];

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex === -1) {
        return { label: "Notes", value: line };
      }

      return {
        label: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
      };
    });
};

const getUsecaseValue = (sections, labels) => {
  const match = sections.find((section) => labels.includes(section.label));
  return match?.value || "-";
};

function UsecaseModule() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("You must be logged in to view usecase notes.");
      setLoading(false);
      return;
    }

    const fetchActivities = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await axios.get("http://localhost:5000/api/activities/usecases", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setActivities(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load usecase notes.");
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  const usecaseActivities = useMemo(
    () =>
      activities.filter((activity) => {
        const type = String(activity?.activityType || "").toLowerCase();
        const outcome = String(activity?.outcome || "").toLowerCase();
        const relatedType = String(activity?.relatedTo?.recordType || "").toLowerCase();
        return type === "meeting" && outcome === "interested" && relatedType === "lead";
      }),
    [activities]
  );

  const usecaseRows = useMemo(
    () =>
      usecaseActivities.map((activity) => ({
        ...activity,
        parsedNotes: parseUsecaseSections(activity.outcomeReason),
      })),
    [usecaseActivities]
  );

  const stats = useMemo(() => {
    const uniqueLeads = new Set(
      usecaseActivities.map((activity) => String(activity.relatedTo?.recordName || "").trim()).filter(Boolean)
    ).size;
    const latestActivity = [...usecaseActivities].sort((a, b) => {
      const bTime = parseDateValue(b.startDateTime || b.dueDate || b.createdAt)?.getTime() || 0;
      const aTime = parseDateValue(a.startDateTime || a.dueDate || a.createdAt)?.getTime() || 0;
      return bTime - aTime;
    })[0];

    return {
      totalNotes: usecaseActivities.length,
      uniqueLeads,
      latestUpdated: latestActivity
        ? formatDateTime(latestActivity.startDateTime || latestActivity.dueDate || latestActivity.createdAt)
        : "-",
    };
  }, [usecaseActivities]);

  const summaryCards = [
    {
      label: "Interested meetings",
      value: stats.totalNotes,
      hint: "Qualified discovery notes",
    },
    {
      label: "Unique leads",
      value: stats.uniqueLeads,
      hint: "Distinct opportunities",
    },
    {
      label: "Latest update",
      value: stats.latestUpdated,
      hint: "Most recent meeting note",
    },
  ];

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content activity-module usecase-page">
        <div className="usecase-hero">
          <div className="usecase-hero__copy">
            <div className="usecase-hero__breadcrumbs">
              <span>Pipeline</span>
              <span>/</span>
              <span>Discovery</span>
            </div>
            <span className="usecase-hero__eyebrow">Lead Discovery Notes</span>
            <h1>Usecase Notes</h1>
            <p>
              Structured meeting notes captured when a lead shows interest. Review requirements,
              pain points, qualification, and meeting context in one place.
            </p>
            <div className="usecase-hero__chips">
              <span className="usecase-chip">Interested leads</span>
              <span className="usecase-chip usecase-chip--soft">Meeting summary</span>
              <span className="usecase-chip usecase-chip--accent">{stats.totalNotes} records</span>
            </div>
          </div>

          <div className="usecase-stats">
            {summaryCards.map((card) => (
              <div className="usecase-stat-card" key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.hint}</small>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <div className="usecase-inline-alert" role="alert">
            <strong>Unable to load usecase notes</strong>
            <span>{error}</span>
          </div>
        ) : null}

        <div className="usecase-board">
          <div className="activity-table-card usecase-board__header">
            <div className="activity-card-header">
              <div>
                <h2>Usecase Meeting Notes</h2>
                <p>All completed lead meetings with Interested outcome and structured meeting notes.</p>
              </div>
              <div className="usecase-board__summary">
                <div className="usecase-board__summary-item">
                  <span>Records</span>
                  <strong>{stats.totalNotes}</strong>
                </div>
                <div className="usecase-board__summary-item">
                  <span>Last touched</span>
                  <strong>{stats.latestUpdated}</strong>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="activity-table-card usecase-state-card">
              <strong>Loading usecase notes...</strong>
              <span>Fetching the latest interested meetings from the CRM.</span>
            </div>
          ) : usecaseRows.length === 0 ? (
            <div className="activity-table-card usecase-state-card">
              <strong>No usecase notes found yet.</strong>
              <span>When a lead meeting is marked Interested, the note details will appear here.</span>
            </div>
          ) : (
            <div className="activity-table-card usecase-table-wrap">
              <table className="usecase-table">
                <thead>
                  <tr>
                    <th>Lead</th>
                    <th>Meeting</th>
                    <th>Owner</th>
                    <th>Updated</th>
                    <th>Requirement</th>
                    <th>Pain Points</th>
                    <th>Features Needed</th>
                    <th>Qualification</th>
                    <th>Meeting Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {usecaseRows.map((activity) => {
                    const qualification = [
                      getUsecaseValue(activity.parsedNotes, ["Budget"]),
                      getUsecaseValue(activity.parsedNotes, ["Authority"]),
                      getUsecaseValue(activity.parsedNotes, ["Timeline"]),
                    ]
                      .filter((value) => value && value !== "-")
                      .join(" | ");

                    return (
                      <tr key={activity._id}>
                        <td>{activity.relatedTo?.recordName || "-"}</td>
                        <td>{activity.title || "Meeting Note"}</td>
                        <td>{activity.owner?.name || activity.owner?.username || "-"}</td>
                        <td>{formatDateTime(activity.startDateTime || activity.dueDate || activity.createdAt)}</td>
                        <td>{getUsecaseValue(activity.parsedNotes, ["Business Requirement Summary"])}</td>
                        <td>{getUsecaseValue(activity.parsedNotes, ["Pain Points"])}</td>
                        <td>
                          {getUsecaseValue(activity.parsedNotes, [
                            "Features Needed",
                            "Required Features / Expectations",
                          ])}
                        </td>
                        <td>{qualification || "-"}</td>
                        <td>{getUsecaseValue(activity.parsedNotes, ["Meeting Notes", "Notes"])}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UsecaseModule;
