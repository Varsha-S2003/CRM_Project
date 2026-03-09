// middleware/authorize.js
// simple factory that returns middleware checking user role

function permit(...allowed) {
  // allowed should be strings like 'ADMIN', 'MANAGER', 'EMPLOYEE'
  const allowedUpper = allowed.map((r) => r.toUpperCase());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const role = req.user.role ? req.user.role.toUpperCase() : "";
    if (!allowedUpper.includes(role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };
}

module.exports = { permit };
