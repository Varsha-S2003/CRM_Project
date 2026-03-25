const mongoose = require("mongoose");

const PRODUCT_CATEGORIES = [
  "Networking Equipment",
  "Storage Devices",
  "End User Devices",
  "Accessories",
  "Security Devices"
];
const SERVICE_CATEGORIES = ["Cloud Services", "Security", "Managed Services", "Licensing", "Infrastructure"];
const SERVICE_TYPE_CATEGORY_MAP = {
  license: ["Licensing", "Security"],
  storage: ["Cloud Services", "Infrastructure"],
  subscription: ["Cloud Services", "Managed Services", "Security"]
};
const SERVICE_STATUS_VALUES = ["Active", "Expired"];
const BILLING_CYCLE_VALUES = ["monthly", "yearly"];
const STORAGE_UNIT_VALUES = ["GB", "TB"];

const formatServiceTypeLabel = (serviceType) =>
  String(serviceType || "").charAt(0).toUpperCase() + String(serviceType || "").slice(1);

const itemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    normalizedName: {
      type: String,
      trim: true,
      default: null
    },
    type: {
      type: String,
      enum: ["product", "service"],
      default: "product",
      required: true
    },
    category: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          if (this.type === "service") {
            if (!this.serviceType) return SERVICE_CATEGORIES.includes(value);
            return (SERVICE_TYPE_CATEGORY_MAP[this.serviceType] || []).includes(value);
          }
          return PRODUCT_CATEGORIES.includes(value);
        },
        message: "Invalid category for selected type"
      }
    },
    price: {
      type: Number,
      min: 0,
      default: null
    },
    cost: {
      type: Number,
      min: 0,
      default: null
    },

    // Product-only inventory field kept for compatibility with the existing UI.
    stock: {
      type: Number,
      default: 0,
      min: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0
    },
    vendor: {
      type: String,
      default: "",
      trim: true
    },
    location: {
      type: String,
      default: "",
      trim: true
    },

    serviceType: {
      type: String,
      enum: ["license", "storage", "subscription"],
      required: function requiredServiceType() {
        return this.type === "service";
      }
    },

    // License
    licenseKey: {
      type: String,
      trim: true,
      default: ""
    },
    purchaseDate: {
      type: Date,
      default: null
    },
    expiryDate: {
      type: Date,
      default: null
    },
    seats: {
      type: Number,
      min: 0,
      default: null
    },
    status: {
      type: String,
      enum: SERVICE_STATUS_VALUES,
      default: null
    },

    // Subscription
    billingCycle: {
      type: String,
      enum: BILLING_CYCLE_VALUES,
      default: null
    },
    startDate: {
      type: Date,
      default: null
    },
    nextBillingDate: {
      type: Date,
      default: null
    },
    autoRenew: {
      type: Boolean,
      default: false
    },

    // Storage
    totalStorage: {
      type: Number,
      min: 0,
      default: null
    },
    usedStorage: {
      type: Number,
      min: 0,
      default: null
    },
    storageUnit: {
      type: String,
      enum: STORAGE_UNIT_VALUES,
      default: "GB"
    },
    provider: {
      type: String,
      trim: true,
      default: ""
    },

    // Existing optional fields from current system for compatibility.
    sku: {
      type: String,
      trim: true,
      sparse: true
    },
    description: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true,
    collection: "products",
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

itemSchema.index(
  { type: 1, category: 1, normalizedName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "product",
      normalizedName: { $type: "string" }
    }
  }
);

itemSchema.index(
  { type: 1, category: 1, serviceType: 1, normalizedName: 1 },
  {
    unique: true,
    partialFilterExpression: {
      type: "service",
      serviceType: { $type: "string" },
      normalizedName: { $type: "string" }
    }
  }
);

itemSchema.virtual("quantity")
  .get(function getQuantity() {
    return this.stock || 0;
  })
  .set(function setQuantity(value) {
    if (value === undefined || value === null || value === "") return;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) this.stock = parsed;
  });

itemSchema.virtual("availableStorage").get(function getAvailableStorage() {
  if (this.type !== "service" || this.serviceType !== "storage") return null;
  const total = this.totalStorage || 0;
  const used = this.usedStorage || 0;
  return Math.max(total - used, 0);
});

itemSchema.pre("validate", function validateByType() {
  this.name = String(this.name || "").trim().replace(/\s+/g, " ");
  this.category = String(this.category || "").trim();
  this.normalizedName = this.name ? this.name.toLowerCase() : null;
  this.vendor = String(this.vendor || "").trim();
  this.provider = String(this.provider || "").trim();
  this.licenseKey = String(this.licenseKey || "").trim();

  if (this.type === "product") {
    if (this.stock === undefined || this.stock === null) {
      this.invalidate("quantity", "quantity is required when type is product");
    }
    if (this.price === undefined || this.price === null) {
      this.invalidate("price", "price is required when type is product");
    }

    this.cost = null;
    this.serviceType = undefined;
    this.licenseKey = "";
    this.purchaseDate = null;
    this.expiryDate = null;
    this.seats = null;
    this.status = null;
    this.billingCycle = null;
    this.startDate = null;
    this.nextBillingDate = null;
    this.autoRenew = false;
    this.totalStorage = null;
    this.usedStorage = null;
    this.storageUnit = "GB";
    this.provider = "";
    return;
  }

  this.stock = 0;
  this.lowStockThreshold = 0;
  this.price = null;

  if (this.serviceType) {
    const allowedCategories = SERVICE_TYPE_CATEGORY_MAP[this.serviceType] || [];
    if (!allowedCategories.includes(this.category)) {
      this.invalidate(
        "category",
        `For ${formatServiceTypeLabel(this.serviceType)}, category must be one of: ${allowedCategories.join(", ")}`
      );
    }
  }

  if (this.serviceType === "license") {
    if (!this.licenseKey) {
      this.invalidate("licenseKey", "licenseKey is required for license services");
    }
    if (!this.purchaseDate) {
      this.invalidate("purchaseDate", "purchaseDate is required for license services");
    }
    if (!this.expiryDate) {
      this.invalidate("expiryDate", "expiryDate is required for license services");
    }
    if (this.seats === undefined || this.seats === null) {
      this.invalidate("seats", "seats is required for license services");
    }
    if (this.cost === undefined || this.cost === null) {
      this.invalidate("cost", "cost is required for license services");
    }
    if (!SERVICE_STATUS_VALUES.includes(this.status)) {
      this.invalidate("status", "status must be Active or Expired for license services");
    }

    this.vendor = "";
    this.billingCycle = null;
    this.startDate = null;
    this.nextBillingDate = null;
    this.autoRenew = false;
    this.totalStorage = null;
    this.usedStorage = null;
    this.storageUnit = "GB";
    this.provider = "";
  } else if (this.serviceType === "subscription") {
    if (!BILLING_CYCLE_VALUES.includes(this.billingCycle)) {
      this.invalidate("billingCycle", "billingCycle must be monthly or yearly for subscription services");
    }
    if (!this.startDate) {
      this.invalidate("startDate", "startDate is required for subscription services");
    }
    if (!this.nextBillingDate) {
      this.invalidate("nextBillingDate", "nextBillingDate is required for subscription services");
    }
    if (this.cost === undefined || this.cost === null) {
      this.invalidate("cost", "cost is required for subscription services");
    }
    if (!SERVICE_STATUS_VALUES.includes(this.status)) {
      this.invalidate("status", "status must be Active or Expired for subscription services");
    }

    this.licenseKey = "";
    this.purchaseDate = null;
    this.seats = null;
    this.vendor = "";
    this.totalStorage = null;
    this.usedStorage = null;
    this.storageUnit = "GB";
    this.provider = "";
  } else if (this.serviceType === "storage") {
    if (this.totalStorage === undefined || this.totalStorage === null) {
      this.invalidate("totalStorage", "totalStorage is required for storage services");
    }
    if (this.usedStorage === undefined || this.usedStorage === null) {
      this.invalidate("usedStorage", "usedStorage is required for storage services");
    }
    if (!this.provider) {
      this.invalidate("provider", "provider is required for storage services");
    }
    if (!BILLING_CYCLE_VALUES.includes(this.billingCycle)) {
      this.invalidate("billingCycle", "billingCycle must be monthly or yearly for storage services");
    }
    if (this.cost === undefined || this.cost === null) {
      this.invalidate("cost", "cost is required for storage services");
    }
    if ((this.usedStorage || 0) > (this.totalStorage || 0)) {
      this.invalidate("usedStorage", "usedStorage cannot be greater than totalStorage");
    }

    this.licenseKey = "";
    this.purchaseDate = null;
    this.expiryDate = null;
    this.seats = null;
    this.status = null;
    this.startDate = null;
    this.nextBillingDate = null;
    this.autoRenew = false;
    this.vendor = "";
  } else {
    this.invalidate("serviceType", "serviceType must be one of: license, storage, subscription");
  }
});

module.exports = mongoose.models.Item || mongoose.model("Item", itemSchema);
