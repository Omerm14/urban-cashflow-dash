// Single-operator admin allowlist — checked against a comma-separated ADMIN_EMAILS env var.
// ADMIN_EMAIL (singular) is read as a deprecated fallback for one release so an existing
// deploy that only set the old var doesn't lose admin access on this change.
const adminEmails = () => {
  const list = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '';
  return list.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
};

module.exports = function isAdmin(req, res, next) {
  const email = req.user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

module.exports.adminEmails = adminEmails;
