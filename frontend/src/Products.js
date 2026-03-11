import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Products.css";
import Sidebar from "./Sidebar";

function Products() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [newProduct, setNewProduct] = useState({
    name: "",
    category: "",
    price: "",
    description: ""
  });
  
  const navigate = useNavigate();
  
  const role = localStorage.getItem("role")?.toUpperCase();
  const isAdmin = role === "ADMIN";
  const isManager = role === "MANAGER";
  const canEdit = isAdmin || isManager;

  const categories = ["All Categories", "Networking", "Hardware", "Licensing", "Cloud Services", "Security"];

  const fetchProducts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      
      const res = await axios.get("http://localhost:5000/api/products", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      // Client-side filtering with search and category
      let filteredProducts = res.data;
      
      // Apply category filter
      if (categoryFilter && categoryFilter !== "All Categories") {
        filteredProducts = filteredProducts.filter(product => product.category === categoryFilter);
      }
      
      // Apply search filter
      if (search) {
        filteredProducts = filteredProducts.filter(product =>
          product.name.toLowerCase().includes(search.toLowerCase()) ||
          product.sku.toLowerCase().includes(search.toLowerCase()) ||
          product.category.toLowerCase().includes(search.toLowerCase()) ||
          new Date(product.createdAt).toISOString().split('T')[0].includes(search)
        );
      }
      setProducts(filteredProducts);
    } catch (err) {
      console.error(err);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    const role = localStorage.getItem("role")?.toUpperCase();
    if (!role) {
      navigate("/login");
    }
  }, [navigate]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleAddProduct = () => {
    setNewProduct({
      name: "",
      category: "",
      price: "",
      description: ""
    });
    setShowModal(true);
  };

  const submitNewProduct = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const productData = {
        name: newProduct.name,
        category: newProduct.category,
        price: parseFloat(newProduct.price),
        description: newProduct.description
      };
      
      await axios.post(
        "http://localhost:5000/api/products",
        productData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowModal(false);
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to add product");
    }
  };

  const handleEditProduct = (product) => {
    setSelectedProduct({
      ...product,
      price: product.price.toString()
    });
    setShowEditModal(true);
  };

  const submitEditProduct = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const productData = {
        name: selectedProduct.name,
        sku: selectedProduct.sku,
        category: selectedProduct.category,
        price: parseFloat(selectedProduct.price),
        description: selectedProduct.description
      };
      
      await axios.put(
        `http://localhost:5000/api/products/${selectedProduct._id}`,
        productData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setShowEditModal(false);
      setSelectedProduct(null);
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to update product");
    }
  };

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm("Are you sure you want to delete this product?")) return;
    try {
      const token = localStorage.getItem("token");
      await axios.delete(`http://localhost:5000/api/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert("Failed to delete product");
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount);
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content products-page">
        <div className="products-fixed-top">
          <div className="products-header-section">
            <div className="products-header-left">
              <h1>Products</h1>
              <p>Manage your product inventory</p>
            </div>
            <div className="products-header-right">
              {canEdit && (
                <button className="btn-primary" onClick={handleAddProduct}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Product
                </button>
              )}
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
                placeholder="Search products by name, SKU or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="products-scroll-content">
          <div className="products-table-container">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Created Date</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 7 : 6} className="no-data">
                      No products found. {canEdit && "Add your first product!"}
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product._id}>
                      <td className="product-name">{product.name}</td>
                      <td><span className="sku-badge">{product.sku}</span></td>
                      <td>{product.category}</td>
                      <td>{formatCurrency(product.price)}</td>
                      <td>
                        {product.stock === 0 ? (
                          <span className="stock-badge out-of-stock">
                            Out of Stock
                          </span>
                        ) : product.stock < 5 ? (
                          <span className="stock-badge low-stock">
                            Low Stock ({product.stock})
                          </span>
                        ) : (
                          <span className="stock-badge in-stock">
                            {product.stock}
                          </span>
                        )}
                      </td>
                      <td>{formatDate(product.createdAt)}</td>
                      {canEdit && (
                        <td>
                          <div className="action-buttons">
                            <button 
                              className="action-btn edit-btn"
                              onClick={() => handleEditProduct(product)}
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
                                onClick={() => handleDeleteProduct(product._id)}
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
                <h2>Add New Product</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={submitNewProduct} className="modal-form-zoho">
                <div className="form-section">
                  <h3>Product Information</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Product Name *</label>
                      <input
                        type="text"
                        placeholder="Enter product name"
                        value={newProduct.name}
                        onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Category *</label>
                      <select
                        value={newProduct.category}
                        onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Price *</label>
                      <input
                        type="number"
                        placeholder="Enter price"
                        value={newProduct.price}
                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Description</label>
                      <input
                        type="text"
                        placeholder="Enter description"
                        value={newProduct.description}
                        onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit">Add Product</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showEditModal && selectedProduct && (
          <div className="modal-overlay-zoho" onClick={() => setShowEditModal(false)}>
            <div className="modal-box-zoho" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header-zoho">
                <h2>Edit Product</h2>
                <button className="modal-close" onClick={() => setShowEditModal(false)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              <form onSubmit={submitEditProduct} className="modal-form-zoho">
                <div className="form-section">
                  <h3>Product Information</h3>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Product Name *</label>
                      <input
                        type="text"
                        placeholder="Enter product name"
                        value={selectedProduct.name}
                        onChange={(e) => setSelectedProduct({ ...selectedProduct, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>SKU *</label>
                      <input
                        type="text"
                        value={selectedProduct.sku}
                        disabled
                        className="disabled-input"
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Category *</label>
                      <select
                        value={selectedProduct.category}
                        onChange={(e) => setSelectedProduct({ ...selectedProduct, category: e.target.value })}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Price *</label>
                      <input
                        type="number"
                        placeholder="Enter price"
                        value={selectedProduct.price}
                        onChange={(e) => setSelectedProduct({ ...selectedProduct, price: e.target.value })}
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Description</label>
                      <input
                        type="text"
                        placeholder="Enter description"
                        value={selectedProduct.description || ""}
                        onChange={(e) => setSelectedProduct({ ...selectedProduct, description: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-row-zoho">
                    <div className="form-group">
                      <label>Current Stock</label>
                      <input
                        type="text"
                        value={selectedProduct.stock}
                        disabled
                        className="disabled-input"
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
                  <button type="submit" className="btn-submit">Update Product</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Products;

