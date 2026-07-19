// Single source of truth for the env vars both entrypoints (server/index.js —
// dev, api/index.js — Vercel prod) require at boot. Keeping one shared list
// stops the two from drifting apart the way CLAUDE.md warns cold-start
// behavior can (CASH-35: prod previously had no fail-fast check at all).
const REQUIRED_ENV_VARS = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL'];

module.exports = { REQUIRED_ENV_VARS };
