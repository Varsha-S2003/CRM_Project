import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./Leads.css";
import RecordActivityPanel from "./RecordActivityPanel";

const stages = [
  { id: "qualification", name: "Qualification", color: "#3b82f6" },
  { id: "need_analysis", name: "Need Analysis", color: "#f59e0b" },
  { id: "value_proposition", name: "Value Proposition", color: "#8b5cf6" },
  { id: "identify_decision_maker", name: "Identify Decision Maker", color: "#06b6d4" },
  { id: "proposal_price_quote", name: "Proposal/Price Quote", color: "#ec4899" },
  { id: "negotiate", name: "Negotiate", color: "#6366f1" },
  { id: "won", name: "Won", color: "#10b981" },
  { id: "lost", name: "Lost", color: "#ef4444" },
];

function Deals() {
  const [deals, setDeals] = useState([]);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newDeal, setNewDeal] = useState({
    name: "",
    company: "",
    amount: "",
    contact: "",
    email: "",
    phone: "",
    stage: "qualification",
  });

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/deals", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setDeals(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDeals();
  }, []);

  const filteredDeals = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return deals;
    return deals.filter((deal) =>
      [deal.name, deal.company, deal.contact, deal.email, deal.phone]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [deals, search]);

  const totalValue = useMemo(
    () => deals.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0),
    [deals]
  );

  const wonCount = useMemo(
    () => deals.filter((deal) => deal.stage === "won").length,
    [deals]
  );

  const lostCount = useMemo(
    () => deals.filter((deal) => deal.stage === "lost").length,
    [deals]
  );

  const openCount = deals.length - wonCount - lostCount;

  const getDealsByStage = (stageId) => filteredDeals.filter((deal) => deal.stage === stageId);

  // Get stages that have deals matching the search
  const getStagesWithDeals = () => {
    if (!search.trim()) return stages;
    return stages.filter((stage) => getDealsByStage(stage.id).length > 0);
  };

  const openCreateModal = () => {
    setNewDeal({
      name: "",
      company: "",
      amount: "",
      contact: "",
      email: "",
      phone: "",
      stage: "qualification",
    });
    setShowModal(true);
  };

  const submitNewDeal = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/deals",
        { ...newDeal, amount: Number(newDeal.amount) || 0 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDeals((prev) => [res.data, ...prev]);
      setShowModal(false);
    } catch (err) {
      console.error(err);
      const errorMessage =
        err.response?.data?.message ||
        (typeof err.response?.data === "string" ? err.response.data : "") ||
        err.message ||
        "Failed to create deal";
      alert(errorMessage);
    }
  };

  const updateStage = async (dealId, stageId) => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `http://localhost:5000/api/deals/${dealId}`,
        { stage: stageId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDeals((prev) =>
        prev.map((deal) => (deal._id === dealId ? res.data : deal))
      );
      setSelectedDeal((prev) => (prev && prev._id === dealId ? res.data : prev));
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || err.message || "Failed to update deal stage");
    }
  };

  const deleteDeal = async (dealId) => {
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/deals/${dealId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeals((prev) => prev.filter((deal) => deal._id !== dealId));
      setSelectedDeal(null);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || err.message || "Failed to delete deal");
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content leads-page">
        <div className="leads-fixed-top">
          <div className="leads-header-section">
            <div className="leads-header-left">
              <h1>Deals</h1>
              <p>Manage the complete deal pipeline from qualification to closure</p>
            </div>
            <div className="leads-header-right">
              <button className="btn-primary" onClick={openCreateModal}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Deal
              </button>
            </div>
          </div>

          <div className="leads-stats-row">
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">{deals.length}</span>
                <span className="stat-label">Total Deals</span>
              </div>
            </div>
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">{openCount}</span>
                <span className="stat-label">Open Deals</span>
              </div>
            </div>
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">{wonCount}</span>
                <span className="stat-label">Won Deals</span>
              </div>
            </div>
            <div className="stat-card-zoho">
              <div className="stat-content">
                <span className="stat-value">${totalValue.toLocaleString()}</span>
                <span className="stat-label">Pipeline Value</span>
              </div>
            </div>
          </div>

          <div className="leads-toolbar-zoho">
            <div className="search-box-zoho">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search deals by name, company, contact, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSearch(e.currentTarget.value);
                  }
                }}
              />
            </div>
            <div className="toolbar-actions">
              <button
                className="btn-filter"
                onClick={() => setSearch(search.trim())}
                type="button"
              >
                Search
              </button>
              <button className="btn-filter" type="button">Export</button>
            </div>
          </div>
        </div>

        <div className="leads-scroll-content">
          {loading ? (
            <p className="dashboard-subtitle">Loading deals...</p>
          ) : (
          <div className="kanban-board-zoho">
            {getStagesWithDeals().map((stage) => (
              <div key={stage.id} className="kanban-column-zoho">
                <div className="column-header-zoho" style={{ borderTopColor: stage.color }}>
                  <div className="column-title-zoho">
                    <span className="column-dot" style={{ backgroundColor: stage.color }}></span>
                    <h3>{stage.name}</h3>
                  </div>
                  <span className="lead-count-zoho">{getDealsByStage(stage.id).length}</span>
                </div>
                <div className="column-content-zoho">
                  {getDealsByStage(stage.id).map((deal) => (
                    <div
                      key={deal._id}
                      className="kanban-card-zoho"
                      onClick={() => setSelectedDeal(deal)}
                    >
                      <div className="card-top-row">
                        <h4>{deal.name}</h4>
                        <span className="status-badge-zoho">{deal.stage.replaceAll("_", " ")}</span>
                      </div>
                      <div className="card-company-zoho">{deal.company || "-"}</div>
                      <div className="card-detail">{deal.contact || "-"}</div>
                      <div className="card-detail">{deal.email || "-"}</div>
                      <div className="card-detail">{deal.phone || "-"}</div>
                      <div className="card-source">
                        <span className="source-text">${Number(deal.amount || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>

        {showModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Create New Deal</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>x</button>
              </div>
              <form onSubmit={submitNewDeal} className="modal-form-zoho">
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Deal Name *</label>
                    <input
                      type="text"
                      name="name"
                      value={newDeal.name}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, name: e.target.value }))}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Company</label>
                    <input
                      type="text"
                      name="company"
                      value={newDeal.company}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, company: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Contact Person</label>
                    <input
                      type="text"
                      name="contact"
                      value={newDeal.contact}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, contact: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={newDeal.email}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, email: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Deal Value</label>
                    <input
                      type="number"
                      name="amount"
                      min="0"
                      value={newDeal.amount}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, amount: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={newDeal.phone}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, phone: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="form-row-zoho">
                  <div className="form-group">
                    <label>Stage</label>
                    <select
                      value={newDeal.stage}
                      onChange={(e) => setNewDeal((prev) => ({ ...prev, stage: e.target.value }))}
                    >
                      {stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-submit">Create Deal</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedDeal && (
          <div className="modal-overlay-zoho" onClick={() => setSelectedDeal(null)}>
            <div className="modal-box-zoho modal-view" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>{selectedDeal.name}</h2>
                <button className="modal-close" onClick={() => setSelectedDeal(null)}>x</button>
              </div>
              <div className="lead-details-view">
                <div className="detail-row">
                  <span className="detail-label">Company</span>
                  <span className="detail-value">{selectedDeal.company || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Contact</span>
                  <span className="detail-value">{selectedDeal.contact || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{selectedDeal.email || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Phone</span>
                  <span className="detail-value">{selectedDeal.phone || "-"}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Deal Value</span>
                  <span className="detail-value">${Number(selectedDeal.amount || 0).toLocaleString()}</span>
                </div>
              </div>
              <div className="status-section">
                <h3>Change Stage</h3>
                <div className="status-grid">
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      className={`status-btn-zoho ${selectedDeal.stage === stage.id ? "active" : ""}`}
                      style={{ borderColor: stage.color, color: selectedDeal.stage === stage.id ? stage.color : "" }}
                      onClick={() => updateStage(selectedDeal._id, stage.id)}
                    >
                      {stage.name}
                    </button>
                  ))}
                </div>
              </div>
              <RecordActivityPanel
                recordType="Deal"
                recordId={selectedDeal._id}
                recordName={selectedDeal.name}
              />
              <button className="delete-btn-zoho" onClick={() => deleteDeal(selectedDeal._id)}>
                Delete Deal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Deals;
