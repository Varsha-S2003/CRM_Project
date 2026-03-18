require("dotenv").config();
const mongoose = require("mongoose");

const Lead = require("./models/lead");
const Customer = require("./models/customer");
const Deal = require("./models/deal");
const Contact = require("./models/contact");
const User = require("./models/user");

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

      let customer = null;
      if (lead.convertedCustomerId) {
        customer = await Customer.findById(lead.convertedCustomerId);
      }
      if (!customer) {
        customer = await Customer.create({
          name: lead.name,
          email: lead.email,
          phone: lead.phone || lead.mobile,
          company: lead.company,
          leadId: lead._id,
        });
        changed = true;
      }

      let deal = null;
      if (lead.convertedDealId) {
        deal = await Deal.findById(lead.convertedDealId);
      }
      if (!deal) {
        deal = await Deal.create({
          customerId: customer._id,
          sourceLeadId: lead._id,
          name: `${lead.name || "Lead"} - Deal`,
          company: lead.company,
          contact: customer.name,
          email: customer.email,
          phone: customer.phone,
          stage: "Qualification",
          value: null,
          amount: 0,
          assignedTo: lead.assignedTo || fallbackAssignee._id,
        });
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
