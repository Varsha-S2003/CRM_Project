import React, { useEffect, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import RecordActivityPanel from "./RecordActivityPanel";
import "./Leads.css";

const getLeadSource = (leadValue) => {
  if (!leadValue || typeof leadValue !== "object") return "-";
  return String(leadValue.source || "").trim() || "-";
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/customers", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCustomers(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="dashboard-wrapper">
          <div className="dashboard-header">
            <div>
              <h1 className="dashboard-title">Customers</h1>
              <p className="dashboard-subtitle">Converted leads are listed here.</p>
            </div>
          </div>

          {loading ? (
            <p className="dashboard-subtitle">Loading customers...</p>
          ) : customers.length === 0 ? (
            <p className="dashboard-subtitle">No customers yet. Convert a lead to populate this table.</p>
          ) : (
            <div className="chart-card">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--theme-border)" }}>Name</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--theme-border)" }}>Company</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--theme-border)" }}>Email</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--theme-border)" }}>Phone</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--theme-border)" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid var(--theme-border)" }}>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer._id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td style={{ padding: "10px", borderBottom: "1px solid #efe8d8" }}>{customer.name || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #efe8d8" }}>{customer.company || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #efe8d8" }}>{customer.email || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #efe8d8" }}>{customer.phone || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #efe8d8" }}>
                        {getLeadSource(customer.leadId)}
                      </td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #efe8d8" }}>
                        {customer.createdAt ? new Date(customer.createdAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedCustomer ? (
            <div className="modal-overlay-zoho" onClick={() => setSelectedCustomer(null)}>
              <div className="modal-box-zoho modal-view" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header-zoho">
                  <h2>{selectedCustomer.name}</h2>
                  <button className="modal-close" onClick={() => setSelectedCustomer(null)}>x</button>
                </div>
                <div className="lead-details-view">
                  <div className="detail-row">
                    <span className="detail-label">Company</span>
                    <span className="detail-value">{selectedCustomer.company || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Email</span>
                    <span className="detail-value">{selectedCustomer.email || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Phone</span>
                    <span className="detail-value">{selectedCustomer.phone || "-"}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Source</span>
                    <span className="detail-value">
                      {getLeadSource(selectedCustomer.leadId)}
                    </span>
                  </div>
                </div>
                <RecordActivityPanel
                  recordType="Customer"
                  recordId={selectedCustomer._id}
                  recordName={selectedCustomer.name}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
