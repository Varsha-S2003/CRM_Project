const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const Account = require("../models/account");
const Contact = require("../models/contact");
const Deal = require("../models/deal");
const { findOrCreateAccount, isValidObjectId } = require("../utils/crmRelations");
const { createTimelineActivity, getAccountTimeline } = require("../utils/crmActivity");

const router = express.Router();

router.get("/", verifyToken, async (req, res) => {
  try {
    const accounts = await Account.find({ isDeleted: { $ne: true } }).sort({ updatedAt: -1, createdAt: -1 });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const { account, reused } = await findOrCreateAccount(req.body || {});

    await createTimelineActivity({
      userId: req.user._id,
      type: reused ? "note" : "system",
      title: reused ? "Account reused" : "Account created",
      description: reused
        ? `Existing account "${account.name}" reused instead of creating a duplicate.`
        : `Account "${account.name}" created.`,
      accountId: account._id,
      relatedTo: {
        recordType: "Account",
        recordId: account._id,
        recordName: account.name,
      },
      metadata: { reused },
    });

    res.status(reused ? 200 : 201).json({ account, reused });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get("/:id", verifyToken, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid account id" });
    }

    const account = await Account.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const [contacts, deals, activityTimeline] = await Promise.all([
      Contact.find({ account: account._id }).sort({ updatedAt: -1, createdAt: -1 }),
      Deal.find({ account: account._id })
        .populate("account")
        .populate("contacts.contact")
        .sort({ createdAt: -1 }),
      getAccountTimeline(account._id),
    ]);

    res.json({ account, contacts, deals, activityTimeline });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
