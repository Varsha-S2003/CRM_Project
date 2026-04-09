import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./InvoicesModule.css";

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "Rs.0";
  return `Rs.${numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getLineTaxableBeforeDiscount = (item) => {
  const explicit = Number(item?.taxableAmount || 0);
  if (explicit > 0) return explicit;
  const qty = Number(item?.quantity || 0);
  const unit = Number(item?.unitPrice || 0);
  return roundMoney(qty * unit);
};

const getInvoiceComputedTotals = (invoice, options = {}) => {
  const lineItems = Array.isArray(options.lineItems) && options.lineItems.length
    ? options.lineItems
    : Array.isArray(invoice?.lineItems)
      ? invoice.lineItems
      : [];
  const discountPercent = Math.min(100, Math.max(0, Number(invoice?.discountPercent || 0)));

  const derivedSubtotal = roundMoney(
    lineItems.reduce((sum, item) => sum + getLineTaxableBeforeDiscount(item), 0)
  );
  const subtotalBeforeDiscount =
    Number.isFinite(Number(options.subtotalBeforeDiscount)) && Number(options.subtotalBeforeDiscount) > 0
      ? roundMoney(Number(options.subtotalBeforeDiscount))
      : derivedSubtotal;

  const discountValue = roundMoney((subtotalBeforeDiscount * discountPercent) / 100);
  const taxableAfterDiscount = roundMoney(Math.max(0, subtotalBeforeDiscount - discountValue));

  const gstAfterDiscount = Number.isFinite(Number(options.gstRate))
    ? roundMoney(taxableAfterDiscount * Number(options.gstRate))
    : roundMoney(
        lineItems.reduce((sum, item) => {
          const lineTaxable = getLineTaxableBeforeDiscount(item);
          const weight = subtotalBeforeDiscount > 0 ? lineTaxable / subtotalBeforeDiscount : 0;
          const lineDiscount = discountValue * weight;
          const lineTaxableAfter = Math.max(0, lineTaxable - lineDiscount);
          const lineGstPercent = Math.max(0, Number(item?.gstPercent || 0));
          return sum + (lineTaxableAfter * lineGstPercent) / 100;
        }, 0)
      );

  const totalAfterDiscount = roundMoney(taxableAfterDiscount + gstAfterDiscount);

  return {
    lineItems,
    subtotalBeforeDiscount,
    discountPercent,
    discountValue,
    gstAfterDiscount,
    totalAfterDiscount,
  };
};

function InvoicesModule() {
  const token = localStorage.getItem("token");
  const [searchParams] = useSearchParams();
  const targetInvoiceId = String(searchParams.get("invoiceId") || "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [openInvoiceId, setOpenInvoiceId] = useState("");
  const [openInvoiceQuoteContext, setOpenInvoiceQuoteContext] = useState(null);
  const [invoiceActionBusy, setInvoiceActionBusy] = useState("");

  const fetchInvoices = useCallback(async () => {
    if (!token) {
      setError("Please login to view invoices.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const res = await axios.get("http://localhost:5000/api/invoices", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const items = Array.isArray(res.data) ? res.data : [];
      setInvoices(items);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load invoices.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (!targetInvoiceId || loading) return;
    const exists = invoices.some((invoice) => String(invoice?._id || "") === targetInvoiceId);
    if (exists) {
      setOpenInvoiceId(targetInvoiceId);
    }
  }, [targetInvoiceId, loading, invoices]);

  useEffect(() => {
    const loadQuoteContext = async () => {
      if (!openInvoiceId || !token) {
        setOpenInvoiceQuoteContext(null);
        return;
      }

      const invoice = invoices.find((item) => String(item?._id || "") === openInvoiceId);
      const dealId = String(invoice?.dealId?._id || invoice?.dealId || "").trim();
      if (!dealId) {
        setOpenInvoiceQuoteContext(null);
        return;
      }

      try {
        const res = await axios.get(`http://localhost:5000/api/deals/${dealId}/proposal-workspace`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setOpenInvoiceQuoteContext(res.data || null);
      } catch (_err) {
        setOpenInvoiceQuoteContext(null);
      }
    };

    loadQuoteContext();
  }, [openInvoiceId, token, invoices]);

  const filtered = useMemo(() => {
    const query = String(searchText || "").trim().toLowerCase();
    if (!query) return invoices;

    return invoices.filter((invoice) => {
      const haystack = [
        invoice?.invoiceNumber,
        invoice?.company,
        invoice?.customerName,
        invoice?.email,
        invoice?.status,
        invoice?.dealId?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [invoices, searchText]);

  const summary = useMemo(() => {
    const total = invoices.length;
    const draft = invoices.filter((invoice) => String(invoice?.status || "").toLowerCase() === "draft").length;
    const totalValue = invoices.reduce((sum, invoice) => sum + Number(invoice?.totalAmount || 0), 0);
    return { total, draft, totalValue };
  }, [invoices]);

  const openInvoice = filtered.find((item) => String(item?._id || "") === String(openInvoiceId || "")) || null;
  const quoteLineItems = Array.isArray(openInvoiceQuoteContext?.lineItems)
    ? openInvoiceQuoteContext.lineItems.map((item) => ({
        product: item?.productName,
        quantity: item?.quantity,
        unitPrice: item?.price,
        gstPercent: item?.gstPercent,
        taxableAmount: item?.taxableAmount,
        totalAmount: item?.totalAmount,
      }))
    : [];
  const quoteTaxable = Number(openInvoiceQuoteContext?.taxSummary?.taxableAmount || 0);
  const quoteGst = Number(openInvoiceQuoteContext?.taxSummary?.gstAmount || 0);
  const quoteGstRate = quoteTaxable > 0 ? quoteGst / quoteTaxable : undefined;
  const openInvoiceTotals = openInvoice
    ? getInvoiceComputedTotals(openInvoice, {
        lineItems: quoteLineItems.length ? quoteLineItems : undefined,
        subtotalBeforeDiscount: quoteTaxable > 0 ? quoteTaxable : undefined,
        gstRate: quoteGstRate,
      })
    : null;

  const handleDownloadPdf = async () => {
    const invoiceId = String(openInvoice?._id || "").trim();
    if (!invoiceId || !token) return;

    try {
      setInvoiceActionBusy("download");
      const res = await axios.get(`http://localhost:5000/api/invoices/${invoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "blob",
      });

      const contentType = res.headers["content-type"] || "application/pdf";
      const blob = new Blob([res.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${openInvoice?.invoiceNumber || "invoice"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setError("");
    } catch (err) {
      const responseData = err?.response?.data;
      if (responseData instanceof Blob) {
        try {
          const payloadText = await responseData.text();
          const payload = JSON.parse(payloadText);
          setError(payload?.message || "Failed to download invoice PDF.");
        } catch (_parseErr) {
          setError("Failed to download invoice PDF.");
        }
      } else {
        setError(err.response?.data?.message || err.message || "Failed to download invoice PDF.");
      }
    } finally {
      setInvoiceActionBusy("");
    }
  };

  const handleSendToClient = async () => {
    const invoiceId = String(openInvoice?._id || "").trim();
    if (!invoiceId || !token) return;

    try {
      setInvoiceActionBusy("send");
      const res = await axios.post(
        `http://localhost:5000/api/invoices/${invoiceId}/send-client`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchInvoices();
      setError("");
      if (res?.data?.preview) {
        console.log("Invoice email preview:", res.data.preview);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send invoice to client.");
    } finally {
      setInvoiceActionBusy("");
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content invoices-page">
        <div className="invoices-header">
          <div className="invoices-header-copy">
            <span className="invoices-eyebrow">Billing</span>
            <h1>Invoices</h1>
            <p>Converted invoices from quotations are listed here.</p>
          </div>
          <div className="invoices-summary">
            <div className="invoices-summary-card">
              <span>Total</span>
              <strong>{summary.total}</strong>
            </div>
            <div className="invoices-summary-card">
              <span>Draft</span>
              <strong>{summary.draft}</strong>
            </div>
            <div className="invoices-summary-card">
              <span>Total Value</span>
              <strong>{formatCurrency(summary.totalValue)}</strong>
            </div>
          </div>
        </div>

        <div className="invoices-toolbar">
          <input
            type="search"
            placeholder="Search by invoice number, customer, company, deal"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        {error ? <div className="invoices-message error">{error}</div> : null}

        {loading ? (
          <div className="invoices-message">Loading invoices...</div>
        ) : filtered.length === 0 ? (
          <div className="invoices-message">No invoices available yet.</div>
        ) : (
          <div className="invoices-table-wrap">
            <table className="invoices-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Deal</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Issue Date</th>
                  <th>Due Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => {
                  const id = String(invoice?._id || "");
                  return (
                    <tr key={id} className={targetInvoiceId === id ? "is-focused" : ""}>
                      <td>{invoice?.invoiceNumber || "-"}</td>
                      <td>{invoice?.dealId?.name || "-"}</td>
                      <td>{invoice?.customerName || invoice?.company || "-"}</td>
                      <td>
                        <span className={`invoice-status-pill ${String(invoice?.status || "Draft").toLowerCase()}`}>
                          {invoice?.status || "Draft"}
                        </span>
                      </td>
                      <td>{formatCurrency(invoice?.totalAmount || 0)}</td>
                      <td>{formatDateTime(invoice?.issueDate)}</td>
                      <td>{formatDateTime(invoice?.dueDate)}</td>
                      <td>
                        <button
                          type="button"
                          className="invoices-open-btn"
                          onClick={() => setOpenInvoiceId(id)}
                        >
                          Open Invoice
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {openInvoice ? (
          <div className="invoices-dialog" role="dialog" aria-modal="true" aria-label="Invoice details">
            <div className="invoices-dialog-backdrop" onClick={() => setOpenInvoiceId("")} />
            <div className="invoices-dialog-panel">
              <div className="invoices-dialog-header">
                <div>
                  <h2>Invoice Details</h2>
                  <p>{openInvoice?.invoiceNumber || "Invoice"}</p>
                </div>
                <button type="button" className="invoices-dialog-close" onClick={() => setOpenInvoiceId("")}>
                  ×
                </button>
              </div>

              <div className="invoices-grid">
                <label><span>Invoice Number</span><input type="text" value={openInvoice?.invoiceNumber || "-"} readOnly /></label>
                <label><span>Deal</span><input type="text" value={openInvoice?.dealId?.name || "-"} readOnly /></label>
                <label><span>Customer</span><input type="text" value={openInvoice?.customerName || "-"} readOnly /></label>
                <label><span>Company</span><input type="text" value={openInvoice?.company || "-"} readOnly /></label>
                <label><span>Email</span><input type="text" value={openInvoice?.email || "-"} readOnly /></label>
                <label><span>Phone</span><input type="text" value={openInvoice?.phone || "-"} readOnly /></label>
                <label><span>Status</span><input type="text" value={openInvoice?.status || "Draft"} readOnly /></label>
                <label><span>Issue Date</span><input type="text" value={formatDateTime(openInvoice?.issueDate)} readOnly /></label>
                <label><span>Due Date</span><input type="text" value={formatDateTime(openInvoice?.dueDate)} readOnly /></label>
                <label><span>Subtotal (Before Discount)</span><input type="text" value={formatCurrency(openInvoiceTotals?.subtotalBeforeDiscount || 0)} readOnly /></label>
                <label><span>Discount (%)</span><input type="text" value={`${Number(openInvoiceTotals?.discountPercent || 0).toFixed(2)}%`} readOnly /></label>
                <label><span>Discount Value</span><input type="text" value={formatCurrency(openInvoiceTotals?.discountValue || 0)} readOnly /></label>
                <label><span>GST Amount</span><input type="text" value={formatCurrency(openInvoiceTotals?.gstAfterDiscount || 0)} readOnly /></label>
                <label><span>Total</span><input type="text" value={formatCurrency(openInvoiceTotals?.totalAfterDiscount || 0)} readOnly /></label>
                <label className="full-width"><span>Notes</span><textarea rows={3} value={openInvoice?.notes || "-"} readOnly /></label>
                <label className="full-width"><span>Terms</span><textarea rows={3} value={openInvoice?.terms || "-"} readOnly /></label>
              </div>

              {Array.isArray(openInvoiceTotals?.lineItems) && openInvoiceTotals.lineItems.length ? (
                <div className="invoices-lineitems-wrap">
                  <h3>Line Items</h3>
                  <table className="invoices-lineitems-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>GST %</th>
                        <th>Taxable (Before Discount)</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openInvoiceTotals.lineItems.map((item, idx) => {
                        const lineTaxableBefore = getLineTaxableBeforeDiscount(item);
                        const weight = openInvoiceTotals.subtotalBeforeDiscount > 0
                          ? lineTaxableBefore / openInvoiceTotals.subtotalBeforeDiscount
                          : 0;
                        const lineDiscount = openInvoiceTotals.discountValue * weight;
                        const lineTaxableAfter = Math.max(0, lineTaxableBefore - lineDiscount);
                        const lineGst = (lineTaxableAfter * Math.max(0, Number(item?.gstPercent || 0))) / 100;
                        const lineTotalAfter = roundMoney(lineTaxableAfter + lineGst);

                        return (
                          <tr key={`${item?.product || "item"}-${idx}`}>
                            <td>{item?.product || "-"}</td>
                            <td>{Number(item?.quantity || 0)}</td>
                            <td>{formatCurrency(item?.unitPrice || 0)}</td>
                            <td>{Number(item?.gstPercent || 0).toFixed(2)}%</td>
                            <td>{formatCurrency(lineTaxableBefore)}</td>
                            <td>{formatCurrency(lineTotalAfter)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="invoices-dialog-actions">
                <button type="button" className="invoices-btn secondary" onClick={() => setOpenInvoiceId("")}>Close</button>
                <button
                  type="button"
                  className="invoices-btn secondary"
                  onClick={handleDownloadPdf}
                  disabled={invoiceActionBusy !== ""}
                >
                  {invoiceActionBusy === "download" ? "Downloading..." : "Download"}
                </button>
                <button
                  type="button"
                  className="invoices-btn"
                  onClick={handleSendToClient}
                  disabled={invoiceActionBusy !== ""}
                >
                  {invoiceActionBusy === "send" ? "Sending..." : "Send To Client"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default InvoicesModule;
