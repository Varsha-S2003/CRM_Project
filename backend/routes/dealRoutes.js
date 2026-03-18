const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { permitDealAccess, getUserDealsFilter } = require("../middleware/dealAuth");
const Deal = require("../models/deal");
const Customer = require("../models/customer");
const Contact = require("../models/contact");
const Notification = require("../models/notification");
const User = require("../models/user");

const normalizeDealStage = (stage) => {
  const value = String(stage || "").trim();
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const map = {
    closed_won: "won",
    closed_lost: "lost",
    proposal: "proposal_price_quote",
    negotiation: "negotiate",
  };

  return map[normalized] || normalized;
};

const getStatusFromStage = (stage) =>
  normalizeDealStage(stage) === "lost" ? "Inactive" : "Active";

const allowedTransitions = {
  qualification: ["need_analysis", "lost"],
  need_analysis: ["value_proposition", "qualification", "lost"],
  value_proposition: ["proposal_price_quote", "need_analysis", "lost"],
  proposal_price_quote: ["negotiate", "value_proposition", "lost"],
  negotiate: ["won", "proposal_price_quote", "lost"],
  won: [],
  lost: [],
};

const deriveStatusAndReason = ({ stage, reason, currentReason }) => {
  const status = getStatusFromStage(stage);
  if (status === "Inactive") {
    const resolvedReason = String(reason ?? currentReason ?? "").trim();
    if (!resolvedReason) {
      return {
        error: "Reason is required when moving a deal to Closed Lost",
      };
    }
    return { status, reason: resolvedReason };
  }

  return { status, reason: "" };
};

const syncCustomerStatusFromLatestDeal = async (customerId) => {
  if (!customerId) return;

  const latestDeal = await Deal.findOne({ customerId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("stage status reason");

  if (!latestDeal) {
    await Customer.findByIdAndUpdate(customerId, {
      status: "Active",
      reason: "",
    });
    return;
  }

  const status = latestDeal.status || getStatusFromStage(latestDeal.stage);
  await Customer.findByIdAndUpdate(customerId, {
    status,
    reason: status === "Inactive" ? String(latestDeal.reason || "").trim() : "",
  });
};

const syncDealContact = async (deal) => {
  const contactPayload = {
    sourceDealId: deal._id,
    name: deal.contact || deal.name,
    company: deal.company || "",
    email: deal.email || "",
    phone: deal.phone || "",
    source: "Deal",
    convertedAt: deal.createdAt || new Date(),
  };

  let contact = await Contact.findOne({ sourceDealId: deal._id });
  if (!contact && deal.sourceLeadId) {
    contact = await Contact.findOne({ sourceLeadId: deal.sourceLeadId });
  }

  if (contact) {
    Object.assign(contact, contactPayload);
    await contact.save();
    return;
  }

  await Contact.create(contactPayload);
};

router.get("/", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const filter = getUserDealsFilter(req.user);
    const requestedStatus = String(req.query.status || "").trim();

    if (requestedStatus) {
      if (!["Active", "Inactive"].includes(requestedStatus)) {
        return res.status(400).json({ message: "status must be Active or Inactive" });
      }
      filter.status = requestedStatus;
    }

    // For managers, extend filter to include team
    if (req.user.role.toUpperCase() === 'MANAGER') {
      const teamIds = await require("../middleware/dealAuth").getTeamMembers(req.user._id);
      filter.$or.push({ assignedTo: { $in: teamIds } });
    }
    
    const deals = await Deal.find(filter)
      .populate('assignedTo', 'name username role employee_id')
      .sort({ createdAt: -1 });
    res.json(deals);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const { sourceLeadId, name, company, amount, contact, email, phone, stage, reason, assignedTo } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Name required" });
    }
    if (!assignedTo) {
      return res.status(400).json({ message: "assignedTo (user ID) required" });
    }

    let deal = null;
    if (sourceLeadId) {
      deal = await Deal.findOne({ sourceLeadId });
    }

    if (deal) {
      return res.json(deal);
    }

    const finalStage = stage || "qualification";
    const derived = deriveStatusAndReason({ stage: finalStage, reason });
    if (derived.error) {
      return res.status(400).json({ message: derived.error });
    }

    deal = await Deal.create({
      sourceLeadId: sourceLeadId || null,
      name,
      company,
      amount: Number(amount) || 0,
      contact,
      email,
      phone,
      stage: finalStage,
      status: derived.status,
      reason: derived.reason,
      assignedTo
    });

    await syncDealContact(deal);
    await syncCustomerStatusFromLatestDeal(deal.customerId);

    res.status(201).json(deal);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/bulk", verifyToken, async (req, res) => {
  try {
    const { deals } = req.body;
    if (!Array.isArray(deals) || deals.length === 0) {
      return res.status(400).json({ message: "Deals array required" });
    }

    const normalizedDeals = deals
      .map((deal) => ({
        name: String(deal.name || "").trim(),
        company: String(deal.company || "").trim(),
        amount: Number(deal.amount) || 0,
        contact: String(deal.contact || "").trim(),
        email: String(deal.email || "").trim(),
        phone: String(deal.phone || "").trim(),
        stage: deal.stage || "qualification",
        reason: String(deal.reason || "").trim(),
        assignedTo: req.user._id  // Bulk import assigns to current user
      }))
      .filter((deal) => deal.name);

    if (normalizedDeals.length === 0) {
      return res.status(400).json({ message: "No valid deals found in import" });
    }

    const invalidLostDeal = normalizedDeals.find(
      (deal) => getStatusFromStage(deal.stage) === "Inactive" && !deal.reason
    );
    if (invalidLostDeal) {
      return res.status(400).json({
        message: `Reason is required for Closed Lost deals (error at: ${invalidLostDeal.name})`,
      });
    }

    const dealsWithStatus = normalizedDeals.map((deal) => {
      const derived = deriveStatusAndReason({ stage: deal.stage, reason: deal.reason });
      return {
        ...deal,
        status: derived.status,
        reason: derived.reason,
      };
    });

    const createdDeals = await Deal.insertMany(dealsWithStatus);
    await Promise.all(createdDeals.map((deal) => syncDealContact(deal)));
    await Promise.all(createdDeals.map((deal) => syncCustomerStatusFromLatestDeal(deal.customerId)));

    res.status(201).json({
      message: `${createdDeals.length} deals imported successfully`,
      count: createdDeals.length,
      deals: createdDeals,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const updateDealHandler = async (req, res) => {
  try {
    const { authorizeDealAccess } = require("../middleware/dealAuth");
    
    // Authorize first (req.deal populated by middleware)
    if (!await authorizeDealAccess(req.user, req.deal)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
    }

    let stageChanged = false;
    const oldStage = req.deal.stage;
    let nextStage = oldStage;
    
    if (req.body.stage !== undefined) {
      const newStage = req.body.stage;
      const currentStageKey = normalizeDealStage(oldStage);
      const newStageKey = normalizeDealStage(newStage);

      if (currentStageKey !== newStageKey && 
          (!allowedTransitions[currentStageKey] || !allowedTransitions[currentStageKey].includes(newStageKey))) {
        return res.status(400).json({ 
          message: `Invalid stage transition: from "${oldStage}" to "${newStage}" not allowed` 
        });
      }
      if (currentStageKey !== newStageKey) {
        stageChanged = true;
        nextStage = newStage;
      }
    }

    const updates = { ...req.body };
    delete updates.status;

    if (Object.prototype.hasOwnProperty.call(updates, "amount")) {
      updates.amount = Number(updates.amount) || 0;
    }

    const derived = deriveStatusAndReason({
      stage: nextStage,
      reason: updates.reason,
      currentReason: req.deal.reason,
    });
    if (derived.error) {
      return res.status(400).json({ message: derived.error });
    }
    updates.status = derived.status;
    updates.reason = derived.reason;

    let updatedDeal = await Deal.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedDeal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    // **STAGE CHANGE LOGIC**
    if (stageChanged) {
      // Add to timeline without re-validating full document (supports legacy deals)
      const timelineEvent = {
        fromStage: oldStage,
        toStage: updates.stage,
        changedBy: req.user._id,
        changedAt: new Date(),
        userName: req.user.name || req.user.username
      };

      updatedDeal = await Deal.findByIdAndUpdate(
        updatedDeal._id,
        {
          $push: {
            timeline: {
              $each: [timelineEvent],
              $position: 0,
            },
          },
        },
        { new: true }
      );
      
      // Create notification
      const changerRole = req.user.role.toUpperCase();
      let recipients = [];
      
      if (changerRole === 'EMPLOYEE') {
        // Notify manager chain + admin
        let manager = await User.findById(req.user.reportsTo).populate('reportsTo');
        while (manager) {
          recipients.push(manager._id);
          manager = manager.reportsTo;
        }
      } else if (changerRole === 'MANAGER') {
        // Notify upper managers + admin
        let manager = await User.findById(req.user.reportsTo).populate('reportsTo');
        while (manager) {
          recipients.push(manager._id);
          manager = manager.reportsTo;
        }
      }
      // Always notify admins (find all ADMIN users)
      const admins = await User.find({ role: 'ADMIN' });
      recipients.push(...admins.map(a => a._id));
      
      if (recipients.length > 0) {
        await Notification.insertMany(recipients.map(recipient => ({
          dealId: updatedDeal._id,
          message: `Deal "${updatedDeal.name}" moved from ${oldStage.replace(/_/g, ' ')} to ${updates.stage.replace(/_/g, ' ')} by ${req.user.name || req.user.username}`,
          fromStage: oldStage,
          toStage: updates.stage,
          changedBy: req.user._id,
          changedByName: req.user.name || req.user.username,
          recipients: [recipient]
        })));
      }
    }

    await syncDealContact(updatedDeal);
    await syncCustomerStatusFromLatestDeal(updatedDeal.customerId);
    res.json(updatedDeal);
  } catch (err) {
    console.error('Deal update error:', err);
    res.status(500).json({ message: err.message });
  }
};

router.put("/:id", verifyToken, permitDealAccess(), updateDealHandler);

router.put("/:id/stage", verifyToken, permitDealAccess(), async (req, res) => {
  const stage = req.body.stage;
  if (stage === undefined) {
    return res.status(400).json({ message: "stage is required" });
  }

  req.body = {
    stage,
    reason: req.body.reason,
  };

  return updateDealHandler(req, res);
});

router.delete("/:id", verifyToken, permitDealAccess(), async (req, res) => {
  try {
    const { authorizeDealAccess } = require("../middleware/dealAuth");
    
    // Double-check authorization
    if (!await authorizeDealAccess(req.user, req.deal)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
    }

    const deal = await Deal.findByIdAndDelete(req.params.id);
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }
    await Contact.deleteMany({ sourceDealId: deal._id });
    await syncCustomerStatusFromLatestDeal(deal.customerId);
    res.json({ message: "Deal deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Notification APIs
router.get("/notifications", verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ 
      recipients: req.user._id 
    })
      .populate('dealId', 'name stage amount company')
      .populate('changedBy', 'name username')
      .sort({ createdAt: -1 });

    const unreadCount = notifications.filter(n => !n.isRead).length;

    res.json({
      notifications,
      unreadCount,
      hasUnread: unreadCount > 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch("/notifications/:ids/read", verifyToken, async (req, res) => {
  try {
    const ids = req.params.ids.split(',').map(id => id.trim());
    if (ids.length === 0) {
      return res.status(400).json({ message: "No notification IDs provided" });
    }

    const result = await Notification.updateMany(
      { 
        _id: { $in: ids },
        recipients: req.user._id  // Only own notifications
      },
      { isRead: true }
    );

    res.json({
      message: `${result.modifiedCount} notifications marked as read`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
