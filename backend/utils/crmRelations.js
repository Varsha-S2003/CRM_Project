const mongoose = require("mongoose");
const Account = require("../models/account");
const Contact = require("../models/contact");
const Deal = require("../models/deal");

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const touchAccount = async (accountId) => {
  if (!accountId || !isValidObjectId(accountId)) return null;
  return Account.findByIdAndUpdate(accountId, { $set: { updatedAt: new Date() } }, { new: true });
};

const buildAccountQuery = (name) => ({
  normalizedName: String(name || "").trim().toLowerCase(),
  isDeleted: { $ne: true },
});

const findOrCreateAccount = async (payload = {}) => {
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("Account name is required");
  }

  const existing = await Account.findOne(buildAccountQuery(name));
  if (existing) {
    existing.updatedAt = new Date();
    if (payload.industry !== undefined) existing.industry = String(payload.industry || "").trim();
    if (payload.phone !== undefined) existing.phone = String(payload.phone || "").trim();
    if (payload.email !== undefined) existing.email = String(payload.email || "").trim().toLowerCase();
    if (payload.status !== undefined) {
      existing.status = String(payload.status || "active").trim().toLowerCase() === "inactive" ? "inactive" : "active";
    }
    await existing.save();
    return { account: existing, reused: true };
  }

  const account = await Account.create({
    name,
    industry: payload.industry || "",
    phone: payload.phone || "",
    email: payload.email || "",
    status: payload.status || "active",
  });
  return { account, reused: false };
};

const findExistingContact = async ({ name, email, accountId }) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedName = String(name || "").trim().toLowerCase();

  if (normalizedEmail) {
    const byEmail = await Contact.findOne({ email: normalizedEmail });
    if (byEmail) return byEmail;
  }

  if (normalizedName && accountId && isValidObjectId(accountId)) {
    return Contact.findOne({ account: accountId, normalizedName });
  }

  return null;
};

const findDuplicateDeal = async ({ dealName, accountId }) => {
  const normalizedDealName = String(dealName || "").trim().toLowerCase();
  if (!normalizedDealName || !accountId || !isValidObjectId(accountId)) return null;

  return Deal.findOne({
    account: accountId,
    normalizedDealName,
  })
    .populate("account")
    .populate("contacts.contact");
};

module.exports = {
  buildAccountQuery,
  findDuplicateDeal,
  findExistingContact,
  findOrCreateAccount,
  isValidObjectId,
  touchAccount,
};
