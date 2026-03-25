const mongoose = require("mongoose");

const CATEGORY_SKU_PREFIX = {
  "Networking Equipment": "NET",
  "Storage Devices": "STO",
  "End User Devices": "END",
  "Accessories": "ACC",
  "Security Devices": "SEC",
  "Networking": "NET",
  "Hardware": "HRD",
  "Devices": "DEV"
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getNameSkuPart = (name = "") => {
  const words = String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "ITEM";
  return words[words.length - 1];
};

const productSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  sku: { 
    type: String, 
    sparse: true,
    trim: true
  },
  category: { 
    type: String, 
    required: true 
  },
  price: { 
    type: Number, 
    required: true,
    min: 0 
  },
  description: { 
    type: String 
  },
  stock: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

productSchema.index({ sku: 1 }, { unique: true, sparse: true });

productSchema.pre("validate", async function ensureSkuGenerated() {
  if (this.sku) return;

  const categoryPrefix = CATEGORY_SKU_PREFIX[this.category] || "PRD";
  const namePart = getNameSkuPart(this.name);
  const base = `${categoryPrefix}-${namePart}`;
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);

  const existing = await mongoose.model("Product")
    .find({ sku: { $regex: `^${base}-` } })
    .select("sku");

  let maxNumber = 0;
  for (const row of existing) {
    const match = String(row.sku || "").match(pattern);
    if (!match) continue;
    const current = Number(match[1]);
    if (Number.isFinite(current) && current > maxNumber) {
      maxNumber = current;
    }
  }

  this.sku = `${base}-${String(maxNumber + 1).padStart(3, "0")}`;
});

module.exports = mongoose.model("Product", productSchema);

