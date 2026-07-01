export const PLAN_LIMITS = { free: 20, basic: 50, pro: 150, enterprise: Infinity };

export const PLAN_FEATURES = {
  free:       ['20 invoices / month', '1 sync source', 'Manual upload + OCR'],
  basic:      ['50 invoices / month', '2 sync sources', 'Email support'],
  pro:        ['150 invoices / month', 'All 4 sources', 'Auto-sync', 'Priority support'],
  enterprise: ['Unlimited invoices', 'All 4 sources', 'Dedicated onboarding', 'Custom SLA'],
};
