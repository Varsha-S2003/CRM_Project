import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Products.css";
import Sidebar from "./Sidebar";

const PRODUCT_CATEGORIES = [
  "Networking Equipment",
  "Storage Devices",
  "End User Devices",
  "Accessories",
  "Security Devices"
];
const SERVICE_CATEGORIES = [
  "Managed Services",
  "Licensing",
  "Cloud Services",
  "Security",
  "Infrastructure"
];

const getItemAlert = (item) => {
  const type = item.type === "service" ? "service" : "product";

  if (type === "product") {
    const quantity = item.quantity ?? item.stock ?? 0;
    const threshold = item.lowStockThreshold ?? 5;

    if (quantity === 0) return { text: "Out of Stock", className: "out-of-stock" };
    if (quantity <= threshold) return { text: `Low Stock (${quantity})`, className: "low-stock" };
    return { text: `In Stock (${quantity})`, className: "in-stock" };
  }

  if (item.serviceType === "license") {
    if (item.status === "Expired") return { text: "Expired", className: "out-of-stock" };
    const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
    if (!expiryDate) return { text: "Active", className: "in-stock" };
    const daysLeft = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 30) return { text: `Expiring Soon (${Math.max(daysLeft, 0)}d)`, className: "low-stock" };
    return { text: "Active", className: "in-stock" };
  }

  if (item.serviceType === "storage") {
    const total = item.totalStorage || 0;
    const available = item.availableStorage ?? 0;
    const freeRatio = total > 0 ? (available / total) * 100 : 0;
    if (freeRatio < 20) return { text: `Low Capacity (${freeRatio.toFixed(0)}%)`, className: "low-stock" };
    return { text: `Available Storage (${available} ${item.storageUnit || "GB"})`, className: "in-stock" };
  }

  if (item.serviceType === "subscription") {
    if (item.status === "Expired") return { text: "Expired", className: "out-of-stock" };
    const nextBillingDate = item.nextBillingDate ? new Date(item.nextBillingDate) : null;
    if (!nextBillingDate) return { text: "No Billing Date", className: "out-of-stock" };

    const daysLeft = Math.ceil((nextBillingDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { text: `Billing Soon (${Math.max(daysLeft, 0)}d)`, className: "low-stock" };
    return { text: `Active (${daysLeft}d to bill)`, className: "in-stock" };
  }

  return { text: "-", className: "in-stock" };
};

function Products() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [typeFilter, setTypeFilter] = useState("all");

  const role = localStorage.getItem("role")?.toUpperCase();
  const visibleCategories = typeFilter === "product"
    ? PRODUCT_CATEGORIES
    : typeFilter === "service"
      ? SERVICE_CATEGORIES
      : [...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES];

  useEffect(() => {
    if (!role) navigate("/login");
  }, [role, navigate]);

  useEffect(() => {
    if (categoryFilter !== "All Categories" && !visibleCategories.includes(categoryFilter)) {
      setCategoryFilter("All Categories");
    }
  }, [categoryFilter, visibleCategories]);

  const fetchItems = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/items", {
        headers: { Authorization: `Bearer ${token}` }
      });

      let filtered = res.data;

      if (categoryFilter !== "All Categories") {
        filtered = filtered.filter((x) => x.category === categoryFilter);
      }

      if (typeFilter !== "all") {
        filtered = filtered.filter((x) => (x.type || "product") === typeFilter);
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter((x) => {
          const type = x.type || "product";
          return (
            (x.name || "").toLowerCase().includes(q) ||
            (x.category || "").toLowerCase().includes(q) ||
            (x.serviceType || "").toLowerCase().includes(q) ||
            type.toLowerCase().includes(q)
          );
        });
      }

      setItems(filtered);
    } catch (error) {
      console.error(error);
    }
  }, [categoryFilter, typeFilter, search]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content products-page">
        <div className="products-fixed-top">
          <div className="products-header-section">
            <div className="products-header-left">
              <h1>Products & Services</h1>
              <p>Manage hardware products and non-inventory services</p>
            </div>
          </div>

          <div className="products-toolbar">
            <div className="search-box-zoho">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search by name, category, type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select className="category-filter" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="All Categories">All Categories</option>
              {visibleCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <select className="category-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>
        </div>

        <div className="products-scroll-content">
          <div className="products-table-container">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="no-data">
                      No records found
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const alertInfo = getItemAlert(item);
                    
                    return (
                      <tr key={item._id}>
                        <td className="product-name">{item.name}</td>
                        <td>{(item.type || "product") === "service" ? "Service" : "Product"}</td>
                        <td>{item.category}</td>
                        <td>{formatCurrency(item.price)}</td>
                        <td>
                          <span className={`stock-badge ${alertInfo.className}`}>{alertInfo.text}</span>
                        </td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Products;
