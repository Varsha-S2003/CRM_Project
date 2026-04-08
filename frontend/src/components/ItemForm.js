import { useEffect, useState } from "react";

const PRODUCT_CATEGORIES = [
  "Networking Equipment",
  "Storage Devices",
  "End User Devices",
  "Accessories",
  "Security Devices"
];
const normalizeServiceCategory = (category, serviceType) => {
  const value = String(category || "").trim();
  if (serviceType === "license" && value === "Licensing") {
    return "Cloud Services";
  }
  return value;
};
const SERVICE_TYPE_CATEGORY_MAP = {
  license: ["Cloud Services", "Infrastructure", "Security"],
  storage: ["Cloud Services", "Infrastructure", "Backup & Recovery"],
  subscription: ["Cloud Services", "Managed Services", "Security"]
};

const defaultValues = {
  name: "",
  type: "product",
  category: "",
  price: "",
  gst_percent: "18",
  hsn_sac: "",
  quantity: "",
  lowStockThreshold: "5",
  vendor: "",
  location: "",
  serviceType: "",
  status: "Active",
  billingCycle: "monthly",
  cost: "",
  totalStorage: "",
  storageUnit: "GB",
  description: ""
};

const normalizeForForm = (item = {}) => {
  const type = item.type === "service" ? "service" : "product";
  const serviceType = item.serviceType || "";

  return {
    ...defaultValues,
    ...item,
    type,
    serviceType,
    category: type === "service" ? normalizeServiceCategory(item.category, serviceType) : item.category || "",
    price: item.price !== undefined && item.price !== null ? String(item.price) : "",
    gst_percent:
      item.gst_percent !== undefined && item.gst_percent !== null ? String(item.gst_percent) : "18",
    hsn_sac: item.hsn_sac || "",
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
    totalStorage:
      item.totalStorage !== undefined && item.totalStorage !== null ? String(item.totalStorage) : "",
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
    payload.gst_percent = Number(form.gst_percent);
    payload.hsn_sac = form.hsn_sac.trim();
    payload.quantity = Number(form.quantity);
    payload.lowStockThreshold = Number(form.lowStockThreshold || 5);
    payload.vendor = form.vendor.trim();
    payload.status = form.status;
    return payload;
  }

  payload.serviceType = form.serviceType;

  if (form.serviceType === "license") {
    payload.cost = Number(form.cost);
    payload.status = form.status;
  }

  if (form.serviceType === "subscription") {
    payload.billingCycle = form.billingCycle;
    payload.cost = Number(form.cost);
    payload.status = form.status;
  }

  if (form.serviceType === "storage") {
    payload.totalStorage = Number(form.totalStorage);
    payload.storageUnit = form.storageUnit;
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
  vendor: "",
  status: "Active",
  billingCycle: "monthly",
  cost: "",
  totalStorage: "",
  storageUnit: "GB",
});

function ItemForm({
  initialItem,
  onSubmit,
  onCancel,
  submitLabel = "Save"
}) {
  const isEditing = Boolean(initialItem);
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
          {isEditing && (
            <div className="form-group">
              <label>Status *</label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                required
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          )}
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
                <label>GST % *</label>
                <select
                  value={form.gst_percent}
                  onChange={(e) => update("gst_percent", e.target.value)}
                  required
                >
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
              <div className="form-group">
                <label>HSN/SAC Code</label>
                <input
                  type="text"
                  value={form.hsn_sac}
                  onChange={(e) => update("hsn_sac", e.target.value)}
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
