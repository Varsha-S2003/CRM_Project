import React, { useEffect, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./ActivityModule.css";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
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
        const res = await axios.get("http://localhost:5000/api/activities", {
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

  const usecaseActivities = activities.filter((activity) => {
    const type = String(activity?.activityType || "").toLowerCase();
    const outcome = String(activity?.outcome || "").toLowerCase();
    const relatedType = String(activity?.relatedTo?.recordType || "").toLowerCase();
    return type === "meeting" && outcome === "interested" && relatedType === "lead";
  });

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content activity-module">
        <div className="activity-topbar">
          <div>
            <h1>Usecase Notes</h1>
            <p>
              Meeting details captured when leads move from Contacted to Qualified using the
              Interested outcome.
            </p>
          </div>
        </div>

        {error ? <div className="activity-toast">{error}</div> : null}

        <div className="activity-shell">
          <div className="activity-content" style={{ width: "100%" }}>
            <div className="activity-table-card">
              <div className="activity-card-header">
                <h2>Usecase Meeting Notes</h2>
                <p>All completed lead meetings with Interested outcome and their notes.</p>
              </div>

              {loading ? (
                <p>Loading usecase notes...</p>
              ) : usecaseActivities.length === 0 ? (
                <p>No usecase notes found yet.</p>
              ) : (
                <div className="activity-table-wrapper">
                  <table className="activity-table">
                    <thead>
                      <tr>
                        <th>Lead</th>
                        <th>Meeting Title</th>
                        <th>Owner</th>
                        <th>Date</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usecaseActivities.map((activity) => (
                        <tr key={activity._id}>
                          <td>{activity.relatedTo?.recordName || "-"}</td>
                          <td>{activity.title}</td>
                          <td>{activity.owner?.name || activity.owner?.username || "-"}</td>
                          <td>{formatDateTime(activity.startDateTime || activity.dueDate || activity.createdAt)}</td>
                          <td style={{ whiteSpace: "pre-wrap", maxWidth: 400 }}>
                            {activity.outcomeReason || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UsecaseModule;
