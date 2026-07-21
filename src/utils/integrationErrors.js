// Server errors from integration endpoints are raw codes (e.g.
// SOURCE_LIMIT_REACHED, PLAN_LIMIT_REACHED) — translate the ones a user can
// actually hit; anything else falls back to the raw message. Shared by
// IntegrationWizard.jsx and IntegrationsPage.jsx so both surfaces translate
// the same codes instead of drifting (CASH-96).
export function friendlyErrorCode(msg, t) {
  return msg === "SOURCE_LIMIT_REACHED" ? t("int_source_limit_reached")
    : msg === "PLAN_LIMIT_REACHED" ? t("plan_limit_reached")
    : msg;
}

export function friendlyError(e, t) {
  return friendlyErrorCode(e.message, t);
}
