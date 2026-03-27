import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Sidebar from "../Sidebar";
import api from "../services/api";
import BillModal from "../components/vendors/BillModal";
import PaymentModal from "../components/vendors/PaymentModal";
import StatusBadge from "../components/vendors/StatusBadge";
import SummaryCards from "../components/vendors/SummaryCards";
import "../Vendors.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const tabs = ["Overview", "Bills", "Payments", "Notes", "Activity"];

export default function VendorDetailPage() {
  const { id } = useParams();
  const [vendor, setVendor] = useState(null);
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({});
  const [activities, setActivities] = useState([]);
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBillModal, setShowBillModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState("all");
  const [notes, setNotes] = useState(localStorage.getItem(`vendor-notes-${id}`) || "");

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/vendors/${id}`, {
        params: {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
      });

      setVendor(res.data?.vendor || null);
      setBills(res.data?.bills || []);
      setPayments(res.data?.payments || []);
      setSummary(res.data?.summary || {});
      setActivities(res.data?.activities || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch vendor details");
    } finally {
      setLoading(false);
    }
  }, [id, fromDate, toDate]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const addBill = async (payload) => {
    try {
      setSubmitting(true);
      await api.post("/bills", {
        ...payload,
        vendorId: id,
      });
      setShowBillModal(false);
      fetchDetail();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add bill");
    } finally {
      setSubmitting(false);
    }
  };

  const addPayment = async (payload) => {
    try {
      setSubmitting(true);
      await api.post("/payments", {
        ...payload,
        vendorId: id,
      });
      setShowPaymentModal(false);
      fetchDetail();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to add payment");
    } finally {
      setSubmitting(false);
    }
  };

  const unpaidBills = useMemo(() => bills.filter((bill) => bill.status !== "Paid"), [bills]);
  const paidByBillId = useMemo(() => {
    return payments.reduce((acc, payment) => {
      const rawBillId = payment?.billId;
      const billId = typeof rawBillId === "object" ? rawBillId?._id : rawBillId;
      if (!billId) return acc;
      acc[String(billId)] = (acc[String(billId)] || 0) + Number(payment?.amount || 0);
      return acc;
    }, {});
  }, [payments]);

  const getPendingAmount = useCallback(
    (bill) => {
      const paid = Number(paidByBillId[String(bill?._id)] || 0);
      const total = Number(bill?.amount || 0);
      return Math.max(0, total - paid);
    },
    [paidByBillId]
  );

  const filteredBills = useMemo(() => {
    if (billStatusFilter === "all") return bills;
    return bills.filter((bill) => String(bill.status || "").toLowerCase() === billStatusFilter.toLowerCase());
  }, [bills, billStatusFilter]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="vendor-detail-page">
          {/* Header */}
          <div className="vendor-detail-header">
            <div className="vendor-detail-header-top">
              <div className="vendor-detail-title">
                <Link to="/vendors">← Back to Vendors</Link>
                <h1>{vendor?.vendorName || "Vendor Detail"}</h1>
                <p>{vendor?.companyName || "No company"} | {vendor?.email || "No email"}</p>
              </div>
              <div className="vendor-detail-actions">
                <StatusBadge value={vendor?.status || "Active"} />
                <button className="btn-primary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={() => setShowBillModal(true)}>Add Bill</button>
                <button className="btn-primary" style={{ padding: "8px 16px", fontSize: "13px" }} onClick={() => setShowPaymentModal(true)}>Add Payment</button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="vendor-detail-content">
            <SummaryCards summary={summary} />

            {error && <div style={{ background: "#fee2e2", border: "1px solid #fecaca", borderRadius: "8px", padding: "12px", marginBottom: "16px", color: "#7f1d1d", fontSize: "13px" }}>{error}</div>}
            {loading && <div style={{ fontSize: "13px", color: "#6b7280" }}>Loading vendor details...</div>}

            {!loading && (
              <>
                {/* Tabs */}
                <div className="vendor-detail-tabs">
                  {tabs.map((name) => (
                    <button
                      key={name}
                      className={`vendor-detail-tab ${tab === name ? "active" : ""}`}
                      onClick={() => setTab(name)}
                    >
                      {name}
                    </button>
                  ))}
                  <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
                    {tab === "Bills" && (
                      <select
                        value={billStatusFilter}
                        onChange={(event) => setBillStatusFilter(event.target.value)}
                        style={{ padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px" }}
                      >
                        <option value="all">All Status</option>
                        <option value="Paid">Paid</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Overdue">Overdue</option>
                      </select>
                    )}
                    <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} style={{ padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px" }} />
                    <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} style={{ padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px" }} />
                    <button onClick={fetchDetail} style={{ padding: "6px 12px", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>Apply</button>
                  </div>
                </div>

                {/* Overview Tab */}
                {tab === "Overview" && (
                  <div className="vendor-detail-grid">
                    <div>
                      <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "#1a1a2e" }}>Contact</h3>
                      <div className="vendor-detail-field">
                        <span className="vendor-detail-label">Phone</span>
                        <span className="vendor-detail-value">{vendor?.phone || "-"}</span>
                      </div>
                      <div className="vendor-detail-field" style={{ marginTop: "8px" }}>
                        <span className="vendor-detail-label">GST Number</span>
                        <span className="vendor-detail-value">{vendor?.gstNumber || "-"}</span>
                      </div>
                      <div className="vendor-detail-field" style={{ marginTop: "8px" }}>
                        <span className="vendor-detail-label">Email</span>
                        <span className="vendor-detail-value">{vendor?.email || "-"}</span>
                      </div>
                    </div>
                    <div>
                      <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "#1a1a2e" }}>Address</h3>
                      <div className="vendor-detail-field">
                        <span className="vendor-detail-label">Address</span>
                        <span className="vendor-detail-value">{vendor?.address || "-"}</span>
                      </div>
                      <div className="vendor-detail-field" style={{ marginTop: "8px" }}>
                        <span className="vendor-detail-label">City</span>
                        <span className="vendor-detail-value">{vendor?.city || "-"}</span>
                      </div>
                      <div className="vendor-detail-field" style={{ marginTop: "8px" }}>
                        <span className="vendor-detail-label">State</span>
                        <span className="vendor-detail-value">{vendor?.state || "-"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bills Tab */}
                {tab === "Bills" && (
                  <div>
                    {filteredBills.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "32px", color: "#6b7280" }}>No bills found.</div>
                    ) : (
                      filteredBills.map((bill) => (
                        <div key={bill._id} style={{ marginBottom: "16px", border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
                          {/* Bill Header */}
                          <div style={{ background: "#f9fafb", padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "12px", alignItems: "center", borderBottom: "1px solid #e5e7eb", fontSize: "13px" }}>
                            <div>
                              <span style={{ display: "block", fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Bill #</span>
                              <span style={{ fontWeight: "600", color: "#1a1a2e" }}>{bill.billNumber}</span>
                            </div>
                            <div>
                              <span style={{ display: "block", fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Amount</span>
                              <span style={{ fontWeight: "600", color: "#1a1a2e" }}>{money(bill.amount)}</span>
                            </div>
                            <div>
                              <span style={{ display: "block", fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Due Date</span>
                              <span style={{ fontWeight: "600", color: "#1a1a2e" }}>{new Date(bill.dueDate).toLocaleDateString()}</span>
                            </div>
                            <div>
                              <span style={{ display: "block", fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Status</span>
                              <StatusBadge value={bill.status} />
                            </div>
                            <div>
                              <span style={{ display: "block", fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }}>Pending</span>
                              <span style={{ fontWeight: "700", color: "#dc2626" }}>{money(getPendingAmount(bill))}</span>
                            </div>
                          </div>

                          {/* Line Items */}
                          {bill.lineItems && bill.lineItems.length > 0 && (
                            <div style={{ padding: "12px 16px" }}>
                              <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                                    <th style={{ padding: "6px 0", textAlign: "left", fontWeight: "600", color: "#6b7280" }}>Product</th>
                                    <th style={{ padding: "6px 0", textAlign: "center", fontWeight: "600", color: "#6b7280", width: "80px" }}>Qty</th>
                                    <th style={{ padding: "6px 0", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "100px" }}>Unit Price</th>
                                    <th style={{ padding: "6px 0", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "100px" }}>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bill.lineItems.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                      <td style={{ padding: "6px 0", color: "#1a1a2e" }}>{item.product}</td>
                                      <td style={{ padding: "6px 0", textAlign: "center", color: "#1a1a2e" }}>{item.quantity}</td>
                                      <td style={{ padding: "6px 0", textAlign: "right", color: "#1a1a2e" }}>₹{Number(item.unitPrice || 0).toFixed(2)}</td>
                                      <td style={{ padding: "6px 0", textAlign: "right", fontWeight: "600", color: "#2563eb" }}>₹{Number(item.total || 0).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Payments Tab */}
                {tab === "Payments" && (
                  <div className="vendors-table-wrapper">
                    <table className="vendors-table">
                      <thead>
                        <tr>
                          <th>Bill #</th>
                          <th>Amount</th>
                          <th>Mode</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ textAlign: "center", padding: "16px" }}>No payments found.</td>
                          </tr>
                        ) : (
                          payments.map((payment) => (
                            <tr key={payment._id} className="vendors-row">
                              <td>{payment.billId?.billNumber || "-"}</td>
                              <td style={{ fontWeight: "600", color: "#10b981" }}>{money(payment.amount)}</td>
                              <td>{payment.paymentMode}</td>
                              <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Notes Tab */}
                {tab === "Notes" && (
                  <div>
                    <textarea
                      value={notes}
                      onChange={(event) => {
                        const value = event.target.value;
                        setNotes(value);
                        localStorage.setItem(`vendor-notes-${id}`, value);
                      }}
                      placeholder="Internal notes for this vendor..."
                      style={{
                        width: "100%",
                        minHeight: "300px",
                        padding: "12px",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>
                )}

                {/* Activity Tab */}
                {tab === "Activity" && (
                  <div className="vendor-activity-feed">
                    {activities.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "#6b7280" }}>No activity logs found.</p>
                    ) : (
                      activities.map((activity) => (
                        <div key={activity._id} className="vendor-activity-item">
                          <p style={{ margin: 0 }}>{activity.message}</p>
                          <p className="vendor-activity-time">{new Date(activity.createdAt).toLocaleString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <BillModal open={showBillModal} onClose={() => setShowBillModal(false)} onSubmit={addBill} submitting={submitting} />
      <PaymentModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSubmit={addPayment}
        bills={unpaidBills}
        submitting={submitting}
      />
    </div>
  );
}
