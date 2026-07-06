import { describe, it, expect } from 'vitest';

// Inlined copies of the logic added for CASH-10 (tests avoid importing the
// real modules, which side-effectfully instantiate Supabase/Anthropic clients
// at require-time — see isDuplicate.test.js / syncPagination.test.js for precedent).

const DEFAULT_BACKOFF_MS    = [500, 1000];
const RATE_LIMIT_BACKOFF_MS = [30000, 60000];

const getRetryDelayMs = (attempt, isRateLimited) => {
  const table = isRateLimited ? RATE_LIMIT_BACKOFF_MS : DEFAULT_BACKOFF_MS;
  return table[Math.min(attempt - 1, table.length - 1)];
};

// Mirrors processGoogleDriveFileBatch's chunked-concurrency loop.
const processInBatches = async (files, concurrency, worker) => {
  let maxInFlight = 0, inFlight = 0;
  const results = [];
  for (let i = 0; i < files.length; i += concurrency) {
    const chunk = files.slice(i, i + concurrency);
    await Promise.all(chunk.map(async file => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const result = await worker(file);
      inFlight--;
      results.push(result);
    }));
  }
  return { results, maxInFlight };
};

describe('getRetryDelayMs (CASH-10: extend 429 backoff toward 30-60s)', () => {
  it('gives 429s a 30s/60s backoff instead of the 500ms/1s default', () => {
    expect(getRetryDelayMs(1, true)).toBe(30000);
    expect(getRetryDelayMs(2, true)).toBe(60000);
  });

  it('leaves the 5xx/network backoff unchanged at 500ms/1s', () => {
    expect(getRetryDelayMs(1, false)).toBe(500);
    expect(getRetryDelayMs(2, false)).toBe(1000);
  });

  it('caps at the longest configured delay for any later attempt', () => {
    expect(getRetryDelayMs(5, true)).toBe(60000);
    expect(getRetryDelayMs(5, false)).toBe(1000);
  });
});

describe('processInBatches (CASH-10: cap concurrency in the job-based Drive batch path)', () => {
  it('never runs more than CONCURRENCY files at once', async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    let active = 0, maxActive = 0;
    const worker = async file => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      return file.id;
    };

    const { results, maxInFlight } = await processInBatches(files, 3, worker);

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(results.length).toBe(10);
  });

  it('processes every file exactly once regardless of batch boundaries', async () => {
    const files = Array.from({ length: 7 }, (_, i) => ({ id: String(i) }));
    const { results } = await processInBatches(files, 3, async file => file.id);

    expect(results.sort()).toEqual(files.map(f => f.id).sort());
  });
});
