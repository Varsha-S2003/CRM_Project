const Item = require("../models/item");

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
const BILLING_CYCLE_VALUES = ["monthly", "yearly"];
const STORAGE_UNIT_VALUES = ["GB", "TB"];
const SERVICE_STATUS_VALUES = ["Active", "Expired"];

const CATEGORY_SKU_PREFIX = {
  "Networking Equipment": "NET",
  "Storage Devices": "STO",
  "End User Devices": "END",
  "Accessories": "ACC",
  "Security Devices": "SEC"
};
const SERVICE_CATEGORY_SKU_PREFIX = {
  "Cloud Services": "CLD",
  Security: "SVS",
  "Managed Services": "MNG",
  Licensing: "LIC",
  Infrastructure: "INF"
};

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseDate = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeName = (value = "") => String(value).trim().replace(/\s+/g, " ");
const normalizeProductName = (value = "") => normalizeName(value).toLowerCase();
const formatServiceTypeLabel = (serviceType) =>
  String(serviceType || "").charAt(0).toUpperCase() + String(serviceType || "").slice(1);

const getNameSkuPart = (name = "") => {
  const words = String(name)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "ITEM";
  return words[words.length - 1];
};

const generateProductSku = async ({ name, category }) => {
  const categoryPrefix = CATEGORY_SKU_PREFIX[category] || "PRD";
  const namePart = getNameSkuPart(name);
  const base = `${categoryPrefix}-${namePart}`;
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);

  const existing = await Item.find({ type: "product", sku: { $regex: `^${base}-` } }).select("sku");

  let maxNumber = 0;
  for (const row of existing) {
    const match = String(row.sku || "").match(pattern);
    if (!match) continue;
    const current = Number(match[1]);
    if (Number.isFinite(current) && current > maxNumber) {
      maxNumber = current;
    }
  }

  const next = String(maxNumber + 1).padStart(3, "0");
  return `${base}-${next}`;
};

const generateServiceSku = async ({ name, category }) => {
  const categoryPrefix = SERVICE_CATEGORY_SKU_PREFIX[category] || "SVC";
  const namePart = getNameSkuPart(name);
  const base = `${categoryPrefix}-${namePart}`;
  const pattern = new RegExp(`^${escapeRegex(base)}-(\\d+)$`);

  const existing = await Item.find({ type: "service", sku: { $regex: `^${base}-` } }).select("sku");

  let maxNumber = 0;
  for (const row of existing) {
    const match = String(row.sku || "").match(pattern);
    if (!match) continue;
    const current = Number(match[1]);
    if (Number.isFinite(current) && current > maxNumber) {
      maxNumber = current;
    }
  }

  const next = String(maxNumber + 1).padStart(3, "0");
  return `${base}-${next}`;
};

const findMatchingProducts = async ({ name, category }) => {
  const normalizedName = normalizeProductName(name);

  return Item.find({
    type: "product",
    category,
    $or: [
      { normalizedName },
      { name: { $regex: `^${escapeRegex(normalizeName(name))}$`, $options: "i" } }
    ]
  }).sort({ createdAt: 1, _id: 1 });
};

const findMatchingServices = async ({ name, category, serviceType }) => {
  const normalizedName = normalizeProductName(name);

  return Item.find({
    type: "service",
    category,
    serviceType,
    $or: [
      { normalizedName },
      { name: { $regex: `^${escapeRegex(normalizeName(name))}$`, $options: "i" } }
    ]
  }).sort({ createdAt: 1, _id: 1 });
};

const applyCommonItemFields = (target, payload) => {
  if (payload.price !== undefined) target.price = payload.price;
  if (payload.cost !== undefined) target.cost = payload.cost;
  if (payload.vendor !== undefined) target.vendor = payload.vendor;
  if (payload.location !== undefined) target.location = payload.location;
  if (payload.description !== undefined) target.description = payload.description;
  if (payload.lowStockThreshold !== undefined) {
    target.lowStockThreshold = payload.lowStockThreshold;
  }
};

const mergeServiceValues = (target, payload) => {
  if (payload.serviceType === "license") {
    target.licenseKey = payload.licenseKey;
    target.purchaseDate = payload.purchaseDate;
    target.expiryDate = payload.expiryDate;
    target.seats = payload.seats;
    target.cost = payload.cost;
    target.status = payload.status;
    return;
  }

  if (payload.serviceType === "storage") {
    target.totalStorage = payload.totalStorage;
    target.usedStorage = payload.usedStorage;
    target.provider = payload.provider;
    target.storageUnit = payload.storageUnit;
    target.billingCycle = payload.billingCycle;
    target.cost = payload.cost;
    return;
  }

  target.billingCycle = payload.billingCycle;
  target.startDate = payload.startDate;
  target.nextBillingDate = payload.nextBillingDate;
  target.expiryDate = payload.expiryDate;
  target.cost = payload.cost;
  target.autoRenew = payload.autoRenew;
  target.status = payload.status;
};

const buildItemPayload = (body, existing = null) => {
  const source = existing ? { ...existing.toObject(), ...body } : body;
  const errors = [];

  const payload = {
    name: normalizeName(source.name),
    type: source.type === "service" ? "service" : "product",
    category: String(source.category || "").trim(),
    price: parseNumber(source.price),
    cost: parseNumber(source.cost),
    vendor: String(source.vendor || "").trim(),
    location: String(source.location || "").trim(),
    lowStockThreshold: parseNumber(source.lowStockThreshold ?? 5),
    description: String(source.description || "").trim()
  };

  if (!payload.name || !payload.category) {
    errors.push("name and category are required");
  }

  if (payload.type === "product" && payload.category && !PRODUCT_CATEGORIES.includes(payload.category)) {
    errors.push(`for product, category must be one of: ${PRODUCT_CATEGORIES.join(", ")}`);
  }

  if (payload.type === "service" && payload.category && !SERVICE_CATEGORIES.includes(payload.category)) {
    errors.push(`for service, category must be one of: ${SERVICE_CATEGORIES.join(", ")}`);
  }

  if (payload.type === "product") {
    if (Number.isNaN(payload.price) || payload.price === undefined || payload.price < 0) {
      errors.push("price must be a non-negative number");
    }

    if (Number.isNaN(payload.lowStockThreshold) || payload.lowStockThreshold < 0) {
      errors.push("lowStockThreshold must be a non-negative number");
    }

    const quantity = parseNumber(source.quantity ?? source.stock);
    if (quantity === undefined || Number.isNaN(quantity) || quantity < 0) {
      errors.push("quantity is required for product and must be a non-negative number");
    } else {
      payload.stock = quantity;
      payload.normalizedName = normalizeProductName(payload.name);
    }

    return { payload, errors };
  }

  if (!source.serviceType) {
    errors.push("serviceType is required for service");
    return { payload, errors };
  }

  payload.serviceType = source.serviceType;
  payload.normalizedName = normalizeProductName(payload.name);

  const allowedServiceCategories = SERVICE_TYPE_CATEGORY_MAP[source.serviceType];
  if (!allowedServiceCategories) {
    errors.push("serviceType must be one of: license, storage, subscription");
    return { payload, errors };
  }

  if (payload.category && SERVICE_CATEGORIES.includes(payload.category) && !allowedServiceCategories.includes(payload.category)) {
    errors.push(
      `For ${formatServiceTypeLabel(source.serviceType)}, category must be one of: ${allowedServiceCategories.join(", ")}`
    );
  }

  if (source.serviceType === "license") {
    const purchaseDate = parseDate(source.purchaseDate);
    const expiryDate = parseDate(source.expiryDate);
    const seats = parseNumber(source.seats);
    const cost = parseNumber(source.cost);

    payload.licenseKey = String(source.licenseKey || "").trim();
    payload.purchaseDate = purchaseDate;
    payload.expiryDate = expiryDate;
    payload.seats = seats;
    payload.cost = cost;
    payload.status = String(source.status || "").trim();

    if (!payload.licenseKey) {
      errors.push("licenseKey is required for license services");
    }
    if (purchaseDate === undefined) {
      errors.push("purchaseDate is required for license services");
    } else if (purchaseDate === null) {
      errors.push("purchaseDate must be a valid date");
    }
    if (expiryDate === undefined) {
      errors.push("expiryDate is required for license services");
    } else if (expiryDate === null) {
      errors.push("expiryDate must be a valid date");
    }
    if (seats === undefined || Number.isNaN(seats) || seats < 0) {
      errors.push("seats is required for license services and must be a non-negative number");
    }
    if (Number.isNaN(cost) || cost === undefined || cost < 0) {
      errors.push("cost is required for license services and must be a non-negative number");
    }
    if (!SERVICE_STATUS_VALUES.includes(payload.status)) {
      errors.push("status must be Active or Expired for license services");
    }
  }

  if (source.serviceType === "subscription") {
    const startDate = parseDate(source.startDate);
    const nextBillingDate = parseDate(source.nextBillingDate);
    const expiryDate = parseDate(source.expiryDate);
    const cost = parseNumber(source.cost);

    payload.billingCycle = source.billingCycle;
    payload.startDate = startDate;
    payload.nextBillingDate = nextBillingDate;
    payload.expiryDate = expiryDate ?? undefined;
    payload.cost = cost;
    payload.autoRenew = Boolean(source.autoRenew);
    payload.status = String(source.status || "").trim();

    if (!BILLING_CYCLE_VALUES.includes(source.billingCycle)) {
      errors.push("billingCycle is required and must be monthly or yearly for subscription services");
    }
    if (startDate === undefined) {
      errors.push("startDate is required for subscription services");
    } else if (startDate === null) {
      errors.push("startDate must be a valid date");
    }
    if (nextBillingDate === undefined) {
      errors.push("nextBillingDate is required for subscription services");
    } else if (nextBillingDate === null) {
      errors.push("nextBillingDate must be a valid date");
    }
    if (expiryDate === null) {
      errors.push("expiryDate must be a valid date");
    }
    if (Number.isNaN(cost) || cost === undefined || cost < 0) {
      errors.push("cost is required for subscription services and must be a non-negative number");
    }
    if (!SERVICE_STATUS_VALUES.includes(payload.status)) {
      errors.push("status must be Active or Expired for subscription services");
    }
    if (startDate && nextBillingDate && startDate > nextBillingDate) {
      errors.push("startDate cannot be after nextBillingDate");
    }
    if (startDate && expiryDate && startDate > expiryDate) {
      errors.push("startDate cannot be after expiryDate");
    }
  }

  if (source.serviceType === "storage") {
    const totalStorage = parseNumber(source.totalStorage);
    const usedStorage = parseNumber(source.usedStorage);
    const cost = parseNumber(source.cost);

    payload.totalStorage = totalStorage;
    payload.usedStorage = usedStorage;
    payload.provider = String(source.provider || "").trim();
    payload.storageUnit = source.storageUnit;
    payload.billingCycle = source.billingCycle;
    payload.cost = cost;

    if (totalStorage === undefined || Number.isNaN(totalStorage) || totalStorage <= 0) {
      errors.push("totalStorage is required for storage services and must be greater than 0");
    }
    if (usedStorage === undefined || Number.isNaN(usedStorage) || usedStorage < 0) {
      errors.push("usedStorage is required for storage services and must be a non-negative number");
    }
    if (!payload.provider) {
      errors.push("provider is required for storage services");
    }
    if (!STORAGE_UNIT_VALUES.includes(payload.storageUnit)) {
      errors.push("storageUnit must be GB or TB for storage services");
    }
    if (!BILLING_CYCLE_VALUES.includes(source.billingCycle)) {
      errors.push("billingCycle is required and must be monthly or yearly for storage services");
    }
    if (Number.isNaN(cost) || cost === undefined || cost < 0) {
      errors.push("cost is required for storage services and must be a non-negative number");
    }
    if (
      totalStorage !== undefined &&
      usedStorage !== undefined &&
      !Number.isNaN(totalStorage) &&
      !Number.isNaN(usedStorage) &&
      usedStorage > totalStorage
    ) {
      errors.push("usedStorage cannot be greater than totalStorage");
    }
  }

  payload.stock = 0;
  payload.lowStockThreshold = 0;
  return { payload, errors };
};

const createItem = async (req, res) => {
  try {
    const { payload, errors } = buildItemPayload(req.body);

    if (errors.length) {
      return res.status(400).json({ message: errors.join(". ") });
    }

    if (payload.type === "product") {
      const matchingProducts = await findMatchingProducts({
        name: payload.name,
        category: payload.category
      });

      if (matchingProducts.length > 0) {
        const [primaryProduct, ...duplicateProducts] = matchingProducts;
        const mergedStock =
          matchingProducts.reduce((sum, product) => sum + (product.stock || 0), 0) + (payload.stock || 0);

        primaryProduct.stock = mergedStock;
        applyCommonItemFields(primaryProduct, payload);

        await primaryProduct.save();

        if (duplicateProducts.length > 0) {
          await Item.deleteMany({
            _id: { $in: duplicateProducts.map((product) => product._id) }
          });
        }

        return res.status(200).json({
          message: "Product quantity updated",
          merged: true,
          item: primaryProduct
        });
      }

      payload.sku = await generateProductSku({
        name: payload.name,
        category: payload.category
      });
    } else {
      const matchingServices = await findMatchingServices({
        name: payload.name,
        category: payload.category,
        serviceType: payload.serviceType
      });

      if (matchingServices.length > 0) {
        const [primaryService, ...duplicateServices] = matchingServices;

        applyCommonItemFields(primaryService, payload);
        mergeServiceValues(primaryService, payload);

        await primaryService.save();

        if (duplicateServices.length > 0) {
          await Item.deleteMany({
            _id: { $in: duplicateServices.map((item) => item._id) }
          });
        }

        return res.status(200).json({
          message: "Service already exists. Details updated.",
          merged: true,
          item: primaryService
        });
      }

      payload.sku = await generateServiceSku({
        name: payload.name,
        category: payload.category
      });
    }

    const item = await Item.create(payload);
    return res.status(201).json({
      message: "Item created successfully",
      merged: false,
      item
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "An item with the same identity already exists."
      });
    }
    return res.status(500).json({ message: error.message });
  }
};

const getItems = async (req, res) => {
  try {
    const { search, type } = req.query;
    const filter = {};

    if (type && ["product", "service"].includes(type)) {
      filter.type = type;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { vendor: { $regex: search, $options: "i" } },
        { provider: { $regex: search, $options: "i" } },
        { serviceType: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } }
      ];
    }

    const items = await Item.find(filter).sort({ createdAt: -1 });
    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    return res.json(item);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateItem = async (req, res) => {
  try {
    const existing = await Item.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Item not found" });
    }

    const { payload, errors } = buildItemPayload(req.body, existing);
    if (errors.length) {
      return res.status(400).json({ message: errors.join(". ") });
    }

    if (payload.type === "product") {
      const duplicate = await Item.findOne({
        _id: { $ne: existing._id },
        type: "product",
        category: payload.category,
        normalizedName: payload.normalizedName
      }).select("_id");

      if (duplicate) {
        return res.status(409).json({
          message: "A product with the same name and category already exists."
        });
      }
    } else {
      const duplicate = await Item.findOne({
        _id: { $ne: existing._id },
        type: "service",
        category: payload.category,
        serviceType: payload.serviceType,
        normalizedName: payload.normalizedName
      }).select("_id");

      if (duplicate) {
        return res.status(409).json({
          message: "A service with the same name, category, and service type already exists."
        });
      }
    }

    if (!existing.sku) {
      payload.sku = payload.type === "product"
        ? await generateProductSku({ name: payload.name, category: payload.category })
        : await generateServiceSku({ name: payload.name, category: payload.category });
    }

    Object.assign(existing, payload);
    await existing.save();

    return res.json(existing);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteItem = async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    return res.json({ message: "Item deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem
};
