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
  "Cloud Services",
  "Managed Services",
  "Security",
  "Infrastructure",
  "Backup & Recovery"
];

const getItemAlert = (item) => {
  if ((item.type || "product") === "product") {
    const quantity = Number(item.quantity ?? item.stock ?? 0);
    const threshold = Number(item.lowStockThreshold ?? 5);

    if (quantity <= 0) {
      return { text: "Out of Stock", className: "out-of-stock" };
    }

    if (quantity <= threshold) {
      return { text: `Low Stock (${quantity})`, className: "low-stock" };
    }

    return { text: `In Stock (${quantity})`, className: "in-stock" };
  }

  return item.status === "Inactive"
    ? { text: "Inactive", className: "out-of-stock" }
    : { text: "Active", className: "in-stock" };
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

  useEffect(() => {
    const refresh = () => fetchItems();
    window.addEventListener("inventory-updated", refresh);
    return () => window.removeEventListener("inventory-updated", refresh);
  }, [fetchItems]);

  const formatCurrency = (value) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value || 0);

  const getDisplayPrice = (item) =>
    (item.type || "product") === "service" ? item.cost : item.price;

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
                  <th>GST %</th>
                  <th>HSN/SAC</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="no-data">
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
                        <td>{formatCurrency(getDisplayPrice(item))}</td>
                        <td>{`${Number(item.gst_percent ?? 18)}%`}</td>
                        <td>{(item.type || "product") === "product" ? (item.hsn_sac || "-") : "-"}</td>
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
