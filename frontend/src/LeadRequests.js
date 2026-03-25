import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./Dashboard.css";
import "./LeadRequests.css";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "proposal", label: "Proposal" },
  { key: "lost", label: "Lost" },
];
const KANBAN_STATUS_COLUMNS = STATUS_FILTERS.filter((item) => item.key !== "all");

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const getStatusClassName = (value) => {
  const status = normalizeStatus(value);
  if (["new", "contacted", "qualified", "proposal", "proposal_sent", "lost"].includes(status)) return status;
  return "unknown";
};

const PROPOSAL_REJECT_REASONS = ["Too Expensive", "Not Interested", "Competitor Chosen", "No Response"];

function LeadRequests() {
  const navigate = useNavigate();
  const role = (localStorage.getItem("role") || "").toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";

  const [assignmentSnapshot, setAssignmentSnapshot] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignableEmployees, setAssignableEmployees] = useState([]);
  const [assignSelectionByLead, setAssignSelectionByLead] = useState({});
  const [assigningLeadIds, setAssigningLeadIds] = useState({});
  const [activeStatus, setActiveStatus] = useState("all");

  const fetchAssignmentDashboard = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      setAssignmentLoading(true);
      if (isAdmin) {
        const res = await axios.get("http://localhost:5000/api/leads/all", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const items = (Array.isArray(res.data) ? res.data : []).map((lead) => ({
          _id: lead._id,
          name: lead.name,
          company: lead.company,
          email: lead.email,
          status: lead.status,
          assignedBy: null,
          assignedTo: lead.assignedTo || null,
          canAssign: false,
          canUnassign: false,
          nextAction: { type: "none", label: "No Immediate Action" },
        }));

        setAssignmentSnapshot({
          summary: {
            totalAssignedLeads: items.length,
            callActions: 0,
            meetingActions: 0,
            noImmediateAction: items.length,
          },
          items,
        });
      } else {
        const res = await axios.get("http://localhost:5000/api/leads/assignment-dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAssignmentSnapshot(res.data || null);
      }
    } catch (err) {
      console.error("Assignment dashboard fetch error:", err);
      setAssignmentSnapshot(null);
    } finally {
      setAssignmentLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAssignmentDashboard();
  }, [fetchAssignmentDashboard]);

  useEffect(() => {
    if (!(isManager || isAdmin)) {
      setAssignableEmployees([]);
      return;
    }

    const fetchAssignableEmployees = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/employees/assignable", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setAssignableEmployees(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error("Manager assignable employees fetch error:", err);
        setAssignableEmployees([]);
      }
    };

    fetchAssignableEmployees();
  }, [isAdmin, isManager]);

  const handleManagerAssignLead = useCallback(
    async (leadId) => {
      const selectedEmployeeId = assignSelectionByLead[leadId];
      if (!selectedEmployeeId) {
        window.alert("Select an employee first.");
        return;
      }

      try {
        const token = localStorage.getItem("token");
        setAssigningLeadIds((prev) => ({ ...prev, [leadId]: true }));

        await axios.post(
          "http://localhost:5000/api/leads/assign",
          { leadId, userId: selectedEmployeeId },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setAssignSelectionByLead((prev) => ({ ...prev, [leadId]: "" }));
        await fetchAssignmentDashboard();
      } catch (err) {
        console.error("Manager lead assignment error:", err);
        window.alert(err.response?.data?.message || "Failed to assign lead to employee.");
      } finally {
        setAssigningLeadIds((prev) => ({ ...prev, [leadId]: false }));
      }
    },
    [assignSelectionByLead, fetchAssignmentDashboard]
  );

  const handleManagerUnassignLead = useCallback(
    async (leadId) => {
      try {
        const token = localStorage.getItem("token");
        setAssigningLeadIds((prev) => ({ ...prev, [leadId]: true }));

        await axios.post(
          "http://localhost:5000/api/leads/assign",
          { leadId, userId: "" },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        await fetchAssignmentDashboard();
      } catch (err) {
        console.error("Manager lead unassign error:", err);
        window.alert(err.response?.data?.message || "Failed to remove assignment.");
      } finally {
        setAssigningLeadIds((prev) => ({ ...prev, [leadId]: false }));
      }
    },
    [fetchAssignmentDashboard]
  );

  const requestItems = useMemo(() => {
    const assignmentItems = assignmentSnapshot?.items || [];
    return assignmentItems;
  }, [assignmentSnapshot]);

  const statusCounts = useMemo(() => {
    const counts = requestItems.reduce(
      (acc, item) => {
        const key = normalizeStatus(item.status);
        if (key === "proposal_sent") {
          acc.proposal += 1;
          return acc;
        }
        if (acc[key] === undefined) return acc;
        acc[key] += 1;
        return acc;
      },
      {
        all: requestItems.length,
        new: 0,
        contacted: 0,
        qualified: 0,
        proposal: 0,
        lost: 0,
      }
    );

    return counts;
  }, [requestItems]);

  const filteredItems = useMemo(() => {
    if (activeStatus === "all") return requestItems;
    if (activeStatus === "proposal") {
      return requestItems.filter((item) => ["proposal", "proposal_sent"].includes(normalizeStatus(item.status)));
    }
    return requestItems.filter((item) => normalizeStatus(item.status) === activeStatus);
  }, [activeStatus, requestItems]);

  const visibleColumns = useMemo(() => {
    if (activeStatus === "all") return KANBAN_STATUS_COLUMNS;
    const selected = KANBAN_STATUS_COLUMNS.find((item) => item.key === activeStatus);
    return selected ? [selected] : KANBAN_STATUS_COLUMNS;
  }, [activeStatus]);

  const itemsByStatus = useMemo(() => {
    const grouped = {
      new: [],
      contacted: [],
      qualified: [],
      proposal: [],
      lost: [],
    };

    filteredItems.forEach((item) => {
      const key = normalizeStatus(item.status);
      if (key === "proposal_sent") {
        grouped.proposal.push(item);
        return;
      }
      if (grouped[key]) grouped[key].push(item);
    });

    return grouped;
  }, [filteredItems]);

  const openActionPage = (item) => {
    const nextActionType = String(item.nextAction?.type || "").toLowerCase();
    if (!["call", "meeting", "task"].includes(nextActionType)) {
      return;
    }

    const params = new URLSearchParams({
      type: nextActionType,
      create: "1",
      relatedType: "Lead",
      relatedId: String(item._id || ""),
      relatedName: String(item.name || "Lead"),
      source: "requests",
    });

    navigate(`/activities?${params.toString()}`);
  };

  const openProposalPage = (item) => {
    const params = new URLSearchParams({
      createProposal: "1",
      relatedType: "Lead",
      relatedId: String(item._id || ""),
      relatedName: String(item.name || "Lead"),
      relatedEmail: String(item.email || ""),
      source: "requests",
      returnTo: "requests",
    });

    navigate(`/activities?${params.toString()}`);
  };

  const handleAcceptProposal = useCallback(
    async (item) => {
      if (!item?._id) return;
      if (normalizeStatus(item.status) !== "proposal_sent") {
        window.alert("Only Proposal Sent leads can be accepted.");
        return;
      }

      if (!window.confirm("Accept this proposal and convert the lead?")) {
        return;
      }

      try {
        const token = localStorage.getItem("token");
        await axios.post(
          `http://localhost:5000/api/leads/${item._id}/proposal/accept`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        await fetchAssignmentDashboard();
        window.alert("Proposal accepted. Lead converted successfully.");
      } catch (err) {
        console.error(err);
        window.alert(
          err.response?.data?.message ||
          "Failed to accept proposal. Backend API may be unreachable."
        );
      }
    },
    [fetchAssignmentDashboard]
  );

  const handleRejectProposal = useCallback(
    async (item) => {
      if (!item?._id) return;
      if (normalizeStatus(item.status) !== "proposal_sent") {
        window.alert("Only Proposal Sent leads can be rejected.");
        return;
      }

      const reason = window.prompt(
        `Enter rejection reason (${PROPOSAL_REJECT_REASONS.join(", ")})`,
        PROPOSAL_REJECT_REASONS[0]
      );
      if (reason === null) return;

      const normalizedReason = String(reason || "").trim();
      if (!PROPOSAL_REJECT_REASONS.includes(normalizedReason)) {
        window.alert(`Please enter a valid reason: ${PROPOSAL_REJECT_REASONS.join(", ")}`);
        return;
      }

      try {
        const token = localStorage.getItem("token");
        await axios.post(
          `http://localhost:5000/api/leads/${item._id}/proposal/reject`,
          { reason: normalizedReason },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        await fetchAssignmentDashboard();
        window.alert("Proposal rejected and lead moved to Lost.");
      } catch (err) {
        console.error(err);
        window.alert(
          err.response?.data?.message ||
          "Failed to reject proposal. Backend API may be unreachable."
        );
      }
    },
    [fetchAssignmentDashboard]
  );

  const renderEmployeeAction = (item) => {
    const actionType = String(item.nextAction?.type || "none").toLowerCase();
    const label = item.nextAction?.label || "No Immediate Action";

    if (["call", "meeting", "task"].includes(actionType)) {
      return (
        <button
          type="button"
          className={`assignment-next-action assignment-next-action-btn ${actionType}`}
          onClick={() => openActionPage(item)}
        >
          {label}
        </button>
      );
    }

    return <div className={`assignment-next-action ${actionType}`}>{label}</div>;
  };

  const renderLeadCard = (item) => (
    <div key={item._id} className="lead-requests-card">
      <div>
        <div className="lead-requests-card-header">
          <div className="assignment-lead-name">{item.name || "Unnamed Lead"}</div>
          <div className="lead-requests-card-badges">
            <span className={`lead-status-badge ${getStatusClassName(item.status)}`}>
              {String(item.status || "Unknown").toUpperCase()}
            </span>
            <span className={`lead-assignment-badge ${item.assignedTo ? "assigned" : "unassigned"}`}>
              {item.assignedTo ? "ASSIGNED" : "UNASSIGNED"}
            </span>
          </div>
        </div>
        <div className="assignment-lead-meta">
          {item.company || "No Company"}
        </div>
        <div className="assignment-lead-meta">
          Assigned by: {item.assignedBy?.name || item.assignedBy?.username || "System"}
        </div>
        <div className="assignment-lead-meta">
          Assigned to: {item.assignedTo?.name || item.assignedTo?.username || "Unassigned"}
        </div>
      </div>

      {isManager && item.canAssign ? (
        <div className="assignment-manager-action lead-requests-card-action">
          <select
            value={assignSelectionByLead[item._id] || ""}
            onChange={(event) => {
              const value = event.target.value;
              setAssignSelectionByLead((prev) => ({ ...prev, [item._id]: value }));
            }}
            className="assignment-employee-select"
          >
            <option value="">Select employee</option>
            {assignableEmployees.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {(employee.name || employee.username || employee.email || "Employee")} ({String(employee.role || "").toUpperCase()})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="assignment-submit-btn"
            onClick={() => handleManagerAssignLead(item._id)}
            disabled={!assignSelectionByLead[item._id] || assigningLeadIds[item._id]}
          >
            {assigningLeadIds[item._id] ? "Assigning..." : "Assign"}
          </button>
        </div>
      ) : isManager && item.canUnassign ? (
        <div className="assignment-manager-action assignment-manager-action-readonly lead-requests-card-action">
          <div className={`assignment-next-action ${item.nextAction?.type || "tracking"}`}>
            {item.nextAction?.label || "Assigned"}
          </div>
          <button
            type="button"
            className="assignment-delete-btn"
            onClick={() => handleManagerUnassignLead(item._id)}
            disabled={assigningLeadIds[item._id]}
          >
            {assigningLeadIds[item._id] ? "Removing..." : "Delete Assignment"}
          </button>
        </div>
      ) : (
        <div className="lead-requests-card-action">
          {renderEmployeeAction(item)}
        </div>
      )}

      {["ADMIN", "MANAGER", "EMPLOYEE"].includes(role) && ["qualified", "proposal"].includes(normalizeStatus(item.status)) ? (
        <div className="lead-requests-card-action">
          <button
            type="button"
            className="assignment-submit-btn proposal-btn"
            onClick={() => openProposalPage(item)}
          >
            Create Proposal
          </button>
        </div>
      ) : null}

      {["ADMIN", "MANAGER", "EMPLOYEE"].includes(role) && normalizeStatus(item.status) === "proposal_sent" ? (
        <div className="lead-requests-card-action">
          <div className="proposal-response-actions">
            <button type="button" className="assignment-submit-btn" onClick={() => handleAcceptProposal(item)}>
              Accept Proposal
            </button>
            <button type="button" className="assignment-delete-btn" onClick={() => handleRejectProposal(item)}>
              Reject Proposal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="lead-requests-page">
          <div className="lead-requests-header">
            <div>
              <h2>{isManager ? "Lead Requests" : "My Lead Requests"}</h2>
              <p>
                Separate request workspace with stage-wise filtering for faster handling of high-volume records.
              </p>
            </div>
            <button type="button" className="assignment-submit-btn" onClick={() => navigate("/dashboard")}>
              Back To Dashboard
            </button>
          </div>

          <>
              <div className="assignment-summary-grid lead-requests-summary-grid">
                <div className="assignment-summary-card">
                  <span>Total Requests</span>
                  <strong>{statusCounts.all}</strong>
                </div>
                <div className="assignment-summary-card">
                  <span>Call Actions</span>
                  <strong>{assignmentSnapshot?.summary?.callActions || 0}</strong>
                </div>
                <div className="assignment-summary-card">
                  <span>Meeting Actions</span>
                  <strong>{assignmentSnapshot?.summary?.meetingActions || 0}</strong>
                </div>
                <div className="assignment-summary-card">
                  <span>No Immediate Action</span>
                  <strong>{assignmentSnapshot?.summary?.noImmediateAction || 0}</strong>
                </div>
              </div>

              <div className="lead-requests-status-tabs" role="tablist" aria-label="Request status filter">
                {STATUS_FILTERS.map((status) => (
                  <button
                    key={status.key}
                    type="button"
                    className={`lead-requests-status-tab ${activeStatus === status.key ? "active" : ""}`}
                    onClick={() => setActiveStatus(status.key)}
                    role="tab"
                    aria-selected={activeStatus === status.key}
                  >
                    {status.label}
                    <span>{statusCounts[status.key] || 0}</span>
                  </button>
                ))}
              </div>

              {assignmentLoading ? (
                <div className="assignment-empty">Loading lead requests...</div>
              ) : filteredItems.length === 0 ? (
                <div className="assignment-empty">No records found for the selected status.</div>
              ) : (
                <div className="lead-requests-kanban">
                  {visibleColumns.map((column) => {
                    const columnItems = itemsByStatus[column.key] || [];
                    return (
                      <section key={column.key} className={`lead-requests-kanban-column ${column.key}`}>
                        <header className="lead-requests-kanban-header">
                          <span>{column.label}</span>
                          <strong>{columnItems.length}</strong>
                        </header>
                        <div className="lead-requests-kanban-body">
                          {columnItems.length === 0 ? (
                            <div className="lead-requests-kanban-empty">No records in this status.</div>
                          ) : (
                            columnItems.map((item) => renderLeadCard(item))
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
          </>
        </div>
      </div>
    </div>
  );
}

export default LeadRequests;
