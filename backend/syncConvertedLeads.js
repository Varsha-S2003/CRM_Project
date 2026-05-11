require("dotenv").config();
const mongoose = require("mongoose");

const Lead = require("./models/lead");
const Customer = require("./models/customer");
const Deal = require("./models/deal");
const Contact = require("./models/contact");
const User = require("./models/user");
const Product = require("./models/product");

const normalizeText = (value) => String(value || "").trim();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const convertedLeads = await Lead.find({
      $or: [{ status: "converted" }, { isConverted: true }],
    }).lean();

    const fallbackAssignee = await User.findOne({}, { _id: 1 }).lean();
    if (!fallbackAssignee) {
      throw new Error("No users found for assigning backfilled deals");
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const lead of convertedLeads) {
      let changed = false;
      const customerName = lead.name || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Lead";
      const leadProductId = lead.itemId?._id || lead.itemId || (await Product.findOne({}, { _id: 1 }).lean())?._id || null;
      const leadAmount =
        lead.latestProposal?.amount === undefined || lead.latestProposal?.amount === null || lead.latestProposal?.amount === ""
          ? null
          : Number(lead.latestProposal.amount);
      const resolvedAmount = Number.isFinite(leadAmount) ? leadAmount : null;

      let customer = null;
      if (lead.convertedCustomerId) {
        customer = await Customer.findById(lead.convertedCustomerId);
      }
      if (!customer) {
        customer = await Customer.create({
          name: customerName,
          email: lead.email,
          phone: lead.phone || lead.mobile,
          company: lead.company,
          leadId: lead._id,
        });
        changed = true;
      } else {
        customer.name = customerName;
        customer.email = lead.email;
        customer.phone = lead.phone || lead.mobile;
        customer.company = lead.company;
        customer.leadId = lead._id;
        await customer.save();
        changed = true;
      }

      let deal = null;
      if (lead.convertedDealId) {
        deal = await Deal.findById(lead.convertedDealId);
      }
      const dealPayload = {
        customerId: customer._id,
        sourceLeadId: lead._id,
        product: leadProductId,
        name: `${customerName} - Deal`,
        company: lead.company,
        contact: customer.name,
        email: customer.email,
        phone: customer.phone,
        stage: "Qualification",
        value: resolvedAmount,
        amount: resolvedAmount,
        leadSource: normalizeText(lead.source || ""),
        campaignSource: normalizeText(lead.source || ""),
        description: normalizeText(lead.notes || ""),
        nextStep: normalizeText(lead.latestProposal?.subject || ""),
        dealType: lead.itemType === "service" ? "Existing Business" : "New Business",
        website: normalizeText(lead.website || ""),
        industry: normalizeText(lead.industry || ""),
        title: normalizeText(lead.title || ""),
        salutation: normalizeText(lead.salutation || ""),
        firstName: normalizeText(lead.firstName || ""),
        lastName: normalizeText(lead.lastName || ""),
        secondaryEmail: normalizeText(lead.secondaryEmail || ""),
        mobile: normalizeText(lead.mobile || ""),
        assignedTo: lead.assignedTo || fallbackAssignee._id,
      };

      if (!deal) {
        deal = await Deal.create(dealPayload);
        changed = true;
      } else {
        deal.set(dealPayload);
        await deal.save();
        changed = true;
      }

      let contact = null;
      if (lead.convertedContactId) {
        contact = await Contact.findById(lead.convertedContactId);
      }
      if (!contact && customer.email) {
        contact = await Contact.findOne({ email: customer.email });
      }
      if (!contact) {
        contact = new Contact({
          sourceLeadId: lead._id,
          sourceDealId: deal._id,
          name: customer.name,
          company: customer.company,
          email: customer.email,
          phone: customer.phone,
          source: lead.source || "Lead Conversion",
          convertedAt: new Date(),
        });
        await contact.save();
        changed = true;
      } else {
        contact.sourceLeadId = lead._id;
        contact.sourceDealId = deal._id;
        contact.name = customer.name;
        contact.company = customer.company;
        contact.email = customer.email;
        contact.phone = customer.phone;
        contact.source = lead.source || "Lead Conversion";
        await contact.save();
        changed = true;
      }

      if (changed) {
        await Lead.findByIdAndUpdate(lead._id, {
          status: "converted",
          isConverted: true,
          convertedCustomerId: customer._id,
          convertedContactId: contact._id,
          convertedDealId: deal._id,
        });
        updatedCount += 1;
      } else {
        skippedCount += 1;
      }
    }

    console.log(`Processed ${convertedLeads.length} converted leads.`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Skipped (already complete): ${skippedCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("syncConvertedLeads failed:", err.message);
  process.exitCode = 1;
});
