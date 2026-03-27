import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../Sidebar";
import api from "../services/api";
import VendorModal from "../components/vendors/VendorModal";
import StatusBadge from "../components/vendors/StatusBadge";
import "../Vendors.css";

const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export default function VendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [pagination, setPagination] = useState({ totalPages: 1, total: 0 });
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [overdue, setOverdue] = useState([]);

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/vendors", {
        params: {
          search,
          status,
          page,
          limit,
        },
      });

      setVendors(res.data?.data || []);
      setPagination(res.data?.pagination || { totalPages: 1, total: 0 });
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to fetch vendors");
    } finally {
      setLoading(false);
    }
  }, [search, status, page, limit]);

  const fetchOverdue = useCallback(async () => {
    try {
      const res = await api.get("/bills/overdue/notifications");
      setOverdue(res.data?.notifications || []);
    } catch (_error) {
      setOverdue([]);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  useEffect(() => {
    fetchOverdue();
  }, [fetchOverdue]);

  const openCreate = () => {
    setEditingVendor(null);
    setShowModal(true);
  };

  const openEdit = (vendor) => {
    setEditingVendor(vendor);
    setShowModal(true);
  };

  const onSubmitVendor = async (payload) => {
    try {
      setSubmitting(true);
      if (editingVendor?._id) {
        await api.put(`/vendors/${editingVendor._id}`, payload);
      } else {
        await api.post("/vendors", payload);
      }
      setShowModal(false);
      setEditingVendor(null);
      fetchVendors();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save vendor");
    } finally {
      setSubmitting(false);
    }
  };

  const onDeleteVendor = async (id) => {
    const confirmed = window.confirm("Mark this vendor as inactive?");
    if (!confirmed) return;

    try {
      await api.delete(`/vendors/${id}`);
      fetchVendors();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete vendor");
    }
  };

  const onExportCsv = async () => {
    try {
      const res = await api.get("/vendors/export/csv", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "vendors.csv";
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to export CSV");
    }
  };

  const onImportCsv = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const csv = await file.text();
    try {
      await api.post("/vendors/import/csv", { csv });
      fetchVendors();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to import CSV");
    }
  };

  const summary = useMemo(() => {
    return vendors.reduce(
      (acc, vendor) => {
        acc.totalPayable += Number(vendor.payable || 0);
        if (vendor.status === "Active") acc.active += 1;
        return acc;
      },
      { totalPayable: 0, active: 0 }
    );
  }, [vendors]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <div className="vendors-page">
          {/* Header Section */}
          <div className="vendors-fixed-top">
            <div className="vendors-header-section">
              <div className="vendors-header-left">
                <h1>Vendors</h1>
                <p>Manage vendors, bills, and payment tracking</p>
              </div>
            </div>

            {/* Stats */}
            <div className="vendors-stats">
              <div className="stat-card">
                <div className="stat-label">Vendors On Page</div>
                <div className="stat-value">{vendors.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Active</div>
                <div className="stat-value">{summary.active}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Outstanding</div>
                <div className="stat-value">{money(summary.totalPayable)}</div>
              </div>
            </div>

            {/* Overdue Alert */}
            {overdue.length > 0 && (
              <div className="vendors-alert">
                <strong>{overdue.length}</strong> overdue bill notification(s) need attention.
              </div>
            )}

            {/* Toolbar */}
            <div className="vendors-toolbar">
              <div className="vendors-search">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search vendor, GST, email..."
                />
              </div>
              <select
                className="vendors-filter-select"
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
              >
                <option value="all">All Vendors</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <button className="btn-primary" onClick={openCreate}>
                + Add Vendor
              </button>
              <button className="btn-secondary" onClick={onExportCsv}>
                Export CSV
              </button>
              <label className="btn-secondary" style={{ cursor: "pointer" }}>
                Import CSV
                <input type="file" accept=".csv" onChange={onImportCsv} style={{ display: "none" }} />
              </label>
            </div>

            {error && <div className="vendors-alert" style={{ background: "#fee2e2", borderColor: "#fecaca", color: "#7f1d1d" }}>{error}</div>}
          </div>

          {/* Scrollable Content */}
          <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
            <div className="vendors-card">
              <div className="vendors-table-wrapper">
                <table className="vendors-table">
                  <thead>
                    <tr>
                      <th>Vendor Name</th>
                      <th>Company</th>
                      <th>Phone</th>
                      <th>GST</th>
                      <th>Payable</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "24px" }}>Loading vendors...</td>
                      </tr>
                    ) : vendors.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "24px" }}>No vendors found.</td>
                      </tr>
                    ) : (
                      vendors.map((vendor) => (
                        <tr key={vendor._id} className="vendors-row">
                          <td>{vendor.vendorName}</td>
                          <td>{vendor.companyName || "-"}</td>
                          <td>{vendor.phone || "-"}</td>
                          <td>{vendor.gstNumber || "-"}</td>
                          <td style={{ fontWeight: "600", color: "#ef4444" }}>{money(vendor.payable)}</td>
                          <td><StatusBadge value={vendor.status} /></td>
                          <td>
                            <div className="vendors-row-actions">
                              <Link to={`/vendors/${vendor._id}`} className="btn-action">View</Link>
                              <button className="btn-action" onClick={() => openEdit(vendor)}>Edit</button>
                              <button className="btn-action danger" onClick={() => onDeleteVendor(vendor._id)}>Deactivate</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="vendors-pagination">
                <span>Total Records: {pagination.total || 0}</span>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page <= 1}>Prev</button>
                  <span>Page {page} / {pagination.totalPages || 1}</span>
                  <button onClick={() => setPage((prev) => Math.min(pagination.totalPages || 1, prev + 1))} disabled={page >= (pagination.totalPages || 1)}>Next</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <VendorModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingVendor(null);
        }}
        onSubmit={onSubmitVendor}
        editingVendor={editingVendor}
        submitting={submitting}
      />
    </div>
  );
}
