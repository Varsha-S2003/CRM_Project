const calculateLeadScore = (lead = {}) => {
  let score = 0;

  const emailOpened = Number(lead.emailOpened) || 0;
  const websiteVisits = Number(lead.websiteVisits) || 0;
  const formSubmissions = Number(lead.formSubmissions) || 0;
  const hasEmail = Boolean(String(lead.email || "").trim());
  const hasPhone = Boolean(String(lead.phone || lead.mobile || "").trim());
  const hasCompany = Boolean(String(lead.company || "").trim());
  const hasSource = Boolean(String(lead.source || "").trim());
  const hasAssignee = Boolean(lead.assignedTo);
  const normalizedStatus = String(lead.status || "").trim().toLowerCase();

  if (hasEmail) score += 8;
  if (hasPhone) score += 10;
  if (hasCompany) score += 10;
  if (hasSource) score += 5;
  if (hasAssignee) score += 5;

  if (emailOpened > 0) score += Math.min(12, emailOpened * 4);
  if (websiteVisits > 0) score += Math.min(20, websiteVisits * 2);
  if (formSubmissions > 0) score += Math.min(15, formSubmissions * 10);

  if (normalizedStatus === "new") score += 5;
  if (normalizedStatus === "contacted") score += 15;
  if (normalizedStatus === "qualified") score += 30;
  if (normalizedStatus === "proposal" || normalizedStatus === "proposal_sent") score += 40;
  if (normalizedStatus === "converted") score += 50;
  if (normalizedStatus === "lost") score -= 10;

  if (lead.lastActivityDate) {
    const lastActivity = new Date(lead.lastActivityDate);
    if (!Number.isNaN(lastActivity.getTime())) {
      const daysInactive = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
      if (daysInactive <= 7) {
        score += 10;
      } else if (daysInactive <= 30) {
        score += 5;
      } else {
        score -= 10;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
};

const assignRating = (score = 0) => {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
};

const applyLeadScoring = (lead) => {
  if (!lead) return lead;

  const score = calculateLeadScore(lead);
  lead.score = score;
  lead.rating = assignRating(score);
  return lead;
};

module.exports = {
  calculateLeadScore,
  assignRating,
  applyLeadScoring,
};
