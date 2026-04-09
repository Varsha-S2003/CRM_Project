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
    changes_requested: "Changes Requested",
    rejected: "Rejected",
    sent_to_client: "Sent To Client",
  };
  return labels[value] || "Draft";
};

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  return `Rs.${numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const formatPercent = (value) => {
  const numeric = Number(value || 0);
  return `${numeric.toFixed(2)}%`;
};

const emitDealRefresh = () => {
  window.dispatchEvent(new Event("deal-updated"));
};

function DocumentsModule() {
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("token");
  const role = String(localStorage.getItem("role") || "").toUpperCase();
  const isManager = role === "MANAGER";
  const isEmployee = role === "EMPLOYEE";
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
  const [showEditor, setShowEditor] = useState(false);
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
    if (!isEmployee) {
      setMessage("Only employees can send proposals for manager approval.");
      return;
    }

    try {
      setBusyAction("approval");
      await handleSaveDraft();

      // Best-effort stage sync so UI reflects negotiate transition immediately.
      try {
        await axios.put(
          `http://localhost:5000/api/deals/${dealId}/stage`,
          { stage: "negotiate" },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (_syncErr) {
        // Ignore here; backend proposal endpoint also enforces transition.
      }

      const res = await axios.post(
        `http://localhost:5000/api/deals/${dealId}/proposal-approval-request`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(res?.data?.message || "Proposal sent to manager for approval.");
      if (res?.data?.stage) {
        setWorkspace((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            deal: {
              ...(prev.deal || {}),
              stage: res.data.stage,
            },
          };
        });
      }
      emitDealRefresh();
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
      setMessage(
        action === "approve"
          ? "Proposal approved."
          : action === "edit"
            ? "Proposal sent back to employee for edits."
            : "Proposal rejected."
      );
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
      const res = await axios.post(
        `http://localhost:5000/api/deals/${dealId}/proposal-send-client`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage(res?.data?.message || "Proposal sent to client.");
      emitDealRefresh();
      await fetchWorkspace();
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to send proposal to client.");
    } finally {
      setBusyAction("");
    }
  };

  const deal = workspace?.deal || {};
  const taxSummary = workspace?.taxSummary || null;
  const invoice = workspace?.invoice || {};
  const lineItems = Array.isArray(workspace?.lineItems) ? workspace.lineItems : [];
  const displayLineItems =
    lineItems.length > 0
      ? lineItems
      : taxSummary
        ? [
            {
              productName: deal.product?.name || deal.name || "-",
              price: Number(deal.product?.price ?? deal.product?.cost ?? 0),
              quantity: Number(deal.quantity || 1),
              gstPercent: taxSummary.gstPercent,
              hsnSac: taxSummary.hsnSac,
              taxableAmount: taxSummary.taxableAmount,
              cgst: taxSummary.cgst,
              sgst: taxSummary.sgst,
              igst: taxSummary.igst,
              totalAmount: taxSummary.grandTotal,
            },
          ]
        : [];
  const subtotal = displayLineItems.reduce((sum, item) => sum + Number(item.taxableAmount || 0), 0);
  const totalGst = displayLineItems.reduce((sum, item) => {
    const cgst = Number(item.cgst || 0);
    const sgst = Number(item.sgst || 0);
    const igst = Number(item.igst || 0);
    return sum + cgst + sgst + igst;
  }, 0);
  const grandTotal = displayLineItems.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
  const draftStatus = String(workspace?.deal?.proposalDraft?.status || form.status || "draft");
  const dealStage = String(deal?.stage || "").trim().toLowerCase();
  const isNegotiateStage = dealStage === "negotiate";
  const canManagerReview = isManager && draftStatus === "pending_approval" && isNegotiateStage;
  const canSendForApproval = isEmployee;
  const canSendToClient = isEmployee;
  const sendForApprovalBlockedReason = !isEmployee
    ? "Send To Manager For Approval is available only for Employee login."
    : "";
  const sendToClientBlockedReason = !canSendToClient
    ? "Send To Client is available only for Employee login."
    : "";
  const history = workspace?.history || [];
  const notifications = workspace?.notifications || [];
  const timeline = Array.isArray(deal.timeline) ? [...deal.timeline].reverse() : [];
  const heroMeta = [
      { label: "Deal", value: deal.name || searchParams.get("dealName") || "-" },
      { label: "Company", value: deal.company || searchParams.get("company") || "-" },
      { label: "Product", value: deal.product?.name || "-" },
    ];

  const openEditor = () => setShowEditor(true);
  const closeEditor = () => setShowEditor(false);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content documents-page">
        <div className="documents-hero">
          <div className="documents-hero__copy">
            <span className="documents-eyebrow">Documents Workspace</span>
            <h1>{form.title || "Proposal Draft"}</h1>
            <p>Keep the page clean, open the proposal editor only when needed, and review history at a glance.</p>
            <div className="documents-hero__meta">
              {heroMeta.map((item) => (
                <div className="documents-meta-pill" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="documents-hero__status">
            <div className={`documents-status-pill ${draftStatus}`}>{getStatusLabel(draftStatus)}</div>
            <button type="button" className="documents-primary-btn documents-primary-btn--hero" onClick={openEditor} disabled={busyAction !== ""}>
              {busyAction === "save" ? "Saving..." : "Create Proposal"}
            </button>
          </div>
        </div>

        {error ? <div className="documents-message error">{error}</div> : null}
        {message ? <div className={`documents-message ${/failed|required/i.test(message) ? "error" : "success"}`}>{message}</div> : null}

        {loading ? (
          <div className="documents-card">Loading document workspace...</div>
        ) : (
          <div className="documents-empty-page">
            <div className="documents-card documents-history-card">
              <div className="documents-card__header documents-card__header--row">
                <div>
                  <h2>History</h2>
                  <p>Completed proposals and prior customer activity stay visible here.</p>
                </div>
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
          </div>
        )}

        {showEditor ? (
          <div className="documents-modal" role="dialog" aria-modal="true" aria-label="Proposal editor">
            <div className="documents-modal__backdrop" onClick={closeEditor} />
            <div className="documents-modal__panel">
              <div className="documents-modal__header">
                <div>
                  <span className="documents-eyebrow">Proposal Builder</span>
                  <h2>{form.title || "Proposal Draft"}</h2>
                  <p>Edit the proposal, then save or route it for approval.</p>
                </div>
                <button type="button" className="documents-modal__close" onClick={closeEditor} aria-label="Close proposal editor">
                  ×
                </button>
              </div>

              <div className="documents-modal__body">
                <section className="documents-modal__main">
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
                    <div className="documents-line-items">
                      <div className="documents-line-items__header">
                        <span>Product Name</span>
                        <span>Price</span>
                        <span>Quantity</span>
                        <span>GST %</span>
                        <span>HSN/SAC</span>
                        <span>Taxable Amount</span>
                        <span>CGST</span>
                        <span>SGST</span>
                        <span>IGST</span>
                        <span>Total</span>
                      </div>
                      {displayLineItems.map((item, index) => (
                        <div className="documents-line-items__row" key={`${item.productName || "item"}-${index}`}>
                          <span>{item.productName || "-"}</span>
                          <span>{formatCurrency(item.price)}</span>
                          <span>{Number(item.quantity || 0)}</span>
                          <span>{formatPercent(item.gstPercent)}</span>
                          <span>{item.hsnSac || "-"}</span>
                          <span>{formatCurrency(item.taxableAmount)}</span>
                          <span>{formatCurrency(item.cgst)}</span>
                          <span>{formatCurrency(item.sgst)}</span>
                          <span>{formatCurrency(item.igst)}</span>
                          <span>{formatCurrency(item.totalAmount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="documents-tax-summary">
                      <div><span>Subtotal</span><strong>{formatCurrency(subtotal || taxSummary?.taxableAmount || deal.amount || 0)}</strong></div>
                      <div><span>Total GST</span><strong>{formatCurrency(totalGst || taxSummary?.gstAmount || 0)}</strong></div>
                      <div><span>Grand Total</span><strong>{formatCurrency(grandTotal || taxSummary?.grandTotal || deal.amount || 0)}</strong></div>
                    </div>
                  </div>

                  <div className="documents-card">
                    <div className="documents-card__header">
                      <h2>Terms</h2>
                    </div>
                    <textarea rows="4" value={form.terms} onChange={(event) => updateField("terms", event.target.value)} />
                  </div>
                </section>

                <aside className="documents-modal__side">
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
                      <h2>GST Invoice Details</h2>
                    </div>
                    <div className="documents-info-list">
                      <div><span>Seller State</span><strong>{invoice.sellerState || "-"}</strong></div>
                      <div><span>Seller GSTIN</span><strong>{invoice.sellerGstin || "-"}</strong></div>
                      <div><span>Customer State</span><strong>{invoice.customerState || deal.customerId?.state || "-"}</strong></div>
                      <div><span>Customer GSTIN</span><strong>{invoice.customerGstin || deal.customerId?.gstin || "-"}</strong></div>
                      <div><span>Place of Supply</span><strong>{invoice.placeOfSupply || "-"}</strong></div>
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
                    {canManagerReview ? (
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
                        </div>
                      </div>
                    ) : null}
                    {isManager && draftStatus === "pending_approval" && !isNegotiateStage ? (
                      <div className="documents-message error">Proposal review is enabled only in Negotiate stage.</div>
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

                  <div className="documents-modal__footer">
                    <button type="button" className="documents-secondary-btn" onClick={closeEditor}>
                      Close
                    </button>
                    <button type="button" className="documents-primary-btn" onClick={handleSaveDraft} disabled={busyAction !== ""}>
                      {busyAction === "save" ? "Saving..." : "Save Proposal"}
                    </button>
                    <button type="button" className="documents-secondary-btn" onClick={handleSendForApproval} disabled={!canSendForApproval || busyAction !== ""}>
                      {busyAction === "approval" ? "Sending..." : "Send To Manager For Approval"}
                    </button>
                    <button type="button" className="documents-secondary-btn" onClick={handleSendToClient} disabled={!canSendToClient || busyAction !== ""}>
                      {busyAction === "client" ? "Sending..." : "Send To Client"}
                    </button>
                    {sendForApprovalBlockedReason ? (
                      <div className="documents-footer-hint">{sendForApprovalBlockedReason}</div>
                    ) : null}
                    {sendToClientBlockedReason ? (
                      <div className="documents-footer-hint">{sendToClientBlockedReason}</div>
                    ) : null}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DocumentsModule;
