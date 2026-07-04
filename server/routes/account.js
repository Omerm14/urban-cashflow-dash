const { deleteUserData } = require('../lib/accountCleanup');

async function deleteAccount(req, res) {
  try {
    await deleteUserData(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('deleteAccount error', err);
    res.status(500).json({ error: err.message || 'Failed to delete account' });
  }
}

module.exports = { deleteAccount };
