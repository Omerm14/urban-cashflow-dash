// Single source of truth for the env vars both entrypoints (server/index.js —
// dev, api/index.js — Vercel prod) require at boot. Keeping one shared list
// stops the two from drifting apart the way CLAUDE.md warns cold-start
// behavior can (CASH-35: prod previously had no fail-fast check at all).
//
// FRONTEND_URL is deliberately NOT in this list: every call site that reads
// it (server/routes/integrations.js, server/routes/stripe.js) already falls
// back to a sane default when it's unset. It was briefly included here and
// took production down (FUNCTION_INVOCATION_FAILED on every /api/* request)
// because Vercel's Production environment never had it configured — the app
// never needed it to be set. Don't add a var here unless something actually
// has no fallback and would misbehave silently without it.
const REQUIRED_ENV_VARS = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

module.exports = { REQUIRED_ENV_VARS };
