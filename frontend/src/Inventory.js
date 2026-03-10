import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Inventory.css";
import Sidebar from "./Sidebar";

function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ totalRecords: 0, todayStock: 0 });
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState(null);
  const [newInventory, setNewInventory] = useState({
    product: "",
    quantity: ""
  });
  
  const navigate = useNavigate();
  
  const role = localStorage.getItem("role")?.toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const canEdit = isAdmin || isManager;

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get("http://localhost:5000/api/products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      
      const res = await axios.get("http://localhost:5000/api/inventory", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Client-side filtering with date support
      let filteredInventory = res.data;
      if (search) {
        filteredInventory = res.data.filter(record =>
          (record.product?.name && record.product.name.toLowerCase().includes(search.toLowerCase())) ||
          (record.product?.sku && record.product.sku.toLowerCase().includes(search.toLowerCase())) ||
          new Date(record.createdAt).toISOString().split('T')[0].includes(search)
        );
      }
      setInventory(filteredInventory);
      
      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const todayStock = res.data
        .filter(record => new Date(record.createdAt).toISOString().split('T')[0] === today)
        .reduce((sum, record) => sum + record.quantity, 0);
      
      setStats({
        totalRecords: res.data.length,
        todayStock: todayStock
      });
    } catch (err) {
      console.error(err);
    }
  }, [search]);

  useEffect(() => {
    const role = localStorage.getItem("role")?.toUpperCase();
    if (!role) {
      navigate("/login");
    }
  }, [navigate]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleAddInventory = () => {
    setNewInventory({
      product: "",
      quantity: ""
    });
    setShowModal(true);
  };

  const handleEditInventory = (record) => {
    setSelectedInventory({
      ...record,
      product: record.product?._id || record.product,
      quantity: record.quantity.toString()
    });
    setShowEditModal(true);
  };

  const submitNewInventory = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const inventoryData = {
        product: newInventory.product,
        quantity: parseInt(newInventory.quantity)
      };
      
      await axios.post(
        "http://localhost:5000/api/inventory",
        inventoryData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowModal(false);
      fetchInventory();
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to add inventory");
    }
  };

  const submitEditInventory = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const inventoryData = {
        product: selectedInventory.product,
        quantity: parseInt(selectedInventory.quantity)
      };
      
      await axios.put(
        `http://localhost:5000/api/inventory/${selectedInventory._id}`,
        inventoryData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowEditModal(false);
      setSelectedInventory(null);
      fetchInventory();
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to update inventory");
    }
  };

  const handleDeleteInventory = async (inventoryId) => {
    if (!window.confirm("Are you sure you want to delete this inventory record? This will also reduce the product stock.")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/inventory/${inventoryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchInventory();
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert("Failed to delete inventory record");
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

  const getProductName = (product) => {
    if (!product) return "-";
    return product.name || "-";
  };

  const getProductSku = (product) => {
    if (!product) return "-";
    return product.sku || "-";
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content inventory-page">
        <div className="inventory-fixed-top">
          <div className="inventory-header-section">
            <div className="inventory-header-left">
              <h1>Inventory</h1>
              <p>Manage stock additions</p>
            </div>
            <div className="inventory-stats">
              <div className="stat-card">
                <span className="stat-label">Total Records</span>
                <span className="stat-value">{stats.totalRecords}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Stock Added Today</span>
                <span className="stat-value">+{stats.todayStock}</span>
              </div>
            </div>
            <div className="inventory-header-right">
              {canEdit && (
                <button className="btn-primary" onClick={handleAddInventory}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Stock
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
                placeholder="Search by product name, SKU or date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="inventory-scroll-content">
          <div className="inventory-table-container">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {inventory.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="no-data">
                      No inventory records found. {canEdit && "Add your first stock!"}
                    </td>
                  </tr>
                ) : (
                  inventory.map((record) => (
                    <tr key={record._id}>
                      <td>{formatDate(record.createdAt)}</td>
                      <td className="product-name">{getProductName(record.product)}</td>
                      <td><span className="sku-badge">{getProductSku(record.product)}</span></td>
                      <td className="quantity-in">+{record.quantity}</td>
                      {isAdmin && (
                        <td>
                          <div className="action-buttons">
                            <button 
                              className="action-btn edit-btn"
                              onClick={() => handleEditInventory(record)}
                              title="Edit"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            <button 
                              className="action-btn delete-btn"
                              onClick={() => handleDeleteInventory(record._id)}
                              title="Delete"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {showModal && (
          <div className="modal-overlay-zoho" onClick={() => setShowModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Add Stock</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={submitNewInventory} className="modal-form-zoho">
                <div className="form-section">
                  <h3>Stock Information</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Product *</label>
                      <select
                        value={newInventory.product}
                        onChange={(e) => setNewInventory({ ...newInventory, product: e.target.value })}
                        required
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product._id} value={product._id}>
                            {product.name} ({product.sku}) - Stock: {product.stock}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        placeholder="Enter quantity"
                        value={newInventory.quantity}
                        onChange={(e) => setNewInventory({ ...newInventory, quantity: e.target.value })}
                        min="1"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit">Add Stock</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showEditModal && selectedInventory && (
          <div className="modal-overlay-zoho" onClick={() => setShowEditModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Edit Stock</h2>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={submitEditInventory} className="modal-form-zoho">
                <div className="form-section">
                  <h3>Stock Information</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Product *</label>
                      <select
                        value={selectedInventory.product}
                        onChange={(e) => setSelectedInventory({ ...selectedInventory, product: e.target.value })}
                        required
                      >
                        <option value="">Select product</option>
                        {products.map((product) => (
                          <option key={product._id} value={product._id}>
                            {product.name} ({product.sku}) - Stock: {product.stock}
                          </option>
                        ))}
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        placeholder="Enter quantity"
                        value={selectedInventory.quantity}
                        onChange={(e) => setSelectedInventory({ ...selectedInventory, quantity: e.target.value })}
                        min="1"
                        required
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit">Update Stock</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Inventory;

