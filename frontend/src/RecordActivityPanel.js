import { useEffect, useState } from "react";
import axios from "axios";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function RecordActivityPanel({ recordType, recordId, recordName }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!recordId || !recordType) return;

    const fetchActivities = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/activities", {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            relatedType: recordType,
            relatedId: recordId,
          },
        });
        setActivities(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, [recordId, recordType]);

  const openActivities = activities.filter((activity) => !["Completed", "Cancelled"].includes(activity.status));
  const closedActivities = activities.filter((activity) => ["Completed", "Cancelled"].includes(activity.status));

  return (
    <div className="record-activity-panel">
      <div className="record-activity-panel__header">
        <div>
          <h3>Activity Timeline</h3>
          <p>{recordName || recordType} linked interactions</p>
        </div>
        <a className="record-activity-panel__link" href="/activities">
          Open module
        </a>
      </div>

      {loading ? (
        <p className="record-activity-panel__empty">Loading activities...</p>
      ) : activities.length === 0 ? (
        <p className="record-activity-panel__empty">No activities linked to this record yet.</p>
      ) : (
        <div className="record-activity-panel__grid">
          <div className="record-activity-panel__column">
            <div className="record-activity-panel__section-title">Open Activities</div>
            {openActivities.length === 0 ? (
              <p className="record-activity-panel__empty small">No open activities.</p>
            ) : (
              openActivities.map((activity) => (
                <div key={activity._id} className="record-activity-card">
                  <div className="record-activity-card__top">
                    <span className={`activity-pill ${activity.activityType}`}>{activity.activityType}</span>
                    <span className={`activity-status ${activity.status.toLowerCase()}`}>{activity.status}</span>
                  </div>
                  <strong>{activity.title}</strong>
                  <p>{activity.description || "No description"}</p>
                  <div className="record-activity-card__meta">
                    <span>{activity.owner?.name || activity.owner?.username || "Unassigned"}</span>
                    <span>{formatDateTime(activity.startDateTime || activity.dueDate)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="record-activity-panel__column">
            <div className="record-activity-panel__section-title">Closed Activities</div>
            {closedActivities.length === 0 ? (
              <p className="record-activity-panel__empty small">No closed activities.</p>
            ) : (
              closedActivities.map((activity) => (
                <div key={activity._id} className="record-activity-card muted">
                  <div className="record-activity-card__top">
                    <span className={`activity-pill ${activity.activityType}`}>{activity.activityType}</span>
                    <span className={`activity-status ${activity.status.toLowerCase()}`}>{activity.status}</span>
                  </div>
                  <strong>{activity.title}</strong>
                  <p>{activity.description || "No description"}</p>
                  <div className="record-activity-card__meta">
                    <span>{activity.owner?.name || activity.owner?.username || "Unassigned"}</span>
                    <span>{formatDateTime(activity.completedAt || activity.cancelledAt || activity.startDateTime || activity.dueDate)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
