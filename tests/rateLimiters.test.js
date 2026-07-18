import { describe, it, expect } from 'vitest';
import request from 'supertest';

// api/index.js is the file Vercel actually deploys (vercel.json), and it
// transitively requires server/lib/supabase.js — give it syntactically valid
// placeholder credentials so client construction doesn't throw. No route
// under test here ever reaches a real Supabase call: express-rate-limit runs
// before the `auth` middleware, so unauthenticated requests either short-circuit
// at auth (401, no network call) or get rate-limited (429) first.
// api/index.js also fails fast (CASH-35) if any required env var is unset —
// all four need a placeholder here, not just the Supabase ones.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://test.example.com';

const { default: app } = await import('../api/index.js');

// Each case uses a distinct X-Forwarded-For "client" (trust proxy = 1 is set
// in api/index.js) so the limiters' per-IP buckets don't bleed across cases —
// googleApiLimiter in particular is the same instance shared by both the
// folders and labels routes.

describe('CASH-17: api/index.js (Vercel prod entrypoint) rate limits its expensive endpoints', () => {
  it('/api/extract 429s past extractLimiter.max (120/min)', async () => {
    const ip = '10.0.1.1';
    let last;
    for (let i = 0; i < 121; i++) {
      last = await request(app).post('/api/extract').set('X-Forwarded-For', ip);
    }
    expect(last.status).toBe(429);
  }, 20_000);

  it('/api/integrations/:id/sync 429s past syncLimiter.max (10/min)', async () => {
    const ip = '10.0.1.2';
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app).post('/api/integrations/some-id/sync').set('X-Forwarded-For', ip);
    }
    expect(last.status).toBe(429);
  });

  it('/api/integrations/google/folders 429s past googleApiLimiter.max (20/min)', async () => {
    const ip = '10.0.1.3';
    let last;
    for (let i = 0; i < 21; i++) {
      last = await request(app).get('/api/integrations/google/folders').set('X-Forwarded-For', ip);
    }
    expect(last.status).toBe(429);
  });

  it('/api/integrations/google/labels 429s past googleApiLimiter.max (20/min)', async () => {
    const ip = '10.0.1.4';
    let last;
    for (let i = 0; i < 21; i++) {
      last = await request(app).get('/api/integrations/google/labels').set('X-Forwarded-For', ip);
    }
    expect(last.status).toBe(429);
  });

  it('an unlimited-count client on one endpoint is unaffected by another client hitting the same limiter', async () => {
    // Sanity check that limiting is per-IP, not global — guards against a
    // regression that would make the 429 assertions above false positives.
    const res = await request(app).get('/api/integrations/google/folders').set('X-Forwarded-For', '10.0.1.99');
    expect(res.status).not.toBe(429);
  });
});
