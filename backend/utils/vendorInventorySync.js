const Item = require("../models/item");
const Bill = require("../models/bill");

const DEFAULT_CATEGORY = "Accessories";
const CATEGORY_SKU_PREFIX = {
  "Networking Equipment": "NET",
  "Storage Devices": "STO",
  "End User Devices": "END",
  Accessories: "ACC",
  "Security Devices": "SEC",
};

const normalizeName = (value) => String(value || "").trim().replace(/\s+/g, " ");
const normalizeLookupName = (value) => normalizeName(value).toLowerCase();
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

  return `${base}-${String(maxNumber + 1).padStart(3, "0")}`;
};

const syncLineItemToInventory = async ({ lineItem, vendorName }) => {
  const lineType = String(lineItem?.type || "product").toLowerCase();
  if (lineType === "service") {
    return { skipped: true, reason: "service_line_item" };
  }

  const name = normalizeName(lineItem?.product);
  const quantity = Number(lineItem?.quantity || 0);
  const unitPrice = Number(lineItem?.unitPrice || 0);

  if (!name || !Number.isFinite(quantity) || quantity <= 0) {
    return { skipped: true };
  }

  const normalizedName = normalizeLookupName(name);

  const existing = await Item.findOne({
    type: "product",
    $or: [
      { normalizedName },
      { name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
    ],
  }).sort({ createdAt: 1, _id: 1 });

  if (existing) {
    existing.stock = Number(existing.stock || 0) + quantity;
    if (!Number.isFinite(existing.price) || Number(existing.price) < 0) {
      existing.price = Math.max(0, unitPrice);
    }
    if (!String(existing.sku || "").trim()) {
      existing.sku = await generateProductSku({
        name: existing.name || name,
        category: existing.category || DEFAULT_CATEGORY,
      });
    }
    if (vendorName) {
      existing.vendor = String(vendorName).trim();
    }
    await existing.save();
    return { updated: true, itemId: existing._id };
  }

  const sku = await generateProductSku({ name, category: DEFAULT_CATEGORY });
  const created = await Item.create({
    name,
    type: "product",
    category: DEFAULT_CATEGORY,
    sku,
    price: Math.max(0, unitPrice),
    stock: quantity,
    lowStockThreshold: 5,
    vendor: String(vendorName || "").trim(),
    location: "Vendor Purchase",
    status: "Active",
  });

  return { created: true, itemId: created._id };
};

const syncBillInventoryIfPaid = async ({ billId, vendorName }) => {
  const bill = await Bill.findById(billId).select("status inventorySynced lineItems vendorId");
  if (!bill) return { synced: false, reason: "bill_not_found" };
  if (bill.status !== "Paid") return { synced: false, reason: "bill_not_paid" };
  if (bill.inventorySynced) return { synced: false, reason: "already_synced" };

  const lineItems = Array.isArray(bill.lineItems) ? bill.lineItems : [];
  if (!lineItems.length) return { synced: false, reason: "no_line_items" };

  let updatedCount = 0;
  let createdCount = 0;

  for (const lineItem of lineItems) {
    const result = await syncLineItemToInventory({ lineItem, vendorName });
    if (result?.updated) updatedCount += 1;
    if (result?.created) createdCount += 1;
  }

  bill.inventorySynced = true;
  await bill.save();

  return {
    synced: true,
    updatedCount,
    createdCount,
  };
};

// Utility function to update orders, notify roles, and send follow-up emails
const updateOrdersForRestock = async (productId) => {
  const Order = require("../models/order");
  const User = require("../models/user");
  const Deal = require("../models/deal");

  const orders = await Order.find({ product: productId, status: "Waiting for Restock" });

  for (const order of orders) {
    order.status = "Restocked";
    await order.save();

    // Update the deal stage if follow-up is completed
    const deal = await Deal.findOne({ product: productId, waitingForRestock: true });
    if (deal && deal.followUpCompleted) {
      deal.stage = "Restocked";
      deal.waitingForRestock = false;
      await deal.save();

      // Send follow-up email to the client
      const sendNotification = require("./mailer").sendNotification;
      await sendNotification(deal.email, "Your product is now available!", {
        subject: "Product Restocked",
        body: `Dear ${deal.name},\n\nYour requested product (${deal.product}) is now available. The deal stage has been updated to Restocked.\n\nThank you for your patience!\n\nBest regards,\nYour CRM Team`,
      });
    }

    // Notify the client handler
    const clientHandler = await User.findById(order.clientHandlerId);
    if (clientHandler) {
      const sendNotification = require("./mailer").sendNotification;
      await sendNotification(clientHandler.email, "Item Restocked", {
        subject: "Item Restocked",
        body: `The item for order ${order._id} has been restocked. Please follow up with the client.`,
      });
    }
  }
};

module.exports = {
  syncBillInventoryIfPaid,
  updateOrdersForRestock,
};
