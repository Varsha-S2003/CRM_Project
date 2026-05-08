// Product → Billing Cycle Mapping
// Maps product/service names or IDs to their default billing cycles
// Format: productIdentifier (name or ID) → billingCycle (monthly, quarterly, 6_months, yearly)

const productBillingCycleMap = {
  // Example mappings by product name (case-insensitive)
  // "cloud storage service": "monthly",
  // "security subscription": "quarterly",
  // "managed services": "6_months",
  // "enterprise license": "yearly",

  // Example mappings by product ID (if known)
  // "507f1f77bcf86cd799439011": "monthly", // MongoDB ObjectId format

  // Add your product → billing cycle mappings here
  // Default: undefined (will fall back to item.billingCycle or last deal)
};

/**
 * Get the default billing cycle for a product
 * @param {string} productId - Product ObjectId
 * @param {string} productName - Product name
 * @returns {string|null} Billing cycle (monthly, quarterly, 6_months, yearly) or null
 */
const getDefaultBillingCycleForProduct = (productId, productName) => {
  // Check by ID first
  if (productId && productBillingCycleMap[productId]) {
    return productBillingCycleMap[productId];
  }

  // Check by name (case-insensitive)
  if (productName) {
    const normalizedName = String(productName).trim().toLowerCase();
    const mappedCycle = productBillingCycleMap[normalizedName];
    if (mappedCycle) return mappedCycle;

    // Try partial matching if exact name not found
    for (const [key, cycle] of Object.entries(productBillingCycleMap)) {
      if (key.toLowerCase().includes(normalizedName) || normalizedName.includes(key.toLowerCase())) {
        return cycle;
      }
    }
  }

  return null;
};

module.exports = {
  productBillingCycleMap,
  getDefaultBillingCycleForProduct,
};
