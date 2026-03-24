const Activity = require("../models/activity");
const Account = require("../models/account");
const Contact = require("../models/contact");
const Deal = require("../models/deal");
const { touchAccount, isValidObjectId } = require("./crmRelations");

const populateTimelineActivity = (query) =>
  query
    .populate("owner", "name username email")
    .populate("accountId", "name industry email phone status")
    .populate("dealId", "dealName name amount stage closeDate closingDate")
    .populate("contactId", "name email phone");

const resolveTimelineLinks = async ({ accountId, dealId, contactId, relatedTo }) => {
  let resolvedAccountId = accountId || null;
  let resolvedDealId = dealId || null;
  let resolvedContactId = contactId || null;

  if (relatedTo?.recordType === "Account" && relatedTo.recordId) {
    resolvedAccountId = relatedTo.recordId;
  }
  if (relatedTo?.recordType === "Deal" && relatedTo.recordId) {
    resolvedDealId = relatedTo.recordId;
  }
  if (relatedTo?.recordType === "Contact" && relatedTo.recordId) {
    resolvedContactId = relatedTo.recordId;
  }

  if (!resolvedAccountId && resolvedDealId && isValidObjectId(resolvedDealId)) {
    const deal = await Deal.findById(resolvedDealId).select("account");
    resolvedAccountId = deal?.account || null;
  }

  if (!resolvedAccountId && resolvedContactId && isValidObjectId(resolvedContactId)) {
    const contact = await Contact.findById(resolvedContactId).select("account");
    resolvedAccountId = contact?.account || null;
  }

  return {
    accountId: resolvedAccountId || null,
    dealId: resolvedDealId || null,
    contactId: resolvedContactId || null,
  };
};

const createTimelineActivity = async ({
  userId,
  type,
  title,
  description,
  accountId = null,
  dealId = null,
  contactId = null,
  relatedTo = null,
  metadata = {},
}) => {
  const links = await resolveTimelineLinks({ accountId, dealId, contactId, relatedTo });
  const activity = await Activity.create({
    activityType: type === "meeting" ? "meeting" : type === "call" ? "call" : "system",
    type,
    title,
    description: description || "",
    owner: userId || null,
    accountId: links.accountId,
    dealId: links.dealId,
    contactId: links.contactId,
    status: type === "meeting" ? "Scheduled" : type === "call" ? "Scheduled" : "Logged",
    relatedTo,
    task: undefined,
    meeting: type === "meeting" ? { meetingTitle: title } : undefined,
    call: type === "call" ? { callSubject: title, callStatus: "Scheduled" } : undefined,
    metadata,
  });

  if (links.accountId) {
    await touchAccount(links.accountId);
  }

  return populateTimelineActivity(Activity.findById(activity._id));
};

const buildTimelineFilter = ({ accountId, dealId, contactId }) => {
  const conditions = [];
  if (accountId && isValidObjectId(accountId)) conditions.push({ accountId });
  if (dealId && isValidObjectId(dealId)) conditions.push({ dealId });
  if (contactId && isValidObjectId(contactId)) conditions.push({ contactId });
  return conditions.length === 0 ? {} : { $or: conditions };
};

const getAccountTimeline = async (accountId) =>
  populateTimelineActivity(
    Activity.find(buildTimelineFilter({ accountId })).sort({ createdAt: -1 })
  );

module.exports = {
  buildTimelineFilter,
  createTimelineActivity,
  getAccountTimeline,
  populateTimelineActivity,
  resolveTimelineLinks,
};
