import React, { useState } from "react";
import "../../Vendors.css";

const initialState = {
  billId: "",
  amount: "",
  paymentMode: "UPI",
  paymentDate: "",
};

export default function PaymentModal({ open, onClose, onSubmit, bills, submitting }) {
  const [form, setForm] = useState(initialState);

  if (!open) return null;

  const change = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    await onSubmit(form);
    setForm(initialState);
  };

  return (
    <div className="vendor-modal-overlay">
      <div className="vendor-modal-dialog">
        <div className="vendor-modal-header">
          <h2>Add Payment</h2>
          <button type="button" className="vendor-modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={submit}>
          <div className="vendor-modal-content">
            <div className="form-group">
              <label className="form-label">Bill *</label>
              <select className="form-select" name="billId" value={form.billId} onChange={change} required>
                <option value="">Select Bill</option>
                {bills.map((bill) => (
                  <option key={bill._id} value={bill._id}>
                    {bill.billNumber} - ₹{bill.amount}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Amount *</label>
              <input className="form-input" name="amount" value={form.amount} onChange={change} type="number" step="0.01" required />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Mode</label>
              <select className="form-select" name="paymentMode" value={form.paymentMode} onChange={change}>
                <option value="UPI">UPI</option>
                <option value="Bank">Bank</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Payment Date</label>
              <input className="form-input" name="paymentDate" value={form.paymentDate} onChange={change} type="date" />
            </div>
          </div>

          <div className="vendor-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button disabled={submitting} type="submit" className="btn-primary">
              {submitting ? "Saving..." : "Add Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
