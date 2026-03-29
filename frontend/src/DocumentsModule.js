import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./DocumentsModule.css";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const getStatusLabel = (status) => {
  const value = String(status || "draft").trim().toLowerCase();
  const labels = {
    draft: "Draft",
    pending_approval: "Pending Approval",
    approved: "Approved",
    rejected: "Rejected",
    sent_to_client: "Sent To Client",
  };
  return labels[value] || "Draft";
};

function DocumentsModule() {
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("token");
  const role = String(localStorage.getItem("role") || "").toUpperCase();
  const isManagerOrAdmin = role === "MANAGER" || role === "ADMIN";
  const dealId = String(searchParams.get("dealId") || "").trim();

  const fallbackDraft = useMemo(
    () => ({
      title: searchParams.get("dealName") ? `${searchParams.get("dealName")} Proposal` : "Proposal Draft",
      introduction: `We are pleased to share a proposal for ${searchParams.get("company") || searchParams.get("dealName") || "this opportunity"}.`,
      problem: "Customer problem statement to be confirmed.",
      solution: "Recommended solution based on deal discussion.",
      scope: "Implementation scope and deliverables.",
      pricingNotes: searchParams.get("amount")
        ? `Quoted amount: Rs.${Number(searchParams.get("amount") || 0).toLocaleString()}`
        : "Pricing details will be finalized here.",
      terms: "Commercial terms and validity conditions.",
      status: "draft",
      approvalComment: "",
      approvalRequestedAt: null,
      approvalRespondedAt: null,
      clientSentAt: null,
      approvedBy: null,
    }),
    [searchParams]
  );

  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(Boolean(dealId));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [form, setForm] = useState(fallbackDraft);

  const fetchWorkspace = useCallback(async () => {
    if (!dealId || !token) return;
    try {
      setLoading(true);
      setError("");
      const res = await axios.get(`http://localhost:5000/api/deals/${dealId}/proposal-workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = res.data || {};
      setWorkspace(payload);
      const draft = payload?.deal?.proposalDraft || {};
      setForm({
        title: draft.title || fallbackDraft.title,
        introduction: draft.introduction || fallbackDraft.introduction,
        problem: draft.problem || fallbackDraft.problem,
        solution: draft.solution || fallbackDraft.solution,
        scope: draft.scope || fallbackDraft.scope,
        pricingNotes: draft.pricingNotes || fallbackDraft.pricingNotes,
        terms: draft.terms || fallbackDraft.terms,
        status: draft.status || "draft",
        approvalComment: draft.approvalComment || "",
        approvalRequestedAt: draft.approvalRequestedAt || null,
        approvalRespondedAt: draft.approvalRespondedAt || null,
        clientSentAt: draft.clientSentAt || null,
        approvedBy: draft.approvedBy || null,
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load document workspace.");
    } finally {
      setLoading(false);
    }
  }, [dealId, token, fallbackDraft]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!workspace?.deal || workspace?.deal?.proposalDraft?.title || !dealId || !token) return;

    const autoCreate = async () => {
      try {
        await axios.post(
          `http://localhost:5000/api/deals/${dealId}/proposal-draft`,
          {
            title: fallbackDraft.title,
            introduction: fallbackDraft.introduction,
            problem: fallbackDraft.problem,
            solution: fallbackDraft.solution,
            scope: fallbackDraft.scope,
            pricingNotes: fallbackDraft.pricingNotes,
            terms: fallbackDraft.terms,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setMessage("Proposal draft created automatically from the selected deal.");
        fetchWorkspace();
      } catch (_err) {}
    };

    autoCreate();
  }, [workspace, dealId, token, fallbackDraft, fetchWorkspace]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (message) setMessage("");
  };

  const handleSaveDraft = async () => {
    if (!dealId || !token) return;
    if (!String(form.title || "").trim()) {
      setMessage("Proposal title is required.");
      return;
    }

    try {
      setBusyAction("save");
      await axios.post(
        `http://localhost:5000/api/deals/${dealId}/proposal-draft`,
        {
          title: form.title,
          introduction: form.introduction,
          problem: form.problem,
          solution: form.solution,
          scope: form.scope,
          pricingNotes: form.pricingNotes,
          terms: form.terms,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage("Proposal saved successfully.");
      await fetchWorkspace();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to save proposal.");
    } finally {
      setBusyAction("");
    }
  };

  const handleSendForApproval = async () => {
    try {
      setBusyAction("approval");
      await handleSaveDraft();
      await axios.post(
        `http://localhost:5000/api/deals/${dealId}/proposal-approval-request`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage("Proposal sent to manager for approval.");
      await fetchWorkspace();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to send for approval.");
    } finally {
      setBusyAction("");
    }
  };

  const handleApprove = async (action) => {
    try {
      setBusyAction(action);
      await axios.post(
        `http://localhost:5000/api/deals/${dealId}/proposal-approval`,
        { action, comment: form.approvalComment || "" },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(action === "approve" ? "Proposal approved." : "Proposal rejected.");
      await fetchWorkspace();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to update approval.");
    } finally {
      setBusyAction("");
    }
  };

  const handleSendToClient = async () => {
    try {
      setBusyAction("client");
      await axios.post(
        `http://localhost:5000/api/deals/${dealId}/proposal-send-client`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage("Proposal sent to client.");
      await fetchWorkspace();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to send proposal to client.");
    } finally {
      setBusyAction("");
    }
  };

  const deal = workspace?.deal || {};
  const draftStatus = String(workspace?.deal?.proposalDraft?.status || form.status || "draft");
  const canSendToClient = draftStatus === "approved";
  const history = workspace?.history || [];
  const notifications = workspace?.notifications || [];
  const timeline = Array.isArray(deal.timeline) ? [...deal.timeline].reverse() : [];

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content documents-page">
        <div className="documents-hero">
          <div className="documents-hero__copy">
            <span className="documents-eyebrow">Documents Workspace</span>
            <h1>{form.title || "Proposal Draft"}</h1>
            <p>Build the proposal, review customer history, and route approval before sending it to the client.</p>
          </div>
          <div className="documents-hero__status">
            <div className={`documents-status-pill ${draftStatus}`}>{getStatusLabel(draftStatus)}</div>
            <div className="documents-actions documents-actions--stack">
              <button type="button" className="documents-primary-btn" onClick={handleSaveDraft} disabled={busyAction !== ""}>
                {busyAction === "save" ? "Saving..." : "Create Proposal"}
              </button>
              <button type="button" className="documents-secondary-btn" onClick={handleSendForApproval} disabled={busyAction !== ""}>
                {busyAction === "approval" ? "Sending..." : "Send To Manager For Approval"}
              </button>
              <button type="button" className="documents-secondary-btn" onClick={handleSendToClient} disabled={!canSendToClient || busyAction !== ""}>
                {busyAction === "client" ? "Sending..." : "Send To Client"}
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="documents-message error">{error}</div> : null}
        {message ? <div className={`documents-message ${/failed|required/i.test(message) ? "error" : "success"}`}>{message}</div> : null}

        {loading ? (
          <div className="documents-card">Loading document workspace...</div>
        ) : (
          <div className="documents-layout">
            <section className="documents-main">
              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Introduction</h2>
                </div>
                <textarea rows="4" value={form.introduction} onChange={(event) => updateField("introduction", event.target.value)} />
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Problem</h2>
                </div>
                <textarea rows="4" value={form.problem} onChange={(event) => updateField("problem", event.target.value)} />
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Solution</h2>
                </div>
                <textarea rows="4" value={form.solution} onChange={(event) => updateField("solution", event.target.value)} />
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Scope</h2>
                </div>
                <textarea rows="4" value={form.scope} onChange={(event) => updateField("scope", event.target.value)} />
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Pricing Table</h2>
                </div>
                <div className="documents-pricing-table">
                  <div>
                    <span>Deal Value</span>
                    <strong>{deal.amount ? `Rs.${Number(deal.amount).toLocaleString()}` : "-"}</strong>
                  </div>
                  <div>
                    <span>Stage</span>
                    <strong>{String(deal.stage || "-").replaceAll("_", " ")}</strong>
                  </div>
                  <div>
                    <span>Pricing Notes</span>
                    <textarea rows="3" value={form.pricingNotes} onChange={(event) => updateField("pricingNotes", event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Terms</h2>
                </div>
                <textarea rows="4" value={form.terms} onChange={(event) => updateField("terms", event.target.value)} />
              </div>
            </section>

            <aside className="documents-side">
              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Deal Info</h2>
                </div>
                <div className="documents-info-list">
                  <div><span>Deal</span><strong>{deal.name || searchParams.get("dealName") || "-"}</strong></div>
                  <div><span>Company</span><strong>{deal.company || searchParams.get("company") || "-"}</strong></div>
                  <div><span>Contact</span><strong>{deal.contact || searchParams.get("contact") || "-"}</strong></div>
                  <div><span>Email</span><strong>{deal.email || searchParams.get("email") || "-"}</strong></div>
                  <div><span>Product</span><strong>{deal.product?.name || "-"}</strong></div>
                </div>
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Status</h2>
                </div>
                <div className="documents-status-panel">
                  <div><span>Proposal Status</span><strong>{getStatusLabel(draftStatus)}</strong></div>
                  <div><span>Approval Requested</span><strong>{formatDateTime(workspace?.deal?.proposalDraft?.approvalRequestedAt)}</strong></div>
                  <div><span>Approval Response</span><strong>{formatDateTime(workspace?.deal?.proposalDraft?.approvalRespondedAt)}</strong></div>
                  <div><span>Client Sent</span><strong>{formatDateTime(workspace?.deal?.proposalDraft?.clientSentAt)}</strong></div>
                </div>
                {isManagerOrAdmin && draftStatus === "pending_approval" ? (
                  <div className="documents-approval-box">
                    <textarea
                      rows="3"
                      value={form.approvalComment}
                      onChange={(event) => updateField("approvalComment", event.target.value)}
                      placeholder="Approval comment"
                    />
                    <div className="documents-actions">
                      <button type="button" className="documents-primary-btn" onClick={() => handleApprove("approve")} disabled={busyAction !== ""}>
                        Approve
                      </button>
                      <button type="button" className="documents-secondary-btn" onClick={() => handleApprove("reject")} disabled={busyAction !== ""}>
                        Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Activity Timeline</h2>
                </div>
                <div className="documents-stack-list">
                  {timeline.length ? timeline.map((event, index) => (
                    <div className="documents-stack-item" key={`${event.changedAt}-${index}`}>
                      <strong>{event.userName || "User"}</strong>
                      <p>{String(event.fromStage || "-").replaceAll("_", " ")} to {String(event.toStage || "-").replaceAll("_", " ")}</p>
                      <span>{formatDateTime(event.changedAt)}</span>
                    </div>
                  )) : <div className="documents-empty">No activity timeline yet.</div>}
                </div>
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>History</h2>
                </div>
                <div className="documents-stack-list">
                  {history.length ? history.map((item) => (
                    <div className="documents-stack-item" key={item._id}>
                      <strong>{item.name || "Deal"}</strong>
                      <p>{item.company || "-"} • {String(item.stage || "-").replaceAll("_", " ")}</p>
                      <span>{formatDateTime(item.updatedAt || item.createdAt)}</span>
                    </div>
                  )) : <div className="documents-empty">No previous customer history found.</div>}
                </div>
              </div>

              <div className="documents-card">
                <div className="documents-card__header">
                  <h2>Notifications</h2>
                </div>
                <div className="documents-stack-list">
                  {notifications.length ? notifications.map((item) => (
                    <div className="documents-stack-item" key={item._id}>
                      <strong>{item.changedByName || "System"}</strong>
                      <p>{item.message || "-"}</p>
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  )) : <div className="documents-empty">No notifications for this proposal yet.</div>}
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentsModule;
