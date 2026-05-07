const jwt = require('jsonwebtoken')

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(token, process.env.SUPABASE_JWT_SECRET)
    req.user = { id: payload.sub, email: payload.email }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
