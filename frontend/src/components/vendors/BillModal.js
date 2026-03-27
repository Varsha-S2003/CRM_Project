import React, { useState } from "react";
import "../../Vendors.css";

const initialState = {
  billNumber: "",
  dueDate: "",
  lineItems: [{ product: "", quantity: 1, unitPrice: "" }],
};

export default function BillModal({ open, onClose, onSubmit, submitting }) {
  const [form, setForm] = useState(initialState);

  if (!open) return null;

  const change = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const changeLineItem = (index, field, value) => {
    const newLineItems = [...form.lineItems];
    newLineItems[index][field] = field === "quantity" ? Math.max(1, Number(value) || 0) : value;
    setForm((prev) => ({ ...prev, lineItems: newLineItems }));
  };

  const addLineItem = () => {
    setForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, { product: "", quantity: 1, unitPrice: "" }],
    }));
  };

  const removeLineItem = (index) => {
    if (form.lineItems.length > 1) {
      setForm((prev) => ({
        ...prev,
        lineItems: prev.lineItems.filter((_, i) => i !== index),
      }));
    }
  };

  const calculateTotal = () => {
    return form.lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice || 0);
      return sum + qty * price;
    }, 0);
  };

  const total = calculateTotal();

  const submit = async (event) => {
    event.preventDefault();

    // Validation
    if (!form.billNumber.trim()) {
      alert("Bill number is required");
      return;
    }
    if (!form.dueDate) {
      alert("Due date is required");
      return;
    }

    const validItems = form.lineItems.filter(
      (item) => item.product.trim() && Number(item.quantity) > 0 && Number(item.unitPrice) > 0
    );
    if (validItems.length === 0) {
      alert("Add at least one valid line item");
      return;
    }

    await onSubmit({
      billNumber: form.billNumber,
      dueDate: form.dueDate,
      amount: total,
      lineItems: validItems,
    });
    setForm(initialState);
  };

  return (
    <div className="vendor-modal-overlay">
      <div className="vendor-modal-dialog" style={{ maxWidth: "800px" }}>
        <div className="vendor-modal-header">
          <h2>Add Bill</h2>
          <button type="button" className="vendor-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="vendor-modal-content">
            {/* Bill Header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              <div className="form-group">
                <label className="form-label">Bill Number *</label>
                <input className="form-input" name="billNumber" value={form.billNumber} onChange={change} required />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date *</label>
                <input className="form-input" name="dueDate" value={form.dueDate} onChange={change} type="date" required />
              </div>
            </div>

            {/* Line Items */}
            <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "#1a1a2e" }}>Line Items</h3>
            <div style={{ overflowX: "auto", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "8px", textAlign: "left", fontWeight: "600", color: "#6b7280" }}>Product</th>
                    <th style={{ padding: "8px", textAlign: "center", fontWeight: "600", color: "#6b7280", width: "100px" }}>Qty</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "120px" }}>Unit Price</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "100px" }}>Total</th>
                    <th style={{ padding: "8px", textAlign: "center", width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lineItems.map((item, index) => {
                    const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    return (
                      <tr key={index} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "8px" }}>
                          <input
                            type="text"
                            placeholder="Product name"
                            value={item.product}
                            onChange={(e) => changeLineItem(index, "product", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid #e5e7eb",
                              borderRadius: "4px",
                              fontSize: "13px",
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => changeLineItem(index, "quantity", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid #e5e7eb",
                              borderRadius: "4px",
                              textAlign: "center",
                              fontSize: "13px",
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px", textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={item.unitPrice}
                            onChange={(e) => changeLineItem(index, "unitPrice", e.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px",
                              border: "1px solid #e5e7eb",
                              borderRadius: "4px",
                              textAlign: "right",
                              fontSize: "13px",
                            }}
                          />
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#1a1a2e" }}>
                          ₹{itemTotal.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          {form.lineItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLineItem(index)}
                              style={{
                                background: "#fee2e2",
                                border: "none",
                                color: "#dc2626",
                                cursor: "pointer",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add Item Button */}
            <button
              type="button"
              onClick={addLineItem}
              style={{
                padding: "8px 16px",
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "600",
                marginBottom: "16px",
              }}
            >
              + Add Product
            </button>

            {/* Total Summary */}
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a2e" }}>Bill Total:</span>
                <span style={{ fontSize: "18px", fontWeight: "700", color: "#2563eb" }}>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="vendor-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button disabled={submitting} type="submit" className="btn-primary">
              {submitting ? "Saving..." : "Create Bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
