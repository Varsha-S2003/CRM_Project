import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import RecordActivityPanel from "./RecordActivityPanel";
import "./Leads.css";
import "./Customers.css";

const getLeadSource = (leadValue) => {
  if (!leadValue || typeof leadValue !== "object") return "-";
  return String(leadValue.source || "").trim() || "-";
};

const getProductLabel = (productValue) => {
  if (!productValue) return "-";
  if (typeof productValue === "string") return productValue;
  return String(productValue.name || productValue.sku || "").trim() || "-";
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const token = localStorage.getItem("token");
        const params = statusFilter === "all" ? {} : { status: statusFilter };
        const res = await axios.get("http://localhost:5000/api/customers", {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
        setCustomers(
          (res.data || []).map((customer) => ({
            ...customer,
            status: customer.status || "Active",
            reason: customer.status === "Inactive" ? String(customer.reason || "").trim() : "",
          }))
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, [statusFilter]);

  const visibleCustomers = useMemo(() => {
    const byStatus =
      statusFilter === "all"
        ? customers
        : customers.filter((customer) => customer.status === statusFilter);

    const term = search.trim().toLowerCase();
    if (!term) return byStatus;

    return byStatus.filter((customer) => {
      const source = getLeadSource(customer.leadId);
      return [
        customer.name,
        customer.company,
        customer.email,
        customer.phone,
        getProductLabel(customer.product),
        source,
        customer.reason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [customers, statusFilter, search]);

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
            <div className="deal-status-filters">
              <button
                type="button"
                className={`btn-filter ${statusFilter === "all" ? "active-status-filter" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                All Customers
              </button>
              <button
                type="button"
                className={`btn-filter ${statusFilter === "Active" ? "active-status-filter" : ""}`}
                onClick={() => setStatusFilter("Active")}
              >
                Active Customers
              </button>
              <button
                type="button"
                className={`btn-filter ${statusFilter === "Inactive" ? "active-status-filter" : ""}`}
                onClick={() => setStatusFilter("Inactive")}
              >
                Inactive Customers
              </button>
            </div>
          </div>

          <div className="customers-toolbar">
            <div className="search-box-zoho customers-search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search customers by name, company, email, phone..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="dashboard-subtitle">Loading customers...</p>
          ) : visibleCustomers.length === 0 ? (
            <p className="dashboard-subtitle">No customers yet. Convert a lead to populate this table.</p>
          ) : (
            <div className="chart-card customers-card">
              <div className="customers-table-wrapper">
              <table className="customers-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Product</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCustomers.map((customer) => (
                    <tr
                      key={customer._id}
                      className="customers-row"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td data-label="Name">{customer.name || "-"}</td>
                      <td data-label="Company">{customer.company || "-"}</td>
                      <td data-label="Email">{customer.email || "-"}</td>
                      <td data-label="Phone">{customer.phone || "-"}</td>
                      <td data-label="Product">{getProductLabel(customer.product)}</td>
                      <td data-label="Source">
                        {getLeadSource(customer.leadId)}
                      </td>
                      <td data-label="Status">
                        <span className={`deal-status-pill ${customer.status === "Inactive" ? "inactive" : "active"}`}>
                          {customer.status || "Active"}
                        </span>
                      </td>
                      <td data-label="Reason">
                        {customer.status === "Inactive" ? customer.reason || "-" : "-"}
                      </td>
                      <td data-label="Created At">
                        {customer.createdAt ? new Date(customer.createdAt).toLocaleString() : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
                    <span className="detail-label">Product</span>
                    <span className="detail-value">{getProductLabel(selectedCustomer.product)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Source</span>
                    <span className="detail-value">
                      {getLeadSource(selectedCustomer.leadId)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Status</span>
                    <span className="detail-value">{selectedCustomer.status || "Active"}</span>
                  </div>
                  {selectedCustomer.status === "Inactive" && (
                    <div className="detail-row">
                      <span className="detail-label">Reason</span>
                      <span className="detail-value">{selectedCustomer.reason || "-"}</span>
                    </div>
                  )}
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
