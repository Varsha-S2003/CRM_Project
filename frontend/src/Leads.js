
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Leads.css";
import Sidebar from "./Sidebar";
import RecordActivityPanel from "./RecordActivityPanel";

function Leads() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [newLead, setNewLead] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    source: "",
    status: "new",
  });
  // compute role flags for UI
  const role = localStorage.getItem("role")?.toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";

  const [employees, setEmployees] = useState([]);

  const fetchEmployees = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/employees", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmployees(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const navigate = useNavigate();

  const stages = [
    { id: "new", name: "New", color: "#3b82f6" },
    { id: "contacted", name: "Contacted", color: "#f59e0b" },
    { id: "qualified", name: "Qualified", color: "#8b5cf6" },
    { id: "proposal", name: "Proposal", color: "#ec4899" },
    { id: "converted", name: "Converted", color: "#10b981" },
    { id: "lost", name: "Lost", color: "#ef4444" },
  ];

  const sources = ["Website", "Referral", "Social Media", "Email Campaign", "Cold Call", "Trade Show", "Other"];

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const role = localStorage.getItem("role")?.toUpperCase();
      const params = {};
      if (search) params.search = search;
      // pick endpoint according to role
      let url;
      if (role === "EMPLOYEE") {
        url = "/api/leads/my";
      } else {
        // ADMIN or MANAGER
        url = "/api/leads/all";
      }
      const res = await axios.get(`http://localhost:5000${url}`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setLeads(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [search]);

  useEffect(() => {
    const role = localStorage.getItem("role")?.toUpperCase();
    if (!role) {
      navigate("/login");
    }
    if (isAdmin || isManager) {
      fetchEmployees();
    }
  }, [navigate, isAdmin, isManager, fetchEmployees]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleAddLead = () => {
    setNewLead({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      company: "",
      source: "",
      status: "new",
    });
    setShowModal(true);
  };

  const submitNewLead = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const leadData = {
        name: `${newLead.firstName} ${newLead.lastName}`,
        email: newLead.email,
        phone: newLead.phone,
        company: newLead.company,
        source: newLead.source,
        status: newLead.status,
      };
      await axios.post(
        "http://localhost:5000/api/leads",
        leadData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowModal(false);
      fetchStats();
      fetchLeads();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to add lead");
    }
  };

  const handleViewLead = (lead) => {
    setSelectedLead(lead);
  };

  const handleUpdateStatus = async (leadId, newStatus) => {
    try {
      const token = localStorage.getItem("token");
      const leadToConvert = leads.find((lead) => lead._id === leadId);
      await axios.put(
        `http://localhost:5000/api/leads/${leadId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // When a lead is converted, create matching records in Mongo deals and contacts collections.
      if (newStatus === "converted" && leadToConvert) {
        const newDeal = {
          sourceLeadId: leadId,
          name: leadToConvert.name || "Converted Lead Deal",
          company: leadToConvert.company || "",
          amount: 0,
          contact: leadToConvert.name || "",
          email: leadToConvert.email || "",
          stage: "qualification",
        };
        const newCustomer = {
          sourceLeadId: leadId,
          name: leadToConvert.name || "",
          company: leadToConvert.company || "",
          email: leadToConvert.email || "",
          phone: leadToConvert.phone || "",
          source: leadToConvert.source || "",
          convertedAt: new Date().toISOString(),
        };

        await Promise.all([
          axios.post("http://localhost:5000/api/deals", newDeal, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.post("http://localhost:5000/api/contacts", newCustomer, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
      }

      fetchLeads();
      fetchStats();
      setSelectedLead(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update lead status");
    }
  };

  const handleAssign = async (leadId, userId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        "http://localhost:5000/api/leads/assign",
        { leadId, userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchLeads();
      fetchStats();
      // update selectedLead assignment locally if it's open
      if (selectedLead && selectedLead._id === leadId) {
        setSelectedLead((prev) => ({ ...prev, assignedTo: userId }));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to assign lead");
    }
  };

  const handleDeleteLead = async (leadId) => {
    if (!window.confirm("Are you sure you want to delete this lead?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/leads/${leadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLeads();
      fetchStats();
      setSelectedLead(null);
    } catch (err) {
      console.error(err);
      alert("Failed to delete lead");
    }
  };

  const getLeadsByStage = (stageId) => {
    return leads.filter((lead) => lead.status === stageId);
  };

  // Get stages that have leads matching the search
  const getStagesWithLeads = () => {
    if (!search.trim()) return stages;
    return stages.filter((stage) => getLeadsByStage(stage.id).length > 0);
  };

  const getSourceIcon = (source) => {
    const icons = {
      "Website": "🌐",
      "Referral": "🤝",
      "Social Media": "📱",
      "Email Campaign": "📧",
      "Cold Call": "📞",
      "Trade Show": "🎪",
      "Other": "📋"
    };
    return icons[source] || "📋";
  };

  const formatAddedDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString();
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content leads-page">
        <div className="leads-fixed-top">
          {/* Header */}
          <div className="leads-header-section">
            <div className="leads-header-left">
              <h1>Leads</h1>
              <p>Manage and track your potential customers</p>
            </div>
            <div className="leads-header-right">
              <button className="btn-primary" onClick={handleAddLead}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Lead
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && stats.leadCounts && (
            <div className="leads-stats-row">
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-blue">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.new || 0}</span>
                  <span className="stat-label">New Leads</span>
                </div>
              </div>
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-orange">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.contacted || 0}</span>
                  <span className="stat-label">Contacted</span>
                </div>
              </div>
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-purple">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4"></polyline>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.qualified || 0}</span>
                  <span className="stat-label">Qualified</span>
                </div>
              </div>
              <div className="stat-card-zoho">
                <div className="stat-icon stat-icon-green">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10"></line>
                    <line x1="18" y1="20" x2="18" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="16"></line>
                  </svg>
                </div>
                <div className="stat-content">
                  <span className="stat-value">{stats.leadCounts.converted || 0}</span>
                  <span className="stat-label">Converted</span>
                </div>
              </div>
            </div>
          )}

          {/* Search and Filter Bar */}
          <div className="leads-toolbar-zoho">
            <div className="search-box-zoho">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search leads by name, email, company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="toolbar-actions">
              <button className="btn-filter" type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Export
              </button>
            </div>
          </div>
        </div>

        <div className="leads-scroll-content">
          {/* Kanban Board */}
          <div className="kanban-board-zoho">
            {getStagesWithLeads().map((stage) => (
              <div key={stage.id} className="kanban-column-zoho">
                <div className="column-header-zoho" style={{ borderTopColor: stage.color }}>
                  <div className="column-title-zoho">
                    <span className="column-dot" style={{ backgroundColor: stage.color }}></span>
                    <h3>{stage.name}</h3>
                  </div>
                  <span className="lead-count-zoho">{getLeadsByStage(stage.id).length}</span>
                </div>
                <div className="column-content-zoho">
                  {getLeadsByStage(stage.id).map((lead) => (
                    <div
                      key={lead._id}
                      className="kanban-card-zoho"
                      onClick={() => handleViewLead(lead)}
                    >
                      <div className="card-top-row">
                        <h4>{lead.name}</h4>
                        <span className={`status-badge-zoho ${lead.status}`}>{lead.status}</span>
                      </div>
                      {lead.company && (
                        <div className="card-company-zoho">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                          </svg>
                          {lead.company}
                        </div>
                      )}
                      <div className="card-details-zoho">
                        {lead.email && (
                          <div className="card-detail">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                              <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                            {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div className="card-detail">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            {lead.phone}
                          </div>
                        )}
                      </div>
                      {lead.source && (
                        <div className="card-source">
                          <span className="source-icon">{getSourceIcon(lead.source)}</span>
                          <span className="source-text">{lead.source}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Lead Modal */}
        {showModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Create New Lead</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={submitNewLead} className="modal-form-zoho">
                <div className="form-section">
                  <h3>Basic Information</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>First Name *</label>
                      <input
                        type="text"
                        placeholder="Enter first name"
                        value={newLead.firstName}
                        onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Last Name *</label>
                      <input
                        type="text"
                        placeholder="Enter last name"
                        value={newLead.lastName}
                        onChange={(e) => setNewLead({ ...newLead, lastName: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Email *</label>
                      <input
                        type="email"
                        placeholder="Enter email address"
                        value={newLead.email}
                        onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Phone</label>
                      <input
                        type="tel"
                        placeholder="Enter phone number"
                        value={newLead.phone}
                        onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="form-section">
                  <h3>Additional Details</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Company</label>
                      <input
                        type="text"
                        placeholder="Enter company name"
                        value={newLead.company}
                        onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Lead Source</label>
                      <select
                        value={newLead.source}
                        onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                      >
                        <option value="">Select source</option>
                        {sources.map((source) => (
                          <option key={source} value={source}>{source}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        value={newLead.status}
                        onChange={(e) => setNewLead({ ...newLead, status: e.target.value })}
                      >
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>{stage.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit">Create Lead</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View/Edit Lead Modal */}
        {selectedLead && (
          <div className="modal-overlay-zoho" onClick={() => setSelectedLead(null)}>
            <div className="modal-box-zoho modal-view" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>{selectedLead.name}</h2>
                <button className="modal-close" onClick={() => setSelectedLead(null)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <div className="lead-details-view">
                <div className="detail-row">
                  <span className="detail-label">Company</span>
                  <span className="detail-value">{selectedLead.company || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{selectedLead.email || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Phone</span>
                  <span className="detail-value">{selectedLead.phone || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Source</span>
                  <span className="detail-value">{selectedLead.source || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className={`status-badge-zoho ${selectedLead.status}`}>{selectedLead.status}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Added On</span>
                  <span className="detail-value">{formatAddedDate(selectedLead.createdAt)}</span>
                </div>
              </div>
              { (isAdmin || isManager) && (
                <div className="assign-section">
                  <h3>Assign To</h3>
                  <select
                    value={selectedLead.assignedTo || ""}
                    onChange={(e) => handleAssign(selectedLead._id, e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.username} ({emp.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="status-section">
                <h3>Change Status</h3>
                <div className="status-grid">
                  {stages.map((stage) => (
                    <button 
                      key={stage.id} 
                      className={`status-btn-zoho ${selectedLead.status === stage.id ? 'active' : ''}`}
                      style={{ borderColor: stage.color, color: selectedLead.status === stage.id ? stage.color : '' }}
                      onClick={() => handleUpdateStatus(selectedLead._id, stage.id)}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>
              <RecordActivityPanel
                recordType="Lead"
                recordId={selectedLead._id}
                recordName={selectedLead.name}
              />
              {isAdmin && (
                <button className="delete-btn-zoho" onClick={() => handleDeleteLead(selectedLead._id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Delete Lead
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Leads;


