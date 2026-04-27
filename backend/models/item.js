const mongoose = require("mongoose");

const PRODUCT_CATEGORIES = [
  "Networking Equipment",
  "Storage Devices",
  "End User Devices",
  "Accessories",
  "Security Devices"
];
const SERVICE_CATEGORIES = [
  "Cloud Services",
  "Security",
  "Managed Services",
  "Infrastructure",
  "Backup & Recovery"
];
const SERVICE_TYPE_CATEGORY_MAP = {
  license: ["Cloud Services", "Infrastructure", "Security"],
  storage: ["Cloud Services", "Infrastructure", "Backup & Recovery"],
  subscription: ["Cloud Services", "Managed Services", "Security"]
};
const SERVICE_STATUS_VALUES = ["Active", "Inactive"];
const BILLING_CYCLE_VALUES = ["monthly", "quarterly", "6_months", "yearly"];
const STORAGE_UNIT_VALUES = ["GB", "TB"];
const normalizeServiceCategory = (category, serviceType) => {
  const value = String(category || "").trim();
  if (serviceType === "license" && value === "Licensing") {
    return "Cloud Services";
  }
  return value;
};

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
    gst_percent: {
      type: Number,
      min: 0,
      max: 100,
      default: 18
    },
    hsn_sac: {
      type: String,
      trim: true,
      default: ""
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
    reservedStock: {
      type: Number,
      default: 0,
      min: 0
    },
    soldStock: {
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
      default: "Active"
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
    this.category = normalizeServiceCategory(this.category, this.serviceType);
    this.normalizedName = this.name ? this.name.toLowerCase() : null;
    this.vendor = String(this.vendor || "").trim();
    this.provider = String(this.provider || "").trim();
    this.licenseKey = String(this.licenseKey || "").trim();
    this.hsn_sac = String(this.hsn_sac || "").trim();
    this.status = this.status || "Active";

    if (this.type === "product") {
      if (this.stock === undefined || this.stock === null) {
        this.invalidate("quantity", "quantity is required when type is product");
      }
      if (this.price === undefined || this.price === null) {
        this.invalidate("price", "price is required when type is product");
      }
      if (this.gst_percent === undefined || this.gst_percent === null || Number.isNaN(Number(this.gst_percent))) {
        this.invalidate("gst_percent", "gst_percent is required when type is product");
      } else {
        this.gst_percent = Number(this.gst_percent);
      }

      this.cost = null;
      this.serviceType = undefined;
    this.licenseKey = "";
    this.purchaseDate = null;
    this.expiryDate = null;
    this.seats = null;
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
    this.reservedStock = 0;
    this.soldStock = 0;
    this.lowStockThreshold = 0;
    this.price = null;
    if (this.gst_percent === undefined || this.gst_percent === null || Number.isNaN(Number(this.gst_percent))) {
      this.gst_percent = 18;
    } else {
      this.gst_percent = Number(this.gst_percent);
    }
    this.hsn_sac = String(this.hsn_sac || "").trim();

  if (!SERVICE_STATUS_VALUES.includes(this.status)) {
    this.invalidate("status", "status must be Active or Inactive");
  }

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
    if (this.cost === undefined || this.cost === null) {
      this.invalidate("cost", "cost is required for license services");
    }
    if (!SERVICE_STATUS_VALUES.includes(this.status)) {
      this.invalidate("status", "status must be Active or Inactive for license services");
    }

    this.licenseKey = "";
    this.purchaseDate = null;
    this.expiryDate = null;
    this.seats = null;
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
      this.invalidate("billingCycle", "billingCycle must be monthly, quarterly, 6 months, or yearly for subscription services");
    }
    if (this.cost === undefined || this.cost === null) {
      this.invalidate("cost", "cost is required for subscription services");
    }
    if (!SERVICE_STATUS_VALUES.includes(this.status)) {
      this.invalidate("status", "status must be Active or Inactive for subscription services");
    }

    this.licenseKey = "";
    this.purchaseDate = null;
    this.expiryDate = null;
    this.seats = null;
    this.vendor = "";
    this.totalStorage = null;
    this.usedStorage = null;
    this.storageUnit = "GB";
    this.provider = "";
    this.startDate = null;
    this.nextBillingDate = null;
    this.autoRenew = false;
  } else if (this.serviceType === "storage") {
    if (this.totalStorage === undefined || this.totalStorage === null) {
      this.invalidate("totalStorage", "totalStorage is required for storage services");
    }
    if (!BILLING_CYCLE_VALUES.includes(this.billingCycle)) {
      this.invalidate("billingCycle", "billingCycle must be monthly, quarterly, 6 months, or yearly for storage services");
    }
    if (this.cost === undefined || this.cost === null) {
      this.invalidate("cost", "cost is required for storage services");
    }

    this.licenseKey = "";
    this.purchaseDate = null;
    this.expiryDate = null;
    this.seats = null;
    this.usedStorage = null;
    this.startDate = null;
    this.nextBillingDate = null;
    this.autoRenew = false;
    this.vendor = "";
    this.provider = "";
  } else {
    this.invalidate("serviceType", "serviceType must be one of: license, storage, subscription");
  }
});

module.exports = mongoose.models.Item || mongoose.model("Item", itemSchema);
