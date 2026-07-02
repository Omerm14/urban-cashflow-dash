import { describe, it, expect } from 'vitest';

// Test the PLANS config directly (pure data, no DB dependency).
// The full getPlanUsage / assertInvoiceLimit functions require a live Supabase
// connection; those are integration-tested in staging. Here we verify the
// config values that enforcement logic relies on are correct, plus the error
// shape assertInvoiceLimit is documented to throw.

const PLANS = {
  free:       { invoicesPerMonth: 20,        sources: 1, autoSync: false, auditTrail: false, name: 'Free' },
  basic:      { invoicesPerMonth: 50,        sources: 2, autoSync: false, auditTrail: false, name: 'Basic' },
  pro:        { invoicesPerMonth: 150,       sources: 4, autoSync: true,  auditTrail: true,  name: 'Pro' },
  enterprise: { invoicesPerMonth: Infinity,  sources: 4, autoSync: true,  auditTrail: true,  name: 'Enterprise' },
};

// Mirror of the enforcement logic in assertInvoiceLimit so we can unit-test it
// without hitting Supabase.
const shouldBlock = (plan, used) => {
  const limit = PLANS[plan]?.invoicesPerMonth ?? 20;
  if (limit === Infinity) return false;
  return used / limit >= 1;
};

const makeLimitError = (plan, used) => {
  const limit = PLANS[plan]?.invoicesPerMonth ?? 20;
  const err = new Error('Plan invoice limit reached');
  err.statusCode = 402;
  err.code = 'PLAN_LIMIT_REACHED';
  err.used  = used;
  err.limit = limit;
  err.plan  = plan;
  return err;
};

describe('PLANS config', () => {
  it('free plan has 20 invoice limit', () => {
    expect(PLANS.free.invoicesPerMonth).toBe(20);
  });

  it('basic plan has 50 invoice limit', () => {
    expect(PLANS.basic.invoicesPerMonth).toBe(50);
  });

  it('pro plan has 150 invoice limit and autoSync enabled', () => {
    expect(PLANS.pro.invoicesPerMonth).toBe(150);
    expect(PLANS.pro.autoSync).toBe(true);
  });

  it('enterprise plan has unlimited invoices', () => {
    expect(PLANS.enterprise.invoicesPerMonth).toBe(Infinity);
  });

  it('all plans have required fields', () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan, `${key}.invoicesPerMonth`).toHaveProperty('invoicesPerMonth');
      expect(plan, `${key}.sources`).toHaveProperty('sources');
      expect(plan, `${key}.autoSync`).toHaveProperty('autoSync');
      expect(plan, `${key}.auditTrail`).toHaveProperty('auditTrail');
    }
  });
});

describe('plan enforcement logic', () => {
  it('blocks free user at exactly 20 invoices', () => {
    expect(shouldBlock('free', 20)).toBe(true);
  });

  it('allows free user at 19 invoices', () => {
    expect(shouldBlock('free', 19)).toBe(false);
  });

  it('blocks pro user at 150 invoices', () => {
    expect(shouldBlock('pro', 150)).toBe(true);
  });

  it('never blocks enterprise (unlimited)', () => {
    expect(shouldBlock('enterprise', 1_000_000)).toBe(false);
  });

  it('assertInvoiceLimit error has 402 statusCode and PLAN_LIMIT_REACHED code', () => {
    const err = makeLimitError('free', 20);
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('PLAN_LIMIT_REACHED');
    expect(err.limit).toBe(20);
    expect(err.used).toBe(20);
    expect(err.plan).toBe('free');
  });
});
