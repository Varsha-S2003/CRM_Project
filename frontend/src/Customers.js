import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import Sidebar from "./Sidebar";
import "./Leads.css";
import "./Customers.css";

const getLeadSource = (leadValue) => {
  if (typeof leadValue === "string") {
    return String(leadValue).trim() || "-";
  }
  if (!leadValue || typeof leadValue !== "object") return "-";
  return String(leadValue.source || "").trim() || "-";
};

const getProductLabel = (productValue) => {
  if (!productValue) return "-";
  if (typeof productValue === "string") return productValue;
  return String(productValue.name || productValue.sku || "").trim() || "-";
};

const normalizePurchase = (purchase, customer) => ({
  id: purchase?.id || purchase?._id || customer?._id,
  product: getProductLabel(purchase?.product || customer?.product),
  source: getLeadSource(purchase?.source || customer?.dealSource || customer?.leadId),
  stage: String(purchase?.stage || customer?.dealStage || customer?.stage || "-").trim() || "-",
  status: normalizeStatusLabel(purchase?.status || customer?.dealStatus || customer?.status),
  reason: String(purchase?.reason || customer?.dealReason || customer?.reason || "").trim(),
  createdAt: purchase?.createdAt || customer?.dealCreatedAt || customer?.createdAt || customer?.created_at || null,
});

const toTimestamp = (value) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeKeyPart = (value) => String(value || "").trim().toLowerCase();

const buildCustomerMergeKey = (customer) =>
  [customer.name, customer.company, customer.email].map(normalizeKeyPart).join("|");

const formatDateTime = (value) => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString();
};

const normalizeStatusLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "inactive" ? "Inactive" : "Active";
};

const STATE_OPTIONS = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerForm, setCustomerForm] = useState({ state: "", gstin: "" });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerMessage, setCustomerMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
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
          serviceSubscriptions: customer.serviceSubscriptions || [],
        }))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    const refresh = () => fetchCustomers();
    window.addEventListener("customer-updated", refresh);
    return () => window.removeEventListener("customer-updated", refresh);
  }, [fetchCustomers]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerForm({ state: "", gstin: "" });
      setCustomerMessage("");
      return;
    }

    setCustomerForm({
      state: String(selectedCustomer.state || "").trim(),
      gstin: String(selectedCustomer.gstin || "").trim(),
    });
    setCustomerMessage("");
  }, [selectedCustomer]);

  const handleSaveCustomer = async () => {
    if (!selectedCustomer?._id) return;

    try {
      setSavingCustomer(true);
      setCustomerMessage("");
      const token = localStorage.getItem("token");
      const res = await axios.put(
        `http://localhost:5000/api/customers/${selectedCustomer._id}`,
        {
          state: customerForm.state,
          gstin: customerForm.gstin,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const updatedCustomer = res.data || {};
      setCustomers((prev) =>
        prev.map((customer) =>
          customer._id === updatedCustomer._id ? { ...customer, ...updatedCustomer } : customer
        )
      );
      setSelectedCustomer((prev) => (prev ? { ...prev, ...updatedCustomer } : prev));
      setCustomerMessage("Customer GST details saved.");
      window.dispatchEvent(new Event("customer-updated"));
    } catch (err) {
      setCustomerMessage(err.response?.data?.message || "Failed to save customer.");
    } finally {
      setSavingCustomer(false);
    }
  };

  const mergedCustomers = useMemo(() => {
    const grouped = new Map();

    customers.forEach((customer) => {
      const key = buildCustomerMergeKey(customer);
      const createdAtValue = customer.createdAt || customer.created_at || null;

      const incomingSubscriptions = Array.isArray(customer.serviceSubscriptions) ? customer.serviceSubscriptions : [];
      const purchase = {
        id: customer._id,
        product: getProductLabel(customer.product),
        source: getLeadSource(customer.dealSource || customer.leadId),
        stage: String(customer.dealStage || customer.stage || "-").trim() || "-",
        status: normalizeStatusLabel(customer.dealStatus || customer.status),
        reason: String(customer.dealReason || customer.reason || "").trim(),
        createdAt: customer.dealCreatedAt || createdAtValue,
      };

      const purchases =
        Array.isArray(customer.purchases) && customer.purchases.length > 0
          ? customer.purchases.map((purchase) => normalizePurchase(purchase, customer))
          : [normalizePurchase(null, customer)];


      if (!grouped.has(key)) {
        grouped.set(key, {
          _id: customer._id,
          key,
          name: customer.name || "",
          company: customer.company || "",
          email: customer.email || "",
          phone: customer.phone || "",
          state: customer.state || "",
          gstin: customer.gstin || "",
          status: customer.status || "Active",
          reason: customer.status === "Inactive" ? String(customer.reason || "").trim() : "",
          createdAt: createdAtValue,

          serviceSubscriptions: [...incomingSubscriptions],
          purchases: [purchase],
        });
        return;
      }

      const existing = grouped.get(key);
      existing.purchases.push(...purchases);

      if (!existing.phone && customer.phone) {
        existing.phone = customer.phone;
      }
      if (!existing.state && customer.state) {
        existing.state = customer.state;
      }
      if (!existing.gstin && customer.gstin) {
        existing.gstin = customer.gstin;
      }

      const existingCreatedAtTs = toTimestamp(existing.createdAt);
      const currentCreatedAtTs = toTimestamp(createdAtValue);
      if (existingCreatedAtTs === 0 || (currentCreatedAtTs > 0 && currentCreatedAtTs < existingCreatedAtTs)) {
        existing.createdAt = createdAtValue;
      }

      const existingReasons = new Set(
        String(existing.reason || "")
          .split(" | ")
          .map((item) => item.trim())
          .filter(Boolean)
      );
      const currentReason = String(customer.reason || "").trim();
      if (customer.status === "Inactive" && currentReason) {
        existingReasons.add(currentReason);
      }

      if (existingReasons.size > 0) {
        existing.reason = Array.from(existingReasons).join(" | ");
      }

      if (customer.status === "Inactive") {
        existing.status = "Inactive";
      }

      const subscriptionIds = new Set((existing.serviceSubscriptions || []).map((subscription) => String(subscription.dealId)));
      incomingSubscriptions.forEach((subscription) => {
        if (!subscriptionIds.has(String(subscription.dealId))) {
          existing.serviceSubscriptions.push(subscription);
          subscriptionIds.add(String(subscription.dealId));
        }
      });
    });

    return Array.from(grouped.values())
      .map((customer) => ({
        ...customer,
        purchases: customer.purchases.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt)),
        serviceSubscriptions: (customer.serviceSubscriptions || []).sort(
          (a, b) => toTimestamp(a.expiryDate) - toTimestamp(b.expiryDate)
        ),
      }))
      .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
  }, [customers]);

  const visibleCustomers = useMemo(() => {
    const byStatus =
      statusFilter === "all"
        ? mergedCustomers
        : mergedCustomers.filter((customer) => customer.status === statusFilter);

    const term = search.trim().toLowerCase();
    if (!term) return byStatus;

    return byStatus.filter((customer) => {
      return [
        customer.name,
        customer.company,
        customer.email,
        customer.phone,
        customer.state,
        customer.gstin,
        customer.reason,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [mergedCustomers, statusFilter, search]);

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
              <select
                className="customers-filter-select"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter customers by status"
              >
                <option value="all">All Customers</option>
                <option value="Active">Active Customers</option>
                <option value="Inactive">Inactive Customers</option>
              </select>
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
                    <th>State</th>
                    <th>GSTIN</th>
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
                      <td data-label="State">{customer.state || "-"}</td>
                      <td data-label="GSTIN">{customer.gstin || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {selectedCustomer ? (
            <div className="modal-overlay-zoho" onClick={() => setSelectedCustomer(null)}>
              <div className="modal-box-zoho modal-view customer-modal-dialog" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header-zoho">
                  <h2>{selectedCustomer.name}</h2>
                  <button className="modal-close" onClick={() => setSelectedCustomer(null)}>x</button>
                </div>
                <div className="customer-modal-content">
                  <div className="lead-details-view customer-lead-details">
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
                      <span className="detail-label">State</span>
                      <select
                        className="customer-inline-input"
                        value={customerForm.state}
                        onChange={(event) => setCustomerForm((prev) => ({ ...prev, state: event.target.value }))}
                      >
                        <option value="">Select state</option>
                        {STATE_OPTIONS.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">GSTIN</span>
                      <input
                        className="customer-inline-input"
                        type="text"
                        value={customerForm.gstin}
                        onChange={(event) =>
                          setCustomerForm((prev) => ({ ...prev, gstin: event.target.value.toUpperCase() }))
                        }
                        placeholder="Enter GSTIN"
                      />
                    </div>
                  </div>
                  {customerMessage ? <div className="customer-message">{customerMessage}</div> : null}
                  <div className="customers-table-wrapper customer-purchases-wrapper">
                    <h3 className="customer-purchases-title">Purchases</h3>
                    <table className="customers-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Source</th>
                          <th>Stage</th>
                          <th>Status</th>
                          <th>Reason</th>
                          <th>Created At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedCustomer.purchases || []).length === 0 ? (
                          <tr>
                            <td colSpan="6">-</td>
                          </tr>
                        ) : (
                          selectedCustomer.purchases.map((purchase) => {
                            const purchaseStatus = normalizeStatusLabel(purchase.status);
                            return (
                              <tr key={`${purchase.id}-${purchase.createdAt || "na"}`}>
                                <td data-label="Product">{purchase.product || "-"}</td>
                                <td data-label="Source">{purchase.source || "-"}</td>
                                <td data-label="Stage">{purchase.stage || "-"}</td>
                                <td data-label="Status">
                                  <span className={`deal-status-pill ${purchaseStatus === "Inactive" ? "inactive" : "active"}`}>
                                    {purchaseStatus}
                                  </span>
                                </td>
                                <td data-label="Reason">
                                  {purchaseStatus === "Inactive" ? purchase.reason || "-" : "-"}
                                </td>
                                <td data-label="Created At">{formatDateTime(purchase.createdAt)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="customer-modal-actions">
                  <button type="button" className="btn-submit" onClick={handleSaveCustomer} disabled={savingCustomer}>
                    {savingCustomer ? "Saving..." : "Save GST Details"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
