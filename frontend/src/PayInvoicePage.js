import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import "./PayInvoicePage.css";

const formatCurrency = (value) => {
  const numeric = Number(value || 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return `Rs.${safe.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN");
};

function PayInvoicePage() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paymentData, setPaymentData] = useState(null);
  const [paymentResult, setPaymentResult] = useState(null);

  const status = useMemo(() => String(paymentData?.status || "").toLowerCase(), [paymentData]);

  useEffect(() => {
    const loadPaymentDetails = async () => {
      if (!token) {
        setError("Payment token is missing in URL.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const res = await axios.get(`/api/invoices/pay/${encodeURIComponent(token)}`);
        setPaymentData(res.data || null);
      } catch (err) {
        setError(err.response?.data?.message || "Unable to load payment details.");
        setPaymentData(null);
      } finally {
        setLoading(false);
      }
    };

    loadPaymentDetails();
  }, [token]);

  const handlePayBill = async () => {
    if (!token || busy) return;

    try {
      setBusy(true);
      setError("");
      const res = await axios.post(`/api/invoices/pay/${encodeURIComponent(token)}/complete`, {
        paymentMode: "UPI",
      });

      setPaymentResult(res.data || null);
      setPaymentData((prev) => ({
        ...(prev || {}),
        status: "paid",
        payment: res.data?.payment || prev?.payment || null,
      }));
    } catch (err) {
      setError(err.response?.data?.message || "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pay-invoice-page">
      <div className="pay-invoice-shell">
        <h1>Invoice Payment</h1>

        {loading ? <div className="pay-invoice-info">Loading payment details...</div> : null}

        {!loading && error ? <div className="pay-invoice-error">{error}</div> : null}

        {!loading && !error && paymentData ? (
          <div className="pay-invoice-card">
            <div className="pay-invoice-grid">
              <div>
                <span>Invoice Number</span>
                <strong>{paymentData?.invoice?.invoiceNumber || "-"}</strong>
              </div>
              <div>
                <span>Customer</span>
                <strong>{paymentData?.invoice?.customerName || paymentData?.invoice?.company || "-"}</strong>
              </div>
              <div>
                <span>Due Date</span>
                <strong>{formatDate(paymentData?.invoice?.dueDate)}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>{formatCurrency(paymentData?.amount || 0)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong className={`status ${status || "unpaid"}`}>{status || "unpaid"}</strong>
              </div>
              <div>
                <span>Transaction ID</span>
                <strong>{paymentData?.transactionId || paymentResult?.transactionId || "-"}</strong>
              </div>
            </div>

            {status !== "paid" ? (
              <button type="button" className="pay-bill-btn" onClick={handlePayBill} disabled={busy}>
                {busy ? "Processing..." : "Pay Bill"}
              </button>
            ) : (
              <div className="pay-invoice-success">Payment already completed for this invoice.</div>
            )}

            {paymentResult?.message ? <div className="pay-invoice-success">{paymentResult.message}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default PayInvoicePage;
