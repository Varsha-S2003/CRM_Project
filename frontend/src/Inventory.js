import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Inventory.css";
import Sidebar from "./Sidebar";
import ItemForm from "./components/ItemForm";

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

const getInventoryStatus = (item) => {
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

const formatInventoryInfo = (item) => {
  if ((item.type || "product") === "product") {
    return item.quantity ?? item.stock ?? 0;
  }

  return "-";
};

const formatCurrency = (value) => {
  if (value === undefined || value === null || value === "") return "-";

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(Number(value) || 0);
};

function Inventory() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const navigate = useNavigate();

  const role = localStorage.getItem("role")?.toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const canEdit = isAdmin || isManager;
  const visibleCategories = typeFilter === "product"
    ? PRODUCT_CATEGORIES
    : typeFilter === "service"
      ? SERVICE_CATEGORIES
      : [...PRODUCT_CATEGORIES, ...SERVICE_CATEGORIES];

  const fetchItems = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/items", {
        headers: { Authorization: `Bearer ${token}` }
      });

      let filtered = res.data;

      if (categoryFilter !== "All Categories") {
        filtered = filtered.filter((item) => item.category === categoryFilter);
      }

      if (typeFilter !== "all") {
        filtered = filtered.filter((item) => (item.type || "product") === typeFilter);
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        filtered = filtered.filter((item) => {
          const type = item.type || "product";
          return (
            (item.name || "").toLowerCase().includes(q) ||
            (item.sku || "").toLowerCase().includes(q) ||
            (item.category || "").toLowerCase().includes(q) ||
            (item.serviceType || "").toLowerCase().includes(q) ||
            type.toLowerCase().includes(q)
          );
        });
      }

      setItems(filtered);
    } catch (err) {
      console.error(err);
    }
  }, [search, categoryFilter, typeFilter]);

  useEffect(() => {
    if (!role) {
      navigate("/login");
    }
  }, [navigate, role]);

  useEffect(() => {
    if (categoryFilter !== "All Categories" && !visibleCategories.includes(categoryFilter)) {
      setCategoryFilter("All Categories");
    }
  }, [categoryFilter, visibleCategories]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const refresh = () => fetchItems();
    window.addEventListener("inventory-updated", refresh);
    return () => window.removeEventListener("inventory-updated", refresh);
  }, [fetchItems]);

  const handleAddInventory = () => {
    setShowModal(true);
  };

  const handleCreateItem = async (payload) => {
    try {
      const token = localStorage.getItem("token");

      const res = await axios.post("http://localhost:5000/api/items", payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setShowModal(false);
      fetchItems();
      alert(res.data?.message || "Item created successfully");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to create item");
    }
  };

  const handleEditInventory = (item) => {
    setSelectedItem(item);
    setShowEditModal(true);
  };

  const handleUpdateItem = async (payload) => {
    if (!selectedItem) return;

    try {
      const token = localStorage.getItem("token");

      await axios.put(`http://localhost:5000/api/items/${selectedItem._id}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setShowEditModal(false);
      setSelectedItem(null);
      fetchItems();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to update item");
    }
  };

  const handleDeleteInventory = async (itemId) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;

    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      fetchItems();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to delete item");
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content inventory-page">
        <div className="inventory-fixed-top">
          <div className="inventory-header-section">
            <div className="inventory-header-left">
              <h1>Inventory</h1>
              <p>Manage items here. Products & Services will reflect the same database records.</p>
            </div>
            <div className="inventory-header-right">
              {canEdit && (
                <button className="btn-primary" onClick={handleAddInventory}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Item
                </button>
              )}
            </div>
          </div>

          <div className="inventory-toolbar">
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

            <select
              className="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="All Categories">All Categories</option>
              {visibleCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <select
              className="category-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>
        </div>

        <div className="inventory-scroll-content">
          <div className="inventory-table-container">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>GST %</th>
                  <th>HSN/SAC</th>
                  <th>Status</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 11 : 10} className="no-data">
                      No items found. {canEdit ? "Add your first item here." : ""}
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const status = getInventoryStatus(item);

                    return (
                      <tr key={item._id}>
                        <td>{formatDate(item.createdAt)}</td>
                        <td className="product-name">{item.name}</td>
                        <td>{(item.type || "product") === "service" ? "Service" : "Product"}</td>
                        <td><span className="sku-badge">{item.sku || "-"}</span></td>
                        <td>{item.category || "-"}</td>
                        <td className="quantity-in">{formatInventoryInfo(item)}</td>
                        <td className="quantity-in">
                          {(item.type || "product") === "service"
                            ? formatCurrency(item.cost)
                            : formatCurrency(item.price)}
                        </td>
                        <td>{(item.type || "product") === "product" ? `${Number(item.gst_percent ?? 18)}%` : "-"}</td>
                        <td>{(item.type || "product") === "product" ? (item.hsn_sac || "-") : "-"}</td>
                        <td>
                          <span className={`stock-badge ${status.className}`}>{status.text}</span>
                        </td>
                        {canEdit && (
                          <td>
                            <div className="action-buttons">
                              <button
                                className="action-btn edit-btn"
                                onClick={() => handleEditInventory(item)}
                                title="Edit"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
                              {isAdmin && (
                                <button
                                  className="action-btn delete-btn"
                                  onClick={() => handleDeleteInventory(item._id)}
                                  title="Delete"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Add Item</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <ItemForm
                onSubmit={handleCreateItem}
                onCancel={() => setShowModal(false)}
                submitLabel="Create"
              />
            </div>
          </div>
        )}

        {showEditModal && selectedItem && (
          <div className="modal-overlay-zoho" onClick={() => setShowEditModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Edit Item</h2>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <ItemForm
                initialItem={selectedItem}
                onSubmit={handleUpdateItem}
                onCancel={() => setShowEditModal(false)}
                submitLabel="Update"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Inventory;
