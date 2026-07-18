// Shared response helper for errors thrown by server/lib/plans.js's
// assert*() functions (assertInvoiceLimit, assertSourceLimit,
// assertAutoSyncAllowed, assertEntitlement). Centralizes the response-shape
// mapping so call sites across server/routes/*.js don't each hand-roll it,
// and — critically — safely converts a lookup-failure (PLAN_LOOKUP_FAILED,
// thrown when the underlying Supabase query itself errors) into a clean 500
// instead of letting it propagate uncaught: Express 4 does not route a
// rejected async handler's promise to the app.use((err,...)) error
// middleware, so an uncaught throw here would crash the whole process
// (server/index.js) or fail the serverless invocation in a way that can
// affect other requests sharing a warm container (api/index.js).
//
// Returns true if `err` was a recognized plan-check error and a response was
// sent; false if the caller should handle `err` itself (truly unexpected).
function handlePlanCheckError(err, res, routeLabel) {
  if (!err || !err.statusCode || !err.code) return false;

  if (err.statusCode >= 500) {
    console.error(`[${routeLabel}] plan check failed:`, err.message);
    res.status(err.statusCode).json({ error: 'Internal server error' });
    return true;
  }

  const body = { error: err.code };
  if (err.used !== undefined) body.used = err.used;
  if (err.limit !== undefined) body.limit = err.limit;
  if (err.plan !== undefined) body.plan = err.plan;
  if (err.entitlement !== undefined) body.entitlement = err.entitlement;
  res.status(err.statusCode).json(body);
  return true;
}

module.exports = { handlePlanCheckError };
