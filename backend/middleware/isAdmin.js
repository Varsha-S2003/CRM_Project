function isAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  // Check for both lowercase and uppercase admin roles
  const userRole = req.user.role ? req.user.role.toUpperCase() : "";
  if (userRole !== "ADMIN") return res.status(403).json({ message: "Forbidden - admin only" });
  next();
}

module.exports = isAdmin;