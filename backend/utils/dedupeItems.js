const Item = require("../models/item");

const normalizeName = (value = "") => String(value).trim().replace(/\s+/g, " ").toLowerCase();

const applyCommonFields = (target, source) => {
  if (source.price !== undefined) target.price = source.price;
  if (source.cost !== undefined) target.cost = source.cost;
  if (source.vendor !== undefined) target.vendor = source.vendor;
  if (source.provider !== undefined) target.provider = source.provider;
  if (source.location !== undefined) target.location = source.location;
  if (source.description !== undefined) target.description = source.description;
  if (source.lowStockThreshold !== undefined) {
    target.lowStockThreshold = source.lowStockThreshold;
  }
};

const mergeGroupIntoPrimary = async (items) => {
  if (items.length < 2) return null;

  const [primary, ...duplicates] = items;
  const latest = items[items.length - 1];

  applyCommonFields(primary, latest);

  if (primary.type === "product") {
    primary.stock = items.reduce((sum, item) => sum + (item.stock || 0), 0);
  } else if (primary.serviceType === "license") {
    primary.cost = latest.cost;
    primary.status = latest.status;
  } else if (primary.serviceType === "storage") {
    primary.totalStorage = latest.totalStorage;
    primary.usedStorage = latest.usedStorage;
    primary.storageUnit = latest.storageUnit;
    primary.provider = latest.provider;
    primary.billingCycle = latest.billingCycle;
    primary.cost = latest.cost;
  } else if (primary.serviceType === "subscription") {
    primary.billingCycle = latest.billingCycle;
    primary.startDate = latest.startDate;
    primary.nextBillingDate = latest.nextBillingDate;
    primary.expiryDate = latest.expiryDate;
    primary.cost = latest.cost;
    primary.autoRenew = latest.autoRenew;
    primary.status = latest.status;
  }

  primary.name = String(primary.name || "").trim().replace(/\s+/g, " ");
  primary.normalizedName = normalizeName(primary.name);

  await primary.save();
  await Item.deleteMany({ _id: { $in: duplicates.map((item) => item._id) } });

  return {
    primaryId: String(primary._id),
    removedCount: duplicates.length
  };
};

const dedupeItems = async () => {
  const items = await Item.find({})
    .sort({ createdAt: 1, _id: 1 });

  const groups = new Map();

  for (const item of items) {
    const normalizedName = item.normalizedName || normalizeName(item.name);
    const key = item.type === "service"
      ? `service|${item.category}|${item.serviceType}|${normalizedName}`
      : `product|${item.category}|${normalizedName}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  }

  const merged = [];
  for (const group of groups.values()) {
    const result = await mergeGroupIntoPrimary(group);
    if (result) {
      merged.push(result);
    }
  }

  return merged;
};

module.exports = { dedupeItems };
