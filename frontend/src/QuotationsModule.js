import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./QuotationsModule.css";

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "Rs.0";
  return `Rs.${numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getLineItemsTotal = (lineItems) => {
  if (!Array.isArray(lineItems) || !lineItems.length) return 0;
  return lineItems.reduce((sum, item) => sum + Number(item?.totalAmount || 0), 0);
};

const getDiscountSummary = ({ deal, taxSummary, lineItems, discountPercent }) => {
  const productRate = Number(deal?.product?.price || deal?.product?.cost || 0);
  const quantity = Number(deal?.quantity || 0);
  const computedProductTotal = productRate > 0 && quantity > 0 ? productRate * quantity : 0;
  const taxableFromTaxSummary = Number(taxSummary?.taxableAmount || 0);
  const gstFromTaxSummary = Number(taxSummary?.gstAmount || 0);
  const taxGrandTotal = Number(taxSummary?.grandTotal || 0);
  const lineItemsTotal = getLineItemsTotal(lineItems);
  const lineItemsTaxable =
    Array.isArray(lineItems) && lineItems.length
      ? lineItems.reduce((sum, item) => sum + Number(item?.taxableAmount || 0), 0)
      : 0;
  const dealAmount = Number(deal?.amount || 0);

  const taxableBase =
    taxableFromTaxSummary > 0
      ? taxableFromTaxSummary
      : lineItemsTaxable > 0
        ? lineItemsTaxable
        : lineItemsTotal > 0
          ? lineItemsTotal
          : dealAmount > 0
            ? dealAmount
            : computedProductTotal;

  const gstBase =
    gstFromTaxSummary > 0
      ? gstFromTaxSummary
      : taxGrandTotal > 0 && taxableFromTaxSummary > 0
        ? Math.max(0, taxGrandTotal - taxableFromTaxSummary)
        : 0;

  const inferredGstRate = taxableBase > 0 ? gstBase / taxableBase : 0;

  const grossBeforeDiscount = taxableBase + gstBase;

  const safeDiscountPercent = Math.min(100, Math.max(0, Number(discountPercent || 0)));
  const discountValue = roundMoney((taxableBase * safeDiscountPercent) / 100);
  const discountedTaxable = roundMoney(Math.max(0, taxableBase - discountValue));
  const discountedGst = roundMoney(discountedTaxable * inferredGstRate);
  const finalAfterDiscount = roundMoney(discountedTaxable + discountedGst);

  return {
    grossBeforeDiscount: roundMoney(grossBeforeDiscount),
    taxableBase: roundMoney(taxableBase),
    gstBase: roundMoney(gstBase),
    discountPercent: safeDiscountPercent,
    discountValue,
    discountedTaxable,
    discountedGst,
    finalAfterDiscount,
  };
};

function QuotationsModule() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem("token");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deals, setDeals] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [openQuotationDealId, setOpenQuotationDealId] = useState("");
  const [convertBusy, setConvertBusy] = useState(false);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [quotationError, setQuotationError] = useState("");
  const [quotationData, setQuotationData] = useState(null);

  const focusDealId = String(searchParams.get("dealId") || "").trim();

  const fetchQuotations = useCallback(async () => {
    if (!token) {
      setError("Please login to view quotations.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await axios.get("http://localhost:5000/api/deals", {
        headers: { Authorization: `Bearer ${token}` },
      });

      const allDeals = Array.isArray(res.data) ? res.data : [];
      const savedQuotations = allDeals
        .filter((deal) => Boolean(deal?.proposalDraft?.savedToQuotationAt))
        .sort(
          (a, b) =>
            new Date(b?.proposalDraft?.savedToQuotationAt || 0).getTime() -
            new Date(a?.proposalDraft?.savedToQuotationAt || 0).getTime()
        );

      setDeals(savedQuotations);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load quotations.");
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  const filteredDeals = useMemo(() => {
    const query = String(searchText || "").trim().toLowerCase();
    if (!query) return deals;

    return deals.filter((deal) => {
      const haystack = [
        deal?.name,
        deal?.company,
        deal?.contact,
        deal?.email,
        deal?.stage,
        deal?.assignedTo?.name,
        deal?.assignedTo?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [deals, searchText]);

  const summary = useMemo(() => {
    const total = deals.length;
    const finalAmount = deals.reduce((sum, deal) => {
      const totals = getDiscountSummary({
        deal,
        taxSummary: null,
        lineItems: [],
        discountPercent: deal?.proposalDraft?.discountPercent,
      });
      return sum + Number(totals.finalAfterDiscount || 0);
    }, 0);

    return {
      total,
      finalAmount,
    };
  }, [deals]);

  const openQuotationDetails = async (dealId) => {
    if (!dealId || !token) return;
    try {
      setOpenQuotationDealId(dealId);
      setQuotationLoading(true);
      setQuotationError("");
      setQuotationData(null);
      const res = await axios.get(`http://localhost:5000/api/deals/${dealId}/proposal-workspace`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setQuotationData(res.data || null);
    } catch (err) {
      setQuotationError(err.response?.data?.message || "Failed to load quotation details.");
    } finally {
      setQuotationLoading(false);
    }
  };

  const closeQuotationDetails = () => {
    setOpenQuotationDealId("");
    setConvertBusy(false);
    setQuotationLoading(false);
    setQuotationError("");
    setQuotationData(null);
  };

  const handleConvertToInvoice = async () => {
    const dealId = String(quotationDeal?._id || "").trim();
    if (!dealId || !token) return;

    try {
      setConvertBusy(true);
      const res = await axios.post(
        `http://localhost:5000/api/invoices/from-quotation/${dealId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const invoiceId = String(res?.data?.invoice?._id || "").trim();
      if (invoiceId) {
        navigate(`/invoices?invoiceId=${encodeURIComponent(invoiceId)}`);
      } else {
        navigate("/invoices");
      }
      closeQuotationDetails();
    } catch (err) {
      setQuotationError(err.response?.data?.message || "Failed to convert quotation to invoice.");
    } finally {
      setConvertBusy(false);
    }
  };

  useEffect(() => {
    if (!focusDealId || loading || !deals.length) return;
    const exists = deals.some((item) => String(item?._id || "") === focusDealId);
    if (exists) {
      openQuotationDetails(focusDealId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDealId, loading, deals]);

  const quotationDeal = quotationData?.deal || null;
  const quotationDraft = quotationDeal?.proposalDraft || {};
  const quotationTax = quotationData?.taxSummary || {};
  const quotationLineItems = Array.isArray(quotationData?.lineItems) ? quotationData.lineItems : [];
  const quotationTotals = getDiscountSummary({
    deal: quotationDeal,
    taxSummary: quotationTax,
    lineItems: quotationLineItems,
    discountPercent: quotationDraft?.discountPercent,
  });
  const lineItemsDiscountMultiplier = 1 - quotationTotals.discountPercent / 100;

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content quotations-page">
        <div className="quotations-hero">
          <div className="quotations-hero-copy">
            <span className="quotations-eyebrow">Sales Documents</span>
            <h1>Quotations</h1>
            <p>All deals where quotation was saved are listed here.</p>
          </div>
          <div className="quotations-hero-right">
            <div className="quotations-summary">
              <div className="quotations-summary-card">
                <span>Total</span>
                <strong>{summary.total}</strong>
              </div>
              <div className="quotations-summary-card">
                <span>Final Value</span>
                <strong>{formatCurrency(summary.finalAmount)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="quotations-toolbar">
          <input
            type="search"
            placeholder="Search by deal, company, contact, stage"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        {error ? <div className="quotations-message error">{error}</div> : null}

        {loading ? (
          <div className="quotations-message">Loading quotations...</div>
        ) : filteredDeals.length === 0 ? (
          <div className="quotations-message">No quotations available yet.</div>
        ) : (
          <div className="quotations-table-wrap">
            <table className="quotations-table">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Company</th>
                  <th>Stage</th>
                  <th>Amount (Subtotal)</th>
                  <th>Discount</th>
                  <th>Final</th>
                  <th>Saved At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((deal) => {
                  const dealId = String(deal?._id || "");
                  const totals = getDiscountSummary({
                    deal,
                    taxSummary: null,
                    lineItems: [],
                    discountPercent: deal?.proposalDraft?.discountPercent,
                  });
                  const isFocused = focusDealId && focusDealId === dealId;

                  return (
                    <tr key={dealId} className={isFocused ? "is-focused" : ""}>
                      <td>{deal?.name || "-"}</td>
                      <td>{deal?.company || "-"}</td>
                      <td>{String(deal?.stage || "-").replaceAll("_", " ")}</td>
                      <td>{formatCurrency(totals.taxableBase)}</td>
                      <td>{`${totals.discountPercent.toFixed(2)}%`}</td>
                      <td>{formatCurrency(totals.finalAfterDiscount)}</td>
                      <td>{formatDateTime(deal?.proposalDraft?.savedToQuotationAt)}</td>
                      <td>
                        <button
                          type="button"
                          className="quotations-open-btn"
                          onClick={() => openQuotationDetails(dealId)}
                        >
                          Open Quotation
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {openQuotationDealId ? (
          <div className="quotations-dialog" role="dialog" aria-modal="true" aria-label="Quotation details">
            <div className="quotations-dialog-backdrop" onClick={closeQuotationDetails} />
            <div className="quotations-dialog-panel">
              <div className="quotations-dialog-header">
                <div>
                  <h2>Quotation Details</h2>
                  <p>Complete quotation information for this deal.</p>
                </div>
                <button type="button" className="quotations-dialog-close" onClick={closeQuotationDetails}>
                  ×
                </button>
              </div>

              {quotationLoading ? <div className="quotations-message">Loading quotation details...</div> : null}
              {quotationError ? <div className="quotations-message error">{quotationError}</div> : null}

              {!quotationLoading && !quotationError && quotationDeal ? (
                <>
                  <div className="quotations-dialog-grid">
                    <label><span>Deal</span><input type="text" value={quotationDeal?.name || "-"} readOnly /></label>
                    <label><span>Company</span><input type="text" value={quotationDeal?.company || "-"} readOnly /></label>
                    <label><span>Contact</span><input type="text" value={quotationDeal?.contact || "-"} readOnly /></label>
                    <label><span>Email</span><input type="text" value={quotationDeal?.email || "-"} readOnly /></label>
                    <label><span>Product</span><input type="text" value={quotationDeal?.product?.name || "-"} readOnly /></label>
                    <label><span>Quantity</span><input type="text" value={quotationDeal?.quantity ?? "-"} readOnly /></label>
                    <label><span>Stage</span><input type="text" value={String(quotationDeal?.stage || "-").replaceAll("_", " ")} readOnly /></label>
                    <label><span>Saved At</span><input type="text" value={formatDateTime(quotationDraft?.savedToQuotationAt)} readOnly /></label>
                    <label><span>Subtotal (Before Discount)</span><input type="text" value={formatCurrency(quotationTotals.taxableBase)} readOnly /></label>
                    <label><span>Discount (%)</span><input type="text" value={`${quotationTotals.discountPercent.toFixed(2)}%`} readOnly /></label>
                    <label><span>Taxable Amount (Before Discount)</span><input type="text" value={formatCurrency(quotationTotals.taxableBase)} readOnly /></label>
                    <label><span>GST Amount</span><input type="text" value={formatCurrency(quotationTotals.discountedGst)} readOnly /></label>
                    <label><span>Discount Value</span><input type="text" value={formatCurrency(quotationTotals.discountValue)} readOnly /></label>
                    <label><span>Grand Total</span><input type="text" value={formatCurrency(quotationTotals.finalAfterDiscount)} readOnly /></label>
                    <label className="full-width"><span>Pricing Notes</span><textarea rows={3} value={quotationDraft?.pricingNotes || "-"} readOnly /></label>
                    <label className="full-width"><span>Terms</span><textarea rows={3} value={quotationDraft?.terms || "-"} readOnly /></label>
                  </div>

                  {quotationLineItems.length ? (
                    <div className="quotations-line-items-wrap">
                      <h3>Line Items</h3>
                      <table className="quotations-line-items-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Qty</th>
                            <th>Price</th>
                            <th>GST %</th>
                            <th>Taxable</th>
                            <th>Total (Net)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quotationLineItems.map((item, idx) => {
                            const netLineTotal = roundMoney(Number(item?.totalAmount || 0) * lineItemsDiscountMultiplier);
                            return (
                              <tr key={`${item?.productName || "item"}-${idx}`}>
                                <td>{item?.productName || "-"}</td>
                                <td>{Number(item?.quantity || 0)}</td>
                                <td>{formatCurrency(item?.price || 0)}</td>
                                <td>{Number(item?.gstPercent || 0).toFixed(2)}%</td>
                                <td>{formatCurrency(item?.taxableAmount || 0)}</td>
                                <td>{formatCurrency(netLineTotal)}</td>
                              </tr>
                            );
                          })}
                          <tr className="quotations-line-total-row">
                            <td colSpan={5}>Grand Total</td>
                            <td>{formatCurrency(quotationTotals.finalAfterDiscount)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <div className="quotations-dialog-actions">
                    <button type="button" className="quotations-btn secondary" onClick={closeQuotationDetails}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="quotations-btn"
                      onClick={handleConvertToInvoice}
                      disabled={convertBusy}
                    >
                      {convertBusy ? "Converting..." : "Convert To Invoice"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default QuotationsModule;
