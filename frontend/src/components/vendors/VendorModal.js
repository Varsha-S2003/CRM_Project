import React, { useEffect, useState } from "react";
import "../../Vendors.css";
import api from "../../services/api";

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;

const initialState = {
  vendorName: "",
  companyName: "",
  email: "",
  phone: "",
  gstNumber: "",
  address: "",
  city: "",
  state: "",
  selectedProducts: [],
  selectedServices: [],
  status: "Active",
};

export default function VendorModal({ open, onClose, onSubmit, editingVendor, submitting }) {
  const [form, setForm] = useState(initialState);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [loadingSupplies, setLoadingSupplies] = useState(false);
  const [supplyError, setSupplyError] = useState("");

  useEffect(() => {
    if (editingVendor) {
      const existingProducts = Array.isArray(editingVendor.productsProvided) ? editingVendor.productsProvided : [];
      const existingServices = Array.isArray(editingVendor.servicesProvided) ? editingVendor.servicesProvided : [];

      setForm({
        vendorName: editingVendor.vendorName || "",
        companyName: editingVendor.companyName || "",
        email: editingVendor.email || "",
        phone: editingVendor.phone || "",
        gstNumber: editingVendor.gstNumber || "",
        address: editingVendor.address || "",
        city: editingVendor.city || "",
        state: editingVendor.state || "",
        selectedProducts: existingProducts,
        selectedServices: existingServices,
        status: editingVendor.status || "Active",
      });
    } else {
      setForm(initialState);
    }
  }, [editingVendor, open]);

  useEffect(() => {
    if (!open) return;

    const fetchSupplies = async () => {
      try {
        setLoadingSupplies(true);
        setSupplyError("");

        const [productRes, serviceRes] = await Promise.all([
          api.get("/items", { params: { type: "product" } }),
          api.get("/items", { params: { type: "service" } }),
        ]);

        const mapRows = (rows) =>
          rows
            .filter((item) => item?.name)
            .map((item) => ({
              id: item._id,
              name: String(item.name),
              category: String(item.category || ""),
            }));

        const productRows = Array.isArray(productRes.data) ? productRes.data : [];
        const serviceRows = Array.isArray(serviceRes.data) ? serviceRes.data : [];

        setAvailableProducts(mapRows(productRows));
        setAvailableServices(mapRows(serviceRows));
      } catch (_error) {
        setAvailableProducts([]);
        setAvailableServices([]);
        setSupplyError("Failed to load products/services");
      } finally {
        setLoadingSupplies(false);
      }
    };

    fetchSupplies();
  }, [open]);

  if (!open) return null;

  const change = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const toggleSupply = (field, name) => {
    setForm((prev) => {
      const list = prev[field] || [];
      const exists = list.includes(name);
      return {
        ...prev,
        [field]: exists ? list.filter((item) => item !== name) : [...list, name],
      };
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    const gstValue = String(form.gstNumber || "").trim().toUpperCase();
    if (gstValue && !GST_REGEX.test(gstValue)) {
      window.alert("Invalid GST number. Example format: 22AAAAA0000A1Z5");
      return;
    }

    const payload = {
      vendorName: form.vendorName,
      companyName: form.companyName,
      email: form.email,
      phone: form.phone,
      gstNumber: gstValue,
      address: form.address,
      city: form.city,
      state: form.state,
      status: form.status,
      productsProvided: form.selectedProducts,
      servicesProvided: form.selectedServices,
    };

    await onSubmit(payload);
  };

  return (
    <div className="vendor-modal-overlay">
      <div className="vendor-modal-dialog">
        <div className="vendor-modal-header">
          <h2>{editingVendor ? "Update Vendor" : "Add Vendor"}</h2>
          <button type="button" className="vendor-modal-close" onClick={onClose}>×</button>
        </div>

        <form className="vendor-modal-form" onSubmit={submit}>
          <div className="vendor-modal-content">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Vendor Name *</label>
                <input className="form-input" name="vendorName" value={form.vendorName} onChange={change} required />
              </div>
              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input className="form-input" name="companyName" value={form.companyName} onChange={change} />
              </div>
              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-input" type="email" name="email" value={form.email} onChange={change} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" name="phone" value={form.phone} onChange={change} />
              </div>
              <div className="form-group">
                <label className="form-label">GST Number</label>
                <input className="form-input" name="gstNumber" value={form.gstNumber} onChange={change} />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" name="status" value={form.status} onChange={change}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">City</label>
                <input className="form-input" name="city" value={form.city} onChange={change} />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input className="form-input" name="state" value={form.state} onChange={change} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Address</label>
                <textarea className="form-textarea" name="address" value={form.address} onChange={change} />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Select Products</label>
                <div className="vendor-supplies-box">
                  {loadingSupplies ? (
                    <p className="vendor-supplies-empty">Loading options...</p>
                  ) : supplyError ? (
                    <p className="vendor-supplies-empty">{supplyError}</p>
                  ) : availableProducts.length === 0 ? (
                    <p className="vendor-supplies-empty">No products found in Products section.</p>
                  ) : (
                    availableProducts.map((item) => {
                      const checked = form.selectedProducts.includes(item.name);
                      return (
                        <label key={item.id} className="vendor-supply-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSupply("selectedProducts", item.name)}
                          />
                          <span>{item.name}</span>
                          <small>{item.category}</small>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">Select Services</label>
                <div className="vendor-supplies-box">
                  {loadingSupplies ? (
                    <p className="vendor-supplies-empty">Loading options...</p>
                  ) : supplyError ? (
                    <p className="vendor-supplies-empty">{supplyError}</p>
                  ) : availableServices.length === 0 ? (
                    <p className="vendor-supplies-empty">No services found in Products section.</p>
                  ) : (
                    availableServices.map((item) => {
                      const checked = form.selectedServices.includes(item.name);
                      return (
                        <label key={item.id} className="vendor-supply-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSupply("selectedServices", item.name)}
                          />
                          <span>{item.name}</span>
                          <small>{item.category}</small>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="vendor-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button disabled={submitting} type="submit" className="btn-primary">
              {submitting ? "Saving..." : editingVendor ? "Update Vendor" : "Create Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
