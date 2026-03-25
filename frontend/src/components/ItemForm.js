import { useEffect, useMemo, useState } from "react";

const PRODUCT_CATEGORIES = [
  "Networking Equipment",
  "Storage Devices",
  "End User Devices",
  "Accessories",
  "Security Devices"
];
const SERVICE_TYPE_CATEGORY_MAP = {
  license: ["Licensing", "Security"],
  storage: ["Cloud Services", "Infrastructure"],
  subscription: ["Cloud Services", "Managed Services", "Security"]
};

const defaultValues = {
  name: "",
  type: "product",
  category: "",
  price: "",
  quantity: "",
  lowStockThreshold: "5",
  vendor: "",
  location: "",
  serviceType: "",
  licenseKey: "",
  purchaseDate: "",
  expiryDate: "",
  seats: "",
  status: "Active",
  billingCycle: "monthly",
  startDate: "",
  nextBillingDate: "",
  cost: "",
  autoRenew: false,
  totalStorage: "",
  usedStorage: "",
  storageUnit: "GB",
  provider: "",
  description: ""
};

const normalizeDate = (value) => (value ? new Date(value).toISOString().split("T")[0] : "");

const normalizeForForm = (item = {}) => {
  const type = item.type === "service" ? "service" : "product";

  return {
    ...defaultValues,
    ...item,
    type,
    price: item.price !== undefined && item.price !== null ? String(item.price) : "",
    cost: item.cost !== undefined && item.cost !== null ? String(item.cost) : "",
    quantity:
      item.quantity !== undefined && item.quantity !== null
        ? String(item.quantity)
        : item.stock !== undefined && item.stock !== null
          ? String(item.stock)
          : "",
    lowStockThreshold:
      item.lowStockThreshold !== undefined && item.lowStockThreshold !== null
        ? String(item.lowStockThreshold)
        : "5",
    seats: item.seats !== undefined && item.seats !== null ? String(item.seats) : "",
    totalStorage:
      item.totalStorage !== undefined && item.totalStorage !== null ? String(item.totalStorage) : "",
    usedStorage:
      item.usedStorage !== undefined && item.usedStorage !== null ? String(item.usedStorage) : "",
    purchaseDate: normalizeDate(item.purchaseDate),
    expiryDate: normalizeDate(item.expiryDate),
    startDate: normalizeDate(item.startDate),
    nextBillingDate: normalizeDate(item.nextBillingDate),
    autoRenew: Boolean(item.autoRenew),
    status: item.status || "Active",
    storageUnit: item.storageUnit || "GB"
  };
};

const toPayload = (form) => {
  const payload = {
    name: form.name.trim(),
    type: form.type,
    category: form.category.trim(),
    location: form.location.trim(),
    description: form.description.trim()
  };

  if (form.type === "product") {
    payload.price = Number(form.price);
    payload.quantity = Number(form.quantity);
    payload.lowStockThreshold = Number(form.lowStockThreshold || 5);
    payload.vendor = form.vendor.trim();
    return payload;
  }

  payload.serviceType = form.serviceType;

  if (form.serviceType === "license") {
    payload.licenseKey = form.licenseKey.trim();
    payload.purchaseDate = form.purchaseDate || null;
    payload.expiryDate = form.expiryDate || null;
    payload.seats = Number(form.seats);
    payload.cost = Number(form.cost);
    payload.status = form.status;
  }

  if (form.serviceType === "subscription") {
    payload.billingCycle = form.billingCycle;
    payload.startDate = form.startDate || null;
    payload.nextBillingDate = form.nextBillingDate || null;
    payload.expiryDate = form.expiryDate || null;
    payload.cost = Number(form.cost);
    payload.autoRenew = Boolean(form.autoRenew);
    payload.status = form.status;
  }

  if (form.serviceType === "storage") {
    payload.totalStorage = Number(form.totalStorage);
    payload.usedStorage = Number(form.usedStorage);
    payload.storageUnit = form.storageUnit;
    payload.provider = form.provider.trim();
    payload.billingCycle = form.billingCycle;
    payload.cost = Number(form.cost);
  }

  return payload;
};

const getCategoryOptions = (type, serviceType) => {
  if (type !== "service") {
    return PRODUCT_CATEGORIES;
  }

  return SERVICE_TYPE_CATEGORY_MAP[serviceType] || [];
};

const getResetServiceFields = () => ({
  licenseKey: "",
  vendor: "",
  purchaseDate: "",
  expiryDate: "",
  seats: "",
  status: "Active",
  billingCycle: "monthly",
  startDate: "",
  nextBillingDate: "",
  cost: "",
  autoRenew: false,
  totalStorage: "",
  usedStorage: "",
  storageUnit: "GB",
  provider: ""
});

function ItemForm({
  initialItem,
  onSubmit,
  onCancel,
  submitLabel = "Save"
}) {
  const [form, setForm] = useState(() => normalizeForForm(initialItem));
  const [categoryOptions, setCategoryOptions] = useState(() => {
    const initialForm = normalizeForForm(initialItem);
    return getCategoryOptions(initialForm.type, initialForm.serviceType);
  });
  const [categoryError, setCategoryError] = useState("");

  useEffect(() => {
    const nextForm = normalizeForForm(initialItem);
    setForm(nextForm);
    setCategoryOptions(getCategoryOptions(nextForm.type, nextForm.serviceType));
  }, [initialItem]);

  useEffect(() => {
    const options = getCategoryOptions(form.type, form.serviceType);
    setCategoryOptions(options);

    if (form.category && !options.includes(form.category)) {
      setForm((prev) => ({ ...prev, category: "" }));
    }
  }, [form.type, form.serviceType, form.category]);

  const availableStorage = useMemo(() => {
    const total = Number(form.totalStorage || 0);
    const used = Number(form.usedStorage || 0);
    return Math.max(total - used, 0);
  }, [form.totalStorage, form.usedStorage]);

  const update = (key, value) => {
    setCategoryError("");
    setForm((prev) => {
      if (key === "type") {
        if (value === "product") {
          return {
            ...prev,
            type: value,
            category: "",
            serviceType: "",
            ...getResetServiceFields()
          };
        }

        return {
          ...prev,
          type: value,
          category: "",
          serviceType: prev.serviceType
        };
      }

      if (key === "serviceType") {
        return {
          ...prev,
          ...getResetServiceFields(),
          serviceType: value,
          category: ""
        };
      }

      return { ...prev, [key]: value };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.category || !categoryOptions.includes(form.category)) {
      setCategoryError("Please select a valid category for the selected type.");
      return;
    }

    onSubmit(toPayload(form));
  };

  return (
    <form onSubmit={handleSubmit} className="modal-form-zoho">
      <div className="form-section">
        <h3>Common</h3>
        <div className="form-row-zoho">
          <div className="form-group">
            <label>Type *</label>
            <select
              value={form.type}
              onChange={(e) => update("type", e.target.value)}
              required
            >
              <option value="product">Product</option>
              <option value="service">Service</option>
            </select>
          </div>
        </div>
      </div>

      {form.type === "product" && (
        <>
          <div className="form-section">
            <h3>Product Basic Info</h3>
            <div className="form-row-zoho">
              <div className="form-group">
                <label>Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                  required
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {categoryError && <small className="error-text">{categoryError}</small>}
              </div>
            </div>
            <div className="form-row-zoho">
              <div className="form-group">
                <label>Price *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row-zoho">
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Inventory</h3>
            <div className="form-row-zoho">
              <div className="form-group">
                <label>Quantity *</label>
                <input
                  type="number"
                  min="0"
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Low Stock Threshold</label>
                <input
                  type="number"
                  min="0"
                  value={form.lowStockThreshold}
                  onChange={(e) => update("lowStockThreshold", e.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {form.type === "service" && (
        <>
          <div className="form-section">
            <h3>Service Basic Info</h3>
            <div className="form-row-zoho">
              <div className="form-group">
                <label>Service Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="form-row-zoho">
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>Service Type</h3>
            <div className="form-row-zoho">
              <div className="form-group">
                <label>Service Type *</label>
                <select
                  value={form.serviceType}
                  onChange={(e) => update("serviceType", e.target.value)}
                  required
                >
                  <option value="">Select service type</option>
                  <option value="license">License</option>
                  <option value="storage">Storage</option>
                  <option value="subscription">Subscription</option>
                </select>
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                  required
                  disabled={!form.serviceType}
                >
                  <option value="">
                    {form.serviceType ? "Select category" : "Select service type first"}
                  </option>
                  {categoryOptions.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {categoryError && <small className="error-text">{categoryError}</small>}
              </div>
            </div>
          </div>

          {form.serviceType === "license" && (
            <div className="form-section">
              <h3>License Fields</h3>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>License Key *</label>
                  <input
                    type="text"
                    value={form.licenseKey}
                    onChange={(e) => update("licenseKey", e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Cost *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => update("cost", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Purchase Date *</label>
                  <input
                    type="date"
                    value={form.purchaseDate}
                    onChange={(e) => update("purchaseDate", e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Expiry Date *</label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => update("expiryDate", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Seats *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.seats}
                    onChange={(e) => update("seats", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {form.serviceType === "subscription" && (
            <div className="form-section">
              <h3>Subscription Fields</h3>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Billing Cycle *</label>
                  <select
                    value={form.billingCycle}
                    onChange={(e) => update("billingCycle", e.target.value)}
                    required
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Cost *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => update("cost", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => update("startDate", e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Next Billing Date *</label>
                  <input
                    type="date"
                    value={form.nextBillingDate}
                    onChange={(e) => update("nextBillingDate", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Auto Renew</label>
                  <select
                    value={form.autoRenew ? "true" : "false"}
                    onChange={(e) => update("autoRenew", e.target.value === "true")}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {form.serviceType === "storage" && (
            <div className="form-section">
              <h3>Storage Fields</h3>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Total Storage *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.totalStorage}
                    onChange={(e) => update("totalStorage", e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Used Storage *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.usedStorage}
                    onChange={(e) => update("usedStorage", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Available Storage</label>
                  <input
                    type="text"
                    value={`${availableStorage} ${form.storageUnit}`}
                    disabled
                    className="disabled-input"
                  />
                </div>
                <div className="form-group">
                  <label>Storage Unit *</label>
                  <select
                    value={form.storageUnit}
                    onChange={(e) => update("storageUnit", e.target.value)}
                    required
                  >
                    <option value="GB">GB</option>
                    <option value="TB">TB</option>
                  </select>
                </div>
              </div>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Billing Cycle *</label>
                  <select
                    value={form.billingCycle}
                    onChange={(e) => update("billingCycle", e.target.value)}
                    required
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              <div className="form-row-zoho">
                <div className="form-group">
                  <label>Cost *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost}
                    onChange={(e) => update("cost", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn-cancel" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-submit">{submitLabel}</button>
      </div>
    </form>
  );
}

export default ItemForm;
