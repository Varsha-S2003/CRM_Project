import React, { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import api from "./services/api";
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

export default function PaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [invoicePayments, setInvoicePayments] = useState([]);

  const fetchInvoicePayments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get("/payments", {
        params: { source: "CLIENT_INVOICE" },
      });
      setInvoicePayments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load invoice payments.");
      setInvoicePayments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoicePayments();
  }, [fetchInvoicePayments]);

  const filteredPayments = useMemo(() => {
    const query = String(searchText || "").trim().toLowerCase();
    if (!query) return invoicePayments;
    return invoicePayments.filter((payment) => {
      const haystack = [
        payment?.referenceNumber,
        payment?.invoiceId?.invoiceNumber,
        payment?.client?.name,
        payment?.client?.company,
        payment?.client?.email,
        payment?.transactionId,
        payment?.paymentMode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [invoicePayments, searchText]);

  const summary = useMemo(() => {
    const total = invoicePayments.length;
    const totalValue = invoicePayments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0);
    return { total, totalValue };
  }, [invoicePayments]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content invoices-page">
        <div className="invoices-header">
          <div className="invoices-header-copy">
            <span className="invoices-eyebrow">Payments</span>
            <h1>Invoice Payments</h1>
            <p>Client invoice payments are listed here separately from vendor bill payments.</p>
          </div>
          <div className="invoices-summary">
            <div className="invoices-summary-card">
              <span>Total</span>
              <strong>{summary.total}</strong>
            </div>
            <div className="invoices-summary-card">
              <span>Total Collected</span>
              <strong>{formatCurrency(summary.totalValue)}</strong>
            </div>
          </div>
        </div>

        <div className="invoices-toolbar">
          <input
            type="search"
            placeholder="Search by invoice number, client, company, transaction id"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        {error ? <div className="invoices-message error">{error}</div> : null}

        {loading ? (
          <div className="invoices-message">Loading invoice payments...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="invoices-message">No invoice payments found.</div>
        ) : (
          <div className="invoice-payments-panel">
            <div className="invoice-payments-table-wrap">
              <table className="invoice-payments-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Client</th>
                    <th>Company</th>
                    <th>Amount</th>
                    <th>Transaction ID</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={payment._id}>
                      <td>{payment.referenceNumber || payment.invoiceId?.invoiceNumber || "-"}</td>
                      <td>{payment.client?.name || payment.invoiceId?.customerName || "-"}</td>
                      <td>{payment.client?.company || payment.invoiceId?.company || "-"}</td>
                      <td>{formatCurrency(payment.amount || 0)}</td>
                      <td>{payment.transactionId || "-"}</td>
                      <td>{formatDateTime(payment.paymentDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
