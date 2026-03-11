import React, { useEffect, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import RecordActivityPanel from "./RecordActivityPanel";
import "./Leads.css";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await axios.get("http://localhost:5000/api/contacts", {
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
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Name</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Company</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Email</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Phone</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Source</th>
                    <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #e5e7eb" }}>Converted At</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr
                      key={customer._id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>{customer.name || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>{customer.company || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>{customer.email || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>{customer.phone || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>{customer.source || "-"}</td>
                      <td style={{ padding: "10px", borderBottom: "1px solid #f1f5f9" }}>
                        {customer.convertedAt ? new Date(customer.convertedAt).toLocaleString() : "-"}
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
                    <span className="detail-label">Converted At</span>
                    <span className="detail-value">
                      {selectedCustomer.convertedAt ? new Date(selectedCustomer.convertedAt).toLocaleString() : "-"}
                    </span>
                  </div>
                </div>
                <RecordActivityPanel
                  recordType="Contact"
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
