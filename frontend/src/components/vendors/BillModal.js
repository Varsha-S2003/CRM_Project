import React, { useEffect, useMemo, useState } from "react";
import "../../Vendors.css";
import api from "../../services/api";

const formatDateInput = (date) => {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const fallbackBillNumber = () => {
  const year = new Date().getFullYear();
  const seed = String(Date.now()).slice(-3);
  return `PUR-${year}-${seed}`;
};

const createInitialState = (defaultVendorId = "") => ({
  vendorId: defaultVendorId,
  billNumber: fallbackBillNumber(),
  purchaseDate: formatDateInput(new Date()),
  dueDate: formatDateInput(addDays(new Date(), 15)),
  paidAmount: "0",
  paymentMode: "Cash",
  notes: "",
  lineItems: [{ itemType: "product", itemId: "", product: "", quantity: 1, unitPrice: "", gstPercent: 0 }],
});

const normalize = (value) => String(value || "").trim().toLowerCase();

export default function BillModal({
  open,
  onClose,
  onSubmit,
  submitting,
  vendors = [],
  defaultVendorId = "",
  lockVendor = false,
}) {
  const [form, setForm] = useState(createInitialState(defaultVendorId));
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(createInitialState(defaultVendorId));
  }, [open, defaultVendorId]);

  useEffect(() => {
    if (!open) return;

    const fetchItems = async () => {
      try {
        setLoadingItems(true);
        const [itemsRes, billsRes] = await Promise.all([api.get("/items"), api.get("/bills")]);
        const nowYear = new Date().getFullYear();
        const yearlyCount = (Array.isArray(billsRes.data) ? billsRes.data : []).filter((bill) => {
          const sourceDate = bill?.purchaseDate || bill?.createdAt;
          return sourceDate && new Date(sourceDate).getFullYear() === nowYear;
        }).length;

        setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
        setForm((prev) => ({
          ...prev,
          billNumber: prev.billNumber || `PUR-${nowYear}-${String(yearlyCount + 1).padStart(3, "0")}`,
          dueDate: prev.dueDate || formatDateInput(addDays(new Date(prev.purchaseDate || new Date()), 15)),
        }));
      } catch (_error) {
        setItems([]);
      } finally {
        setLoadingItems(false);
      }
    };

    fetchItems();
  }, [open]);

  const selectedVendor = vendors.find((vendor) => String(vendor._id) === String(form.vendorId));

  const allowedProductNames = useMemo(
    () => new Set((selectedVendor?.productsProvided || []).map(normalize)),
    [selectedVendor]
  );

  const allowedServiceNames = useMemo(
    () => new Set((selectedVendor?.servicesProvided || []).map(normalize)),
    [selectedVendor]
  );

  const change = (event) => {
    const { name, value } = event.target;
    if (name === "vendorId") {
      setForm((prev) => ({
        ...prev,
        vendorId: value,
        lineItems: [{ itemType: "product", itemId: "", product: "", quantity: 1, unitPrice: "", gstPercent: 0 }],
      }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const changeLineItem = (index, field, value) => {
    const newLineItems = [...form.lineItems];

    if (field === "itemType") {
      newLineItems[index] = {
        itemType: value,
        itemId: "",
        product: "",
        quantity: 1,
        unitPrice: "",
        gstPercent: 0,
      };
      setForm((prev) => ({ ...prev, lineItems: newLineItems }));
      return;
    }

    if (field === "itemId") {
      const selectedItem = items.find((item) => String(item._id) === String(value));
      newLineItems[index].itemId = value;
      newLineItems[index].product = selectedItem?.name || "";
      if (selectedItem) {
        const suggestedPrice = newLineItems[index].itemType === "service"
          ? (selectedItem.cost ?? selectedItem.price)
          : (selectedItem.price ?? selectedItem.cost);
        const gst = Number(selectedItem.gst_percent ?? 0);
        newLineItems[index].unitPrice = Number.isFinite(Number(suggestedPrice)) ? String(suggestedPrice) : "";
        newLineItems[index].gstPercent = Number.isFinite(gst) ? gst : 0;
      }
      setForm((prev) => ({ ...prev, lineItems: newLineItems }));
      return;
    }

    newLineItems[index][field] = field === "quantity" ? Math.max(1, Number(value) || 0) : value;
    setForm((prev) => ({ ...prev, lineItems: newLineItems }));
  };

  const addLineItem = () => {
    setForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, { itemType: "product", itemId: "", product: "", quantity: 1, unitPrice: "", gstPercent: 0 }],
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

  const totals = useMemo(() => {
    return form.lineItems.reduce(
      (acc, item) => {
        const qty = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const gstPercent = Number(item.gstPercent || 0);
        const subtotal = qty * unitPrice;
        const tax = subtotal * (Math.max(0, Math.min(100, gstPercent)) / 100);
        acc.subtotal += subtotal;
        acc.tax += tax;
        acc.grandTotal += subtotal + tax;
        return acc;
      },
      { subtotal: 0, tax: 0, grandTotal: 0 }
    );
  }, [form.lineItems]);

  const paid = Math.min(totals.grandTotal, Math.max(0, Number(form.paidAmount || 0)));
  const remaining = Math.max(0, totals.grandTotal - paid);
  const paymentStatus = paid <= 0 ? "Unpaid" : paid >= totals.grandTotal ? "Paid" : "Partially Paid";
  const payloadPaymentStatus = paid <= 0 ? "Unpaid" : paid >= totals.grandTotal ? "Paid" : "Partial";

  const submit = async (event) => {
    event.preventDefault();

    // Validation
    if (!form.vendorId) {
      alert("Vendor is required");
      return;
    }
    if (!form.billNumber.trim()) {
      alert("Bill number is required");
      return;
    }
    if (!form.purchaseDate) {
      alert("Purchase date is required");
      return;
    }
    if (!form.dueDate) {
      alert("Due date is required");
      return;
    }

    const validItems = form.lineItems.filter(
      (item) => item.itemId && item.product.trim() && Number(item.quantity) > 0 && Number(item.unitPrice) > 0
    );
    if (validItems.length === 0) {
      alert("Add at least one valid line item");
      return;
    }

    if (paid < 0 || paid > totals.grandTotal) {
      alert("Paid amount must be between 0 and total amount");
      return;
    }

    await onSubmit({
      vendorId: form.vendorId,
      billNumber: form.billNumber,
      purchaseDate: form.purchaseDate,
      dueDate: form.dueDate,
      notes: form.notes,
      amount: totals.grandTotal,
      paidAmount: paid,
      paymentStatus: payloadPaymentStatus,
      paymentMode: form.paymentMode,
      lineItems: validItems.map((item) => ({
        itemId: item.itemId || undefined,
        type: item.itemType,
        product: item.product,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        gstPercent: Number(item.gstPercent || 0),
      })),
    });
    setForm(createInitialState(defaultVendorId));
  };

  const getOptionsByType = (type) => {
    if (!selectedVendor) return [];

    const pool = items.filter((item) => String(item.type || "product").toLowerCase() === String(type).toLowerCase());
    const allowed = type === "service" ? allowedServiceNames : allowedProductNames;

    if (!allowed.size) return [];
    return pool.filter((item) => allowed.has(normalize(item.name)));
  };

  if (!open) return null;

  return (
    <div className="vendor-modal-overlay">
      <div className="vendor-modal-dialog" style={{ width: "min(96vw, 1120px)", maxHeight: "94vh" }}>
        <div className="vendor-modal-header">
          <h2>Create Purchase</h2>
          <button type="button" className="vendor-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="vendor-modal-form" onSubmit={submit}>
          <div className="vendor-modal-content">
            <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px", color: "#1a1a2e" }}>Vendor Info</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
              <div className="form-group">
                <label className="form-label">Vendor Name *</label>
                <select
                  className="form-select"
                  name="vendorId"
                  value={form.vendorId}
                  onChange={change}
                  disabled={lockVendor}
                  required
                >
                  <option value="">Select Vendor</option>
                  {vendors.map((vendor) => (
                    <option key={vendor._id} value={vendor._id}>
                      {vendor.vendorName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">GST</label>
                <input className="form-input" value={selectedVendor?.gstNumber || "-"} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Contact</label>
                <input className="form-input" value={selectedVendor?.phone || selectedVendor?.email || "-"} readOnly />
              </div>
            </div>

            <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px", color: "#1a1a2e" }}>Bill Details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
              <div className="form-group">
                <label className="form-label">Bill Number *</label>
                <input className="form-input" name="billNumber" value={form.billNumber} onChange={change} required />
              </div>
              <div className="form-group">
                <label className="form-label">Purchase Date *</label>
                <input className="form-input" name="purchaseDate" value={form.purchaseDate} onChange={change} type="date" required />
              </div>
              <div className="form-group">
                <label className="form-label">Due Date *</label>
                <input className="form-input" name="dueDate" value={form.dueDate} onChange={change} type="date" required />
              </div>
            </div>

            <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px", color: "#1a1a2e" }}>Items Purchased</h3>
            <div style={{ overflowX: "auto", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "8px", textAlign: "left", fontWeight: "600", color: "#6b7280", width: "140px" }}>Type</th>
                    <th style={{ padding: "8px", textAlign: "left", fontWeight: "600", color: "#6b7280" }}>Product / Service</th>
                    <th style={{ padding: "8px", textAlign: "center", fontWeight: "600", color: "#6b7280", width: "100px" }}>Qty</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "120px" }}>Unit Price</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "90px" }}>GST %</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "110px" }}>Tax</th>
                    <th style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#6b7280", width: "120px" }}>Line Total</th>
                    <th style={{ padding: "8px", textAlign: "center", width: "40px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lineItems.map((item, index) => {
                    const itemTotal = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
                    const rowTax = itemTotal * (Math.max(0, Math.min(100, Number(item.gstPercent || 0))) / 100);
                    const rowTotal = itemTotal + rowTax;
                    const options = getOptionsByType(item.itemType);
                    return (
                      <tr key={index} style={{ borderBottom: "1px solid #e5e7eb" }}>
                        <td style={{ padding: "8px" }}>
                          <select
                            value={item.itemType}
                            onChange={(e) => changeLineItem(index, "itemType", e.target.value)}
                            style={{ width: "100%", padding: "6px", border: "1px solid #e5e7eb", borderRadius: "4px", fontSize: "13px" }}
                          >
                            <option value="product">Product</option>
                            <option value="service">Service</option>
                          </select>
                        </td>
                        <td style={{ padding: "8px" }}>
                          <select
                            value={item.itemId}
                            onChange={(e) => changeLineItem(index, "itemId", e.target.value)}
                            style={{ width: "100%", padding: "6px", border: "1px solid #e5e7eb", borderRadius: "4px", fontSize: "13px" }}
                            disabled={loadingItems}
                          >
                            <option value="">{loadingItems ? "Loading..." : `Select ${item.itemType}`}</option>
                            {options.map((row) => (
                              <option key={row._id} value={row._id}>
                                {row.name} ({row.category})
                              </option>
                            ))}
                          </select>
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
                        <td style={{ padding: "8px", textAlign: "right" }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={item.gstPercent}
                            onChange={(e) => changeLineItem(index, "gstPercent", e.target.value)}
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
                        <td style={{ padding: "8px", textAlign: "right", color: "#1a1a2e" }}>
                          ₹{rowTax.toFixed(2)}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "600", color: "#1a1a2e" }}>
                          ₹{rowTotal.toFixed(2)}
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
              + Add Item
            </button>

            <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px", color: "#1a1a2e" }}>Payment Info</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div className="form-group">
                <label className="form-label">Paid Amount</label>
                <input
                  className="form-input"
                  name="paidAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.paidAmount}
                  onChange={change}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Remaining (Payable)</label>
                <input className="form-input" value={`₹${remaining.toFixed(2)}`} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Status</label>
                <input className="form-input" value={paymentStatus} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-select" name="paymentMode" value={form.paymentMode} onChange={change}>
                  <option value="Cash">Cash</option>
                </select>
              </div>
            </div>

            <h3 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "12px", color: "#1a1a2e" }}>Extra</h3>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                name="notes"
                value={form.notes}
                onChange={change}
                placeholder="Optional purchase notes"
              />
            </div>

            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a2e" }}>Subtotal:</span>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#1a1a2e" }}>₹{totals.subtotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a2e" }}>GST:</span>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#1a1a2e" }}>₹{totals.tax.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a2e" }}>Grand Total:</span>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#2563eb" }}>₹{totals.grandTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "#1a1a2e" }}>Remaining Payable:</span>
                <span style={{ fontSize: "16px", fontWeight: "700", color: "#dc2626" }}>₹{remaining.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="vendor-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button disabled={submitting} type="submit" className="btn-primary">
              {submitting ? "Saving..." : "Save Purchase"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
