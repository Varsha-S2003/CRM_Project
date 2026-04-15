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

const formatStageLabel = (value) => String(value || "-").replaceAll("_", " ");

const parseNeedAnalysisBillingCycle = (text) => {
  const content = String(text || "");
  const match = content.match(/Billing\s*Cycle:\s*([^,\n]+)/i);
  const raw = String(match?.[1] || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "6 months" || raw === "6_months") return "6_months";
  if (["monthly", "quarterly", "yearly"].includes(raw)) return raw;
  return "";
};

const parseNeedAnalysisUsersOrSeats = (text) => {
  const content = String(text || "");
  const match = content.match(/Users\s*\/\s*Seats:\s*(\d+)/i);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  const source = String(searchParams.get("source") || "").trim().toLowerCase();
  const isManager = role === "MANAGER";
  const isEmployee = role === "EMPLOYEE";
  const dealId = String(searchParams.get("dealId") || "").trim();
  const proposalOnlyMode = Boolean(dealId) && (source === "requests" || searchParams.get("proposalOnly") === "1");

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
  const [historyLoading, setHistoryLoading] = useState(!dealId);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [form, setForm] = useState(fallbackDraft);
  const [historyItems, setHistoryItems] = useState([]);
  const [proposalCalc, setProposalCalc] = useState({ usersOrSeats: "", billingCycle: "" });
  const [selectedHistoryId, setSelectedHistoryId] = useState("");
  const [selectedHistoryWorkspace, setSelectedHistoryWorkspace] = useState(null);
  const [selectedHistoryLoading, setSelectedHistoryLoading] = useState(false);

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
      setProposalCalc((prev) => ({
        usersOrSeats: String(
          payload?.deal?.usersOrSeats ??
            parseNeedAnalysisUsersOrSeats(payload?.deal?.description) ??
            prev.usersOrSeats ??
            ""
        ).trim(),
        billingCycle:
          String(
            payload?.deal?.billingCycle ||
              parseNeedAnalysisBillingCycle(payload?.deal?.description) ||
              prev.billingCycle ||
              payload?.deal?.product?.billingCycle ||
              "monthly"
          ).trim(),
      }));
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
    if (!token || dealId) {
      setHistoryLoading(false);
      return;
    }

    const fetchHistory = async () => {
      try {
        setHistoryLoading(true);
        setError("");
        const res = await axios.get("http://localhost:5000/api/deals/proposal-history", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setHistoryItems(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load client history.");
        setHistoryItems([]);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();
  }, [dealId, token]);

  useEffect(() => {
    if (dealId) return;

    if (!historyItems.length) {
      setSelectedHistoryId("");
      setSelectedHistoryWorkspace(null);
      return;
    }

    const exists = historyItems.some((item) => String(item?._id || "") === String(selectedHistoryId || ""));
    if (!selectedHistoryId || !exists) {
      setSelectedHistoryId(String(historyItems[0]?._id || ""));
    }
  }, [dealId, historyItems, selectedHistoryId]);

  useEffect(() => {
    if (!token || dealId || !selectedHistoryId) {
      setSelectedHistoryWorkspace(null);
      setSelectedHistoryLoading(false);
      return;
    }

    const fetchSelectedHistoryWorkspace = async () => {
      try {
        setSelectedHistoryLoading(true);
        const res = await axios.get(`http://localhost:5000/api/deals/${selectedHistoryId}/proposal-workspace`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSelectedHistoryWorkspace(res.data || null);
      } catch (_err) {
        setSelectedHistoryWorkspace(null);
      } finally {
        setSelectedHistoryLoading(false);
      }
    };

    fetchSelectedHistoryWorkspace();
  }, [dealId, selectedHistoryId, token]);

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
  const primaryLineItem = displayLineItems[0] || null;
  const resolvedProductName =
    (typeof deal?.product === "object" ? deal?.product?.name : "") ||
    searchParams.get("product") ||
    "-";
  const resolvedQuantity = Number(primaryLineItem?.quantity || deal.quantity || 0) || 0;
  const normalizedProductType = String(deal?.product?.type || "").trim().toLowerCase();
  const isServicePricing = normalizedProductType === "service";
  const resolvedUnitPrice = Number(
    (isServicePricing ? deal?.product?.cost : deal?.product?.price) ??
    primaryLineItem?.price ??
    deal?.product?.cost ??
    deal?.product?.price ??
    0
  ) || 0;
  const fetchedGstPercentRaw =
    deal?.product?.gst_percent ??
    deal?.gstPercent ??
    primaryLineItem?.gstPercent ??
    taxSummary?.gstPercent ??
    (String(deal?.product?.type || "").trim().toLowerCase() === "service" ? 18 : 0);
  const resolvedGstPercent = Number(fetchedGstPercentRaw || 0);
  const billingCycleKey = String(
    proposalCalc.billingCycle || deal?.billingCycle || deal?.product?.billingCycle || "monthly"
  )
    .trim()
    .toLowerCase();
  const durationMonths = {
    monthly: 1,
    quarterly: 3,
    "6_months": 6,
    yearly: 12,
  }[billingCycleKey] || 1;
  const usersOrSeats = Number(proposalCalc.usersOrSeats);
  const resolvedUsersOrSeats = Number.isFinite(usersOrSeats) && usersOrSeats > 0 ? usersOrSeats : 1;
  const baseAmountFromDeal = Number(deal.amount || 0);
  const amountFromProduct = resolvedUnitPrice > 0 && resolvedQuantity > 0
    ? Number((resolvedUnitPrice * resolvedQuantity).toFixed(2))
    : 0;
  const amountFromServiceFormula = isServicePricing && resolvedUnitPrice > 0
    ? Number((resolvedUnitPrice * resolvedUsersOrSeats * durationMonths).toFixed(2))
    : 0;
  const fallbackTaxableAmount = Number(primaryLineItem?.taxableAmount || taxSummary?.taxableAmount || 0);
  const resolvedTaxableAmount = isServicePricing
    ? (amountFromServiceFormula > 0 ? amountFromServiceFormula : fallbackTaxableAmount)
    : (amountFromProduct > 0 ? amountFromProduct : (baseAmountFromDeal > 0 ? baseAmountFromDeal : fallbackTaxableAmount));
  const resolvedGstAmount = Number(((resolvedTaxableAmount * resolvedGstPercent) / 100).toFixed(2));
  const resolvedGrandTotal = Number((resolvedTaxableAmount + resolvedGstAmount).toFixed(2));
  const calculatedDealValue = resolvedGrandTotal;
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
  const history = dealId ? workspace?.history || [] : historyItems;
  const selectedHistoryDeal = selectedHistoryWorkspace?.deal || null;
  const selectedHistoryDraft = selectedHistoryDeal?.proposalDraft || null;
  const selectedHistoryProduct = selectedHistoryDeal?.product?.name || "-";
  const selectedHistoryCustomer = selectedHistoryDeal?.customerId || {};
  const selectedHistoryTax = selectedHistoryWorkspace?.taxSummary || null;
  const selectedHistoryInvoice = selectedHistoryWorkspace?.invoice || {};
  const selectedHistoryLineItems = Array.isArray(selectedHistoryWorkspace?.lineItems)
    ? selectedHistoryWorkspace.lineItems
    : [];
  const notifications = workspace?.notifications || [];
  const timeline = Array.isArray(deal.timeline) ? [...deal.timeline].reverse() : [];
  const heroStatus = dealId ? draftStatus : String(selectedHistoryDraft?.status || "draft");
  const canOpenEditor = Boolean(dealId);
  const heroTitle = dealId ? form.title || "Proposal Draft" : "Proposal Workspace";
  const heroDescription = dealId
    ? "Create and manage the selected proposal."
    : "Select a proposal card to view full details.";
  const heroMeta = [
      {
        label: "Deal",
        value: dealId
          ? deal.name || searchParams.get("dealName") || "-"
          : selectedHistoryDeal?.name || "-",
      },
      {
        label: "Company",
        value: dealId
          ? deal.company || searchParams.get("company") || "-"
          : selectedHistoryDeal?.company || "-",
      },
      {
        label: "Status",
        value: dealId
          ? getStatusLabel(draftStatus)
          : getStatusLabel(selectedHistoryDraft?.status || "draft"),
      },
    ];

  const openEditor = () => setShowEditor(true);
  const closeEditor = () => setShowEditor(false);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content documents-page">
        {proposalOnlyMode ? (
          <div className="documents-proposal-only">
            <div className="documents-card documents-proposal-only__card">
              <div className="documents-card__header documents-proposal-only__header">
                <div>
                  <span className="documents-eyebrow">Create Proposal</span>
                  <h2>{form.title || "Proposal Draft"}</h2>
                  <p>Fill only required proposal details and submit.</p>
                </div>
                <div className={`documents-status-pill ${draftStatus}`}>{getStatusLabel(draftStatus)}</div>
              </div>

              {error ? <div className="documents-message error">{error}</div> : null}
              {message ? <div className={`documents-message ${/failed|required/i.test(message) ? "error" : "success"}`}>{message}</div> : null}

              {loading ? (
                <div className="documents-empty">Loading proposal form...</div>
              ) : (
                <>
                  <div className="documents-proposal-only__meta">
                    <div><span>Deal</span><strong>{deal.name || searchParams.get("dealName") || "-"}</strong></div>
                    <div><span>Company</span><strong>{deal.company || searchParams.get("company") || "-"}</strong></div>
                    <div><span>Contact</span><strong>{deal.contact || searchParams.get("contact") || "-"}</strong></div>
                    <div><span>Product / Service</span><strong>{resolvedProductName}</strong></div>
                  </div>

                  <div className="documents-card">
                    <div className="documents-card__header">
                      <h2>Auto Pricing</h2>
                      <p>Base Price x Users x Duration + GST.</p>
                    </div>
                    {isServicePricing ? (
                      <div className="documents-proposal-only__controls">
                        <label>
                          Billing Cycle
                          <select
                            value={proposalCalc.billingCycle}
                            onChange={() => {}}
                            disabled
                          >
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="6_months">6 Months</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </label>
                        <label>
                          Users / Seats
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={proposalCalc.usersOrSeats}
                            onChange={() => {}}
                            readOnly
                            disabled
                            placeholder="Enter users/seats"
                          />
                        </label>
                      </div>
                    ) : null}
                    <div className="documents-proposal-only__calc-grid">
                      <div><span>Product / Service</span><strong>{resolvedProductName}</strong></div>
                      <div><span>Base Price</span><strong>{formatCurrency(resolvedUnitPrice)}</strong></div>
                      <div><span>Deal Value</span><strong>{formatCurrency(calculatedDealValue)}</strong></div>
                      <div><span>{isServicePricing ? "Users / Seats" : "Quantity"}</span><strong>{isServicePricing ? resolvedUsersOrSeats : (resolvedQuantity || "-")}</strong></div>
                      <div><span>Duration</span><strong>{durationMonths} month(s)</strong></div>
                      <div><span>GST %</span><strong>{formatPercent(resolvedGstPercent)}</strong></div>
                      <div><span>Taxable Amount</span><strong>{formatCurrency(resolvedTaxableAmount)}</strong></div>
                      <div><span>Total GST</span><strong>{formatCurrency(resolvedGstAmount)}</strong></div>
                      <div><span>Grand Total</span><strong>{formatCurrency(resolvedGrandTotal)}</strong></div>
                    </div>
                  </div>

                  <div className="documents-proposal-only__form">
                    <div className="documents-card">
                      <div className="documents-card__header">
                        <h2>Title</h2>
                      </div>
                      <input
                        type="text"
                        value={form.title}
                        onChange={(event) => updateField("title", event.target.value)}
                        placeholder="Proposal title"
                      />
                    </div>

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
                      <textarea rows="3" value={form.problem} onChange={(event) => updateField("problem", event.target.value)} />
                    </div>

                    <div className="documents-card">
                      <div className="documents-card__header">
                        <h2>Solution</h2>
                      </div>
                      <textarea rows="3" value={form.solution} onChange={(event) => updateField("solution", event.target.value)} />
                    </div>

                    <div className="documents-card">
                      <div className="documents-card__header">
                        <h2>Scope</h2>
                      </div>
                      <textarea rows="3" value={form.scope} onChange={(event) => updateField("scope", event.target.value)} />
                    </div>

                    <div className="documents-card">
                      <div className="documents-card__header">
                        <h2>Pricing Notes</h2>
                      </div>
                      <textarea rows="3" value={form.pricingNotes} onChange={(event) => updateField("pricingNotes", event.target.value)} />
                    </div>

                    <div className="documents-card">
                      <div className="documents-card__header">
                        <h2>Terms</h2>
                      </div>
                      <textarea rows="3" value={form.terms} onChange={(event) => updateField("terms", event.target.value)} />
                    </div>
                  </div>

                  <div className="documents-actions documents-proposal-only__actions">
                    <button type="button" className="documents-primary-btn" onClick={handleSaveDraft} disabled={busyAction !== ""}>
                      {busyAction === "save" ? "Saving..." : "Save Proposal"}
                    </button>
                    <button type="button" className="documents-secondary-btn" onClick={handleSendForApproval} disabled={!canSendForApproval || busyAction !== ""}>
                      {busyAction === "approval" ? "Sending..." : "Send To Manager"}
                    </button>
                    <button type="button" className="documents-secondary-btn" onClick={handleSendToClient} disabled={!canSendToClient || busyAction !== ""}>
                      {busyAction === "client" ? "Sending..." : "Send To Client"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
        <>
        <div className="documents-hero">
          <div className="documents-hero__copy">
            <span className="documents-eyebrow">Documents Workspace</span>
            <h1>{heroTitle}</h1>
            <p>{heroDescription}</p>
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
            <div className={`documents-status-pill ${heroStatus}`}>{getStatusLabel(heroStatus)}</div>
            <button
              type="button"
              className="documents-primary-btn documents-primary-btn--hero"
              onClick={openEditor}
              disabled={!canOpenEditor || busyAction !== ""}
            >
              {!canOpenEditor ? "Read Only" : busyAction === "save" ? "Saving..." : "Create Proposal"}
            </button>
          </div>
        </div>

        {error ? <div className="documents-message error">{error}</div> : null}
        {message ? <div className={`documents-message ${/failed|required/i.test(message) ? "error" : "success"}`}>{message}</div> : null}

        {(dealId ? loading : historyLoading) ? (
          <div className="documents-card">{dealId ? "Loading document workspace..." : "Loading client history..."}</div>
        ) : (
          <div className="documents-empty-page">
            <div className="documents-card documents-history-card">
              <div className="documents-card__header documents-card__header--row">
                <div>
                  <h2>History</h2>
                  <p>Only created proposal history is shown here.</p>
                </div>
              </div>
              <div className="documents-stack-list">
                {history.length ? history.map((item) => (
                  <button
                    type="button"
                    className={`documents-stack-item documents-stack-item--clickable ${String(item._id) === String(selectedHistoryId) ? "active" : ""}`}
                    key={item._id}
                    onClick={() => !dealId && setSelectedHistoryId(String(item._id || ""))}
                    disabled={Boolean(dealId)}
                  >
                    <strong>{item.name || "Deal"}</strong>
                    <p>{item.company || "-"} • {formatStageLabel(item.stage)}</p>
                    <span>{formatDateTime(item.updatedAt || item.createdAt)}</span>
                  </button>
                )) : <div className="documents-empty">No previous customer history found.</div>}
              </div>

              {!dealId && history.length ? (
                <div className="documents-history-details">
                  <div className="documents-card__header">
                    <h2>Proposal Details</h2>
                    <p>Full details for the selected proposal.</p>
                  </div>

                  {selectedHistoryLoading ? (
                    <div className="documents-empty">Loading selected proposal details...</div>
                  ) : selectedHistoryDeal ? (
                    <>
                      <div className="documents-info-list documents-history-details__grid">
                        <div><span>Deal</span><strong>{selectedHistoryDeal.name || "-"}</strong></div>
                        <div><span>Company</span><strong>{selectedHistoryDeal.company || "-"}</strong></div>
                        <div><span>Contact</span><strong>{selectedHistoryDeal.contact || "-"}</strong></div>
                        <div><span>Email</span><strong>{selectedHistoryDeal.email || selectedHistoryCustomer.email || "-"}</strong></div>
                        <div><span>Product</span><strong>{selectedHistoryProduct}</strong></div>
                        <div><span>Stage</span><strong>{formatStageLabel(selectedHistoryDeal.stage)}</strong></div>
                        <div><span>Amount</span><strong>{formatCurrency(selectedHistoryDeal.amount || 0)}</strong></div>
                        <div><span>Proposal Status</span><strong>{getStatusLabel(selectedHistoryDraft?.status || "draft")}</strong></div>
                        <div><span>Approval Requested</span><strong>{formatDateTime(selectedHistoryDraft?.approvalRequestedAt)}</strong></div>
                        <div><span>Approval Responded</span><strong>{formatDateTime(selectedHistoryDraft?.approvalRespondedAt)}</strong></div>
                        <div><span>Sent To Client</span><strong>{formatDateTime(selectedHistoryDraft?.clientSentAt)}</strong></div>
                        <div><span>Last Updated</span><strong>{formatDateTime(selectedHistoryDeal.updatedAt || selectedHistoryDeal.createdAt)}</strong></div>
                      </div>

                      <div className="documents-info-list documents-history-details__sections">
                        <div><span>Title</span><strong>{selectedHistoryDraft?.title || "-"}</strong></div>
                        <div><span>Introduction</span><strong>{selectedHistoryDraft?.introduction || "-"}</strong></div>
                        <div><span>Problem</span><strong>{selectedHistoryDraft?.problem || "-"}</strong></div>
                        <div><span>Solution</span><strong>{selectedHistoryDraft?.solution || "-"}</strong></div>
                        <div><span>Scope</span><strong>{selectedHistoryDraft?.scope || "-"}</strong></div>
                        <div><span>Pricing Notes</span><strong>{selectedHistoryDraft?.pricingNotes || "-"}</strong></div>
                        <div><span>Terms</span><strong>{selectedHistoryDraft?.terms || "-"}</strong></div>
                      </div>

                      {(selectedHistoryTax || selectedHistoryLineItems.length) ? (
                        <div className="documents-info-list documents-history-details__grid">
                          <div><span>GST %</span><strong>{formatPercent(selectedHistoryTax?.gstPercent || 0)}</strong></div>
                          <div><span>Taxable Amount</span><strong>{formatCurrency(selectedHistoryTax?.taxableAmount || 0)}</strong></div>
                          <div><span>GST Amount</span><strong>{formatCurrency(selectedHistoryTax?.gstAmount || 0)}</strong></div>
                          <div><span>Grand Total</span><strong>{formatCurrency(selectedHistoryTax?.grandTotal || selectedHistoryDeal.amount || 0)}</strong></div>
                          <div><span>Seller State</span><strong>{selectedHistoryInvoice?.sellerState || "-"}</strong></div>
                          <div><span>Customer State</span><strong>{selectedHistoryInvoice?.customerState || "-"}</strong></div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="documents-empty">Unable to load selected proposal details.</div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {showEditor && !proposalOnlyMode ? (
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
        </>
        )}
      </div>
    </div>
  );
}

export default DocumentsModule;
