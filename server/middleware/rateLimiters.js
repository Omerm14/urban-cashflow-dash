const rateLimit = require('express-rate-limit');

// Shared by server/index.js (local dev) and api/index.js (Vercel prod) so the
// two entrypoints' per-endpoint rate limits can't drift apart again (CASH-17:
// api/index.js — the file Vercel actually deploys — previously defined only
// accountLimiter, leaving /api/extract and the Google API endpoints unlimited
// in production).
const extractLimiter   = rateLimit({ windowMs: 60_000,    max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests, please slow down' } });
const syncLimiter      = rateLimit({ windowMs: 60_000,    max: 10,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many sync requests, please wait' } });
const googleApiLimiter = rateLimit({ windowMs: 60_000,    max: 20,  standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
const accountLimiter   = rateLimit({ windowMs: 3_600_000, max: 3,   standardHeaders: true, legacyHeaders: false, message: { error: 'Too many account operations, please wait' } });

module.exports = { extractLimiter, syncLimiter, googleApiLimiter, accountLimiter };
