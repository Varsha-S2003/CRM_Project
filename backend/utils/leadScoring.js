const calculateLeadScore = (lead = {}) => {
  let score = 0;

  const emailOpened = Number(lead.emailOpened) || 0;
  const websiteVisits = Number(lead.websiteVisits) || 0;
  const formSubmissions = Number(lead.formSubmissions) || 0;

  if (emailOpened >= 3) score += 10;
  if (websiteVisits >= 5) score += 15;
  if (formSubmissions > 0) score += 20;

  if (lead.lastActivityDate) {
    const lastActivity = new Date(lead.lastActivityDate);
    if (!Number.isNaN(lastActivity.getTime())) {
      const daysInactive = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
      if (daysInactive > 7) score -= 10;
    }
  }

  return score;
};

const assignRating = (score = 0) => {
  if (score >= 30) return "hot";
  if (score >= 15) return "warm";
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
