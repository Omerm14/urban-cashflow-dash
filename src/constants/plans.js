// Canonical plan config (frontend). Mirrors server/lib/plans.js — kept as a
// separate file because the server is CommonJS and this is ESM, but the two
// are cross-checked by tests/plan-parity.test.js so they can't silently drift.
//
// `basic` (₪99) is retired from sale but kept fully intact for existing
// subscribers — it is never offered in any new-purchase UI (UpgradeModal,
// marketing site), only used to resolve legacy accounts correctly.

export const PLAN_LIMITS = { free: 20, basic: 50, starter: 75, pro: 300, enterprise: Infinity };

export const PLAN_SOURCES = { free: 1, basic: 2, starter: 2, pro: 4, enterprise: 4 };

export const PLAN_PRICES = { free: 0, basic: 99, starter: 199, pro: 399, enterprise: 799 };

// Feature entitlement flags per plan, used to gate UI (CSV export, bulk
// actions, audit trail, auto-sync). `supportTier` is display-only.
export const PLAN_FLAGS = {
  free:       { autoSync: false, bulkActions: false, csvExport: false, auditTrail: false, supportTier: null },
  basic:      { autoSync: false, bulkActions: false, csvExport: true,  auditTrail: false, supportTier: 'email' },
  starter:    { autoSync: false, bulkActions: false, csvExport: true,  auditTrail: false, supportTier: 'email' },
  pro:        { autoSync: true,  bulkActions: true,  csvExport: true,  auditTrail: true,  supportTier: 'priority' },
  enterprise: { autoSync: true,  bulkActions: true,  csvExport: true,  auditTrail: true,  supportTier: 'sla' },
};

export const PLAN_FEATURES = {
  free:       ['20 invoices / month', '1 sync source', 'Manual upload + OCR'],
  basic:      ['50 invoices / month', '2 sync sources', 'Email support'],
  starter:    ['75 invoices / month', '2 sync sources', 'CSV export', 'Email support'],
  pro:        ['300 invoices / month', 'All 4 sync sources', 'Scheduled auto-sync', 'Bulk actions', 'Full audit trail', 'Priority support'],
  enterprise: ['Unlimited invoices', 'All 4 sync sources', 'Custom integrations', 'Dedicated onboarding', 'Custom SLA'],
};
