import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// CASH-45: server/routes/cron.js documents itself as "Called by Vercel Cron
// (vercel.json)", but vercel.json had no `crons` block at all — so unless a
// schedule was configured only in the Vercel dashboard (unverifiable from
// the repo), auto-sync (GET /api/cron/sync) has never actually fired in
// production. Adding the schedule here version-controls it either way: if a
// dashboard-only cron already existed, this makes it explicit and safe from
// silent loss on a project re-create; if none existed, this is what makes
// auto-sync run at all. (Double-firing risk if a dashboard cron also exists
// is a non-issue: runSync's due-check is time-threshold based and
// processSyncJob claims batches atomically — CASH-23.)
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vercelConfig = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));

// Minimal 5-field cron expression sanity check (not a full validator — just
// guards against an obviously malformed schedule shipping silently).
const CRON_FIELD_RE = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/;
const isPlausibleCronExpression = (expr) =>
  typeof expr === 'string' && expr.trim().split(/\s+/).length === 5 &&
  expr.trim().split(/\s+/).every(field => CRON_FIELD_RE.test(field));

describe('vercel.json crons (CASH-45)', () => {
  it('schedules /api/cron/sync', () => {
    expect(Array.isArray(vercelConfig.crons)).toBe(true);
    const syncCron = vercelConfig.crons.find(c => c.path === '/api/cron/sync');
    expect(syncCron).toBeDefined();
    expect(isPlausibleCronExpression(syncCron.schedule)).toBe(true);
  });
});
