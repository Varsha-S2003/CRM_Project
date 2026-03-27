import React, { useEffect, useState } from "react";
import "../../Vendors.css";

const initialState = {
  vendorName: "",
  companyName: "",
  email: "",
  phone: "",
  gstNumber: "",
  address: "",
  city: "",
  state: "",
  status: "Active",
};

export default function VendorModal({ open, onClose, onSubmit, editingVendor, submitting }) {
  const [form, setForm] = useState(initialState);

  useEffect(() => {
    if (editingVendor) {
      setForm({
        vendorName: editingVendor.vendorName || "",
        companyName: editingVendor.companyName || "",
        email: editingVendor.email || "",
        phone: editingVendor.phone || "",
        gstNumber: editingVendor.gstNumber || "",
        address: editingVendor.address || "",
        city: editingVendor.city || "",
        state: editingVendor.state || "",
        status: editingVendor.status || "Active",
      });
    } else {
      setForm(initialState);
    }
  }, [editingVendor, open]);

  if (!open) return null;

  const change = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    await onSubmit(form);
  };

  return (
    <div className="vendor-modal-overlay">
      <div className="vendor-modal-dialog">
        <div className="vendor-modal-header">
          <h2>{editingVendor ? "Update Vendor" : "Add Vendor"}</h2>
          <button type="button" className="vendor-modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit}>
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
