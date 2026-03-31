import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./ActivityModule.css";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
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

const USECASE_GROUPS = [
  {
    title: "Requirement",
    labels: ["Business Requirement Summary"],
  },
  {
    title: "Challenges",
    labels: ["Pain Points"],
  },
  {
    title: "Features Needed",
    labels: ["Features Needed", "Required Features / Expectations"],
  },
  {
    title: "Qualification",
    labels: ["Budget", "Authority", "Timeline"],
  },
  {
    title: "Notes",
    labels: ["Meeting Notes"],
  },
];

const groupUsecaseSections = (sections) => {
  const remaining = [...sections];

  const groups = USECASE_GROUPS.map((group) => {
    const items = group.labels
      .map((label) => {
        const index = remaining.findIndex((section) => section.label === label);
        if (index === -1) return null;
        const [match] = remaining.splice(index, 1);
        return match;
      })
      .filter(Boolean);

    return { title: group.title, items };
  }).filter((group) => group.items.length);

  if (remaining.length) {
    groups.push({ title: "Additional Notes", items: remaining });
  }

  return groups;
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

  const usecaseCards = useMemo(
    () =>
      usecaseActivities.map((activity) => ({
        ...activity,
        parsedNotes: parseUsecaseSections(activity.outcomeReason),
        groupedNotes: groupUsecaseSections(parseUsecaseSections(activity.outcomeReason)),
      })),
    [usecaseActivities]
  );

  const stats = useMemo(() => {
    const uniqueLeads = new Set(
      usecaseActivities.map((activity) => String(activity.relatedTo?.recordName || "").trim()).filter(Boolean)
    ).size;
    const latestActivity = [...usecaseActivities]
      .sort(
        (a, b) =>
          new Date(b.startDateTime || b.dueDate || b.createdAt).getTime() -
          new Date(a.startDateTime || a.dueDate || a.createdAt).getTime()
      )[0];

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
          ) : usecaseCards.length === 0 ? (
            <div className="activity-table-card usecase-state-card">
              <strong>No usecase notes found yet.</strong>
              <span>When a lead meeting is marked Interested, the note details will appear here.</span>
            </div>
          ) : (
            <div className="usecase-card-grid">
              {usecaseCards.map((activity) => (
                <article key={activity._id} className="usecase-note-card">
                  <div className="usecase-note-card__top">
                    <div>
                      <div className="usecase-note-card__lead">{activity.relatedTo?.recordName || "Lead"}</div>
                      <h3>{activity.title || "Meeting Note"}</h3>
                    </div>
                    <span className="usecase-note-card__badge">Interested</span>
                  </div>

                  <div className="usecase-note-card__meta">
                    <span>Owner: {activity.owner?.name || activity.owner?.username || "-"}</span>
                    <span>Updated: {formatDateTime(activity.startDateTime || activity.dueDate || activity.createdAt)}</span>
                  </div>

                  <div className="usecase-note-card__notes">
                    {activity.groupedNotes.length ? (
                      activity.groupedNotes.map((group) => (
                        <section className="usecase-note-card__group" key={`${activity._id}-${group.title}`}>
                          <div className="usecase-note-card__group-title">{group.title}</div>
                          <div className="usecase-note-card__group-grid">
                            {group.items.map((section, index) => (
                              <div className="usecase-note-card__note" key={`${activity._id}-${section.label}-${index}`}>
                                <span>{section.label}</span>
                                <p>{section.value}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className="usecase-note-card__note">
                        <span>Notes</span>
                        <p>-</p>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UsecaseModule;
