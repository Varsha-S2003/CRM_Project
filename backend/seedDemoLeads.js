const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const mongoose = require("mongoose");
const Lead = require("./models/lead");
const Notification = require("./models/notification");
const User = require("./models/user");

const STATUS_GROUPS = ["new", "contacted", "qualified", "lost"];
const LEADS_PER_STATUS = 3;

const seedBlueprints = {
  new: [
    { firstName: "Asha", lastName: "Reddy", company: "Asha Traders", email: "asha.new1@elogixa.demo", phone: "9000100001", source: "Website" },
    { firstName: "Vikram", lastName: "Shah", company: "Shah Logistics", email: "vikram.new2@elogixa.demo", phone: "9000100002", source: "Referral" },
    { firstName: "Meera", lastName: "Patel", company: "Patel Supplies", email: "meera.new3@elogixa.demo", phone: "9000100003", source: "Campaign" },
  ],
  contacted: [
    { firstName: "Karan", lastName: "Nair", company: "Nair Retail", email: "karan.contacted1@elogixa.demo", phone: "9000200001", source: "Call" },
    { firstName: "Priya", lastName: "Iyer", company: "Iyer Imports", email: "priya.contacted2@elogixa.demo", phone: "9000200002", source: "Email" },
    { firstName: "Rahul", lastName: "Das", company: "Das Enterprises", email: "rahul.contacted3@elogixa.demo", phone: "9000200003", source: "WhatsApp" },
  ],
  qualified: [
    { firstName: "Sneha", lastName: "Kulkarni", company: "Kulkarni Foods", email: "sneha.qualified1@elogixa.demo", phone: "9000300001", source: "Meeting" },
    { firstName: "Arjun", lastName: "Menon", company: "Menon Tech", email: "arjun.qualified2@elogixa.demo", phone: "9000300002", source: "Website" },
    { firstName: "Nisha", lastName: "Verma", company: "Verma Services", email: "nisha.qualified3@elogixa.demo", phone: "9000300003", source: "Referral" },
  ],
  lost: [
    { firstName: "Rohan", lastName: "Gupta", company: "Gupta Agency", email: "rohan.lost1@elogixa.demo", phone: "9000400001", source: "No Budget" },
    { firstName: "Anita", lastName: "Singh", company: "Singh Exporters", email: "anita.lost2@elogixa.demo", phone: "9000400002", source: "Competitor" },
    { firstName: "Dev", lastName: "Kapoor", company: "Kapoor Solutions", email: "dev.lost3@elogixa.demo", phone: "9000400003", source: "Timing" },
  ],
};

const buildLead = (status, blueprint, index) => ({
  ...blueprint,
  name: `${blueprint.firstName} ${blueprint.lastName}`,
  status,
  title: `${status.charAt(0).toUpperCase() + status.slice(1)} Lead ${index + 1}`,
  notes: `Seed record for ${status} pipeline stage.`,
  industry: "General",
  country: "India",
  city: "Bengaluru",
  state: "Karnataka",
  score: status === "qualified" ? 72 : status === "contacted" ? 48 : status === "lost" ? 18 : 25,
  rating: status === "qualified" ? "hot" : status === "contacted" ? "warm" : "cold",
  emailOpened: status === "new" ? 0 : 1,
  websiteVisits: status === "qualified" ? 4 : status === "contacted" ? 2 : 1,
  formSubmissions: status === "qualified" ? 1 : 0,
  customFields: {
    seedBatch: "demo-status-seed",
    seedStatus: status,
  },
  assignedByRole: "ADMIN",
  stageTimestamps: {
    contactedAt: status === "contacted" || status === "qualified" || status === "lost" ? new Date() : null,
    qualifiedAt: status === "qualified" || status === "lost" ? new Date() : null,
    lostAt: status === "lost" ? new Date() : null,
  },
  lastActivityAt: new Date(),
  lastActivityDate: new Date(),
});

const sanitizeLeadPayload = (lead) => {
  const payload = { ...lead };
  delete payload.assignedTo;
  delete payload.assignedBy;
  delete payload.assignedAt;
  delete payload.convertedCustomerId;
  delete payload.convertedContactId;
  delete payload.convertedDealId;
  delete payload.pendingTransitionApproval;
  delete payload.transitionHistory;
  return payload;
};

async function connectDatabase() {
  const primaryUri = process.env.MONGO_URI;
  const fallbackUri = process.env.MONGO_URI_FALLBACK;

  if (!primaryUri) {
    throw new Error("MONGO_URI is missing in backend/.env");
  }

  try {
    await mongoose.connect(primaryUri);
  } catch (error) {
    if (fallbackUri) {
      await mongoose.connect(fallbackUri);
      return;
    }
    throw error;
  }
}

async function seedDemoLeads() {
  await connectDatabase();

  const adminUser = await User.findOne({ role: "ADMIN" }).select("_id name username").lean();
  const adminRecipientId = adminUser?._id ? String(adminUser._id) : "";
  const adminRecipientName = adminUser?.name || adminUser?.username || "Admin";

  let createdCount = 0;
  let notificationCount = 0;
  let skippedCount = 0;

  for (const status of STATUS_GROUPS) {
    const blueprints = seedBlueprints[status];

    for (let index = 0; index < LEADS_PER_STATUS; index += 1) {
      const leadData = buildLead(status, blueprints[index], index);
      const existingLead = await Lead.findOne({ email: leadData.email });

      if (existingLead) {
        skippedCount += 1;
        const existingNotification = adminRecipientId
          ? await Notification.findOne({
              leadId: existingLead._id,
              toStage: existingLead.status,
              recipients: adminRecipientId,
            }).select("_id").lean()
          : null;

        if (!existingNotification && adminRecipientId) {
          await Notification.create({
            leadId: existingLead._id,
            message: `Lead "${existingLead.name}" is in the ${existingLead.status} stage.`,
            fromStage: existingLead.status,
            toStage: existingLead.status,
            changedBy: adminRecipientId,
            changedByName: adminRecipientName,
            recipients: [adminRecipientId],
            isRead: false,
          });
          notificationCount += 1;
        }
        continue;
      }

      const createdLead = await Lead.create(sanitizeLeadPayload(leadData));
      if (adminRecipientId) {
        await Notification.create({
          leadId: createdLead._id,
          message: `Lead "${createdLead.name}" created in the ${createdLead.status} stage.`,
          fromStage: createdLead.status,
          toStage: createdLead.status,
          changedBy: adminRecipientId,
          changedByName: adminRecipientName,
          recipients: [adminRecipientId],
          isRead: false,
        });
        notificationCount += 1;
      }
      createdCount += 1;
    }
  }

  console.log(`Seeded ${createdCount} demo leads. Created ${notificationCount} lead notifications. Skipped ${skippedCount} existing records.`);
}

seedDemoLeads()
  .catch((error) => {
    console.error("Failed to seed demo leads:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });