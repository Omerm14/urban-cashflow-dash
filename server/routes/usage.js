const storage = require('../storage');
module.exports = async (_req, res) => res.json(await storage.get());
