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

const formatDate = (value) => {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleDateString();
};

const normalizeStatusLabel = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "inactive" ? "Inactive" : "Active";
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
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
          status: customer.status || "Active",
          reason: customer.status === "Inactive" ? String(customer.reason || "").trim() : "",
          createdAt: createdAtValue,
<<<<<<< HEAD
          serviceSubscriptions: [...incomingSubscriptions],
          purchases: [purchase],
=======
          purchases,
>>>>>>> 854c403fd0967469db9e78a5ad05a69127f270f2
        });
        return;
      }

      const existing = grouped.get(key);
      existing.purchases.push(...purchases);

      if (!existing.phone && customer.phone) {
        existing.phone = customer.phone;
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
                  </div>
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
                  <div className="customers-table-wrapper customer-purchases-wrapper">
                    <h3 className="customer-purchases-title">Service Subscriptions</h3>
                    {(selectedCustomer.serviceSubscriptions || []).length === 0 ? (
                      <p className="dashboard-subtitle">No service subscriptions found.</p>
                    ) : (
                      <table className="customers-table">
                        <thead>
                          <tr>
                            <th>Service</th>
                            <th>Plan</th>
                            <th>Start Date</th>
                            <th>Expiry Date</th>
                            <th>Days Remaining</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCustomer.serviceSubscriptions.map((subscription) => (
                            <tr key={subscription.dealId}>
                              <td data-label="Service">{subscription.serviceName || "-"}</td>
                              <td data-label="Plan">{subscription.plan || "-"}</td>
                              <td data-label="Start Date">{formatDate(subscription.startDate)}</td>
                              <td data-label="Expiry Date">{formatDate(subscription.expiryDate)}</td>
                              <td data-label="Days Remaining">
                                {subscription.daysRemaining === null ? "-" : `${subscription.daysRemaining} days`}
                              </td>
                              <td data-label="Status">
                                <span
                                  className={`deal-status-pill ${
                                    subscription.alertStatus === "Expired"
                                      ? "inactive"
                                      : subscription.alertStatus === "Expiring Soon"
                                        ? "warning"
                                        : "active"
                                  }`}
                                >
                                  {subscription.alertStatus || "Active"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
