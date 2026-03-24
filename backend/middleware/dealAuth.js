const User = require("../models/user");

// Recursive function to get all team member IDs under a manager
async function getTeamMembers(userId, visited = new Set()) {
  if (visited.has(userId)) return []; // Prevent infinite loops
  
  visited.add(userId);
  const team = await User.find({ 
    reportsTo: userId,
    role: { $in: ['MANAGER', 'EMPLOYEE'] }
  }).select('_id');
  
  const allTeam = [...team.map(u => u._id)];
  
  // Recursively get sub-teams
  for (const member of team) {
    const subTeam = await getTeamMembers(member._id, visited);
    allTeam.push(...subTeam);
  }
  
  return allTeam;
}

// Main authorization function
async function authorizeDealAccess(reqUser, deal) {
  const userRole = reqUser.role.toUpperCase();
  
  if (userRole === 'ADMIN') {
    return true; // Admin sees everything
  }
  
  if (!deal || !deal.assignedTo) {
    return false;
  }
  
  if (userRole === 'EMPLOYEE') {
    return String(deal.assignedTo) === String(reqUser._id);
  }
  
  if (userRole === 'MANAGER') {
    // Check if deal is assigned to me
    if (String(deal.assignedTo) === String(reqUser._id)) {
      return true;
    }
    
    // Check if deal is assigned to my team (recursive)
    const teamMemberIds = await getTeamMembers(reqUser._id);
    return teamMemberIds.some(id => String(id) === String(deal.assignedTo));
  }
  
  return false;
}

// Middleware factory for routes
function permitDealAccess() {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      if (req.params.id) {
        // Single deal - fetch and authorize
        const Deal = require("../models/deal");
        const deal = await Deal.findById(req.params.id).populate('assignedTo');
        if (!deal) {
          return res.status(404).json({ message: "Deal not found" });
        }
        if (!await authorizeDealAccess(req.user, deal)) {
          return res.status(403).json({ message: "Forbidden - insufficient permissions for this deal" });
        }
        req.deal = deal; // Attach for route handler
      } else {
        // List view - req.user passed through, filter applied in route
      }
      next();
    } catch (error) {
      console.error('Deal auth error:', error);
      res.status(500).json({ message: "Authorization check failed" });
    }
  };
}

// For list filtering (GET /deals) - returns filter query
function getUserDealsFilter(reqUser) {
  const role = reqUser.role.toUpperCase();
  
  if (role === 'ADMIN') {
    return {}; // All deals
  }
  
  if (role === 'EMPLOYEE') {
    return { assignedTo: reqUser._id };
  }
  
  // Manager - my deals + team deals (will resolve team in route)
  return { $or: [{ assignedTo: reqUser._id }] }; // Placeholder, extend in route
}

module.exports = { authorizeDealAccess, permitDealAccess, getUserDealsFilter, getTeamMembers };

