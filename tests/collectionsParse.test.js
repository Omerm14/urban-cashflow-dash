import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

// POST /api/collections/parse — Claude is mocked via require.cache seeding (same technique
// as the accountCleanup tests; vi.mock can't intercept plain CommonJS require()).
const require = createRequire(import.meta.url);
const extractionPath = require.resolve("../server/lib/extraction.js");
const routePath = require.resolve("../server/routes/collectionsParse.js");

const loadRoute = (extractionExports) => {
  require.cache[extractionPath] = { id: extractionPath, filename: extractionPath, loaded: true, exports: extractionExports };
  delete require.cache[routePath];
  return require(routePath);
};

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); delete require.cache[extractionPath]; delete require.cache[routePath]; });

describe("collectionsParse route", () => {
  it("rejects empty and too-long text without calling Claude", async () => {
    const extract = vi.fn();
    const route = loadRoute({ extractCollectionsFromText: extract });
    const r1 = mockRes(); await route({ body: { text: "   " }, user: { id: "u1" } }, r1);
    const r2 = mockRes(); await route({ body: { text: "x".repeat(route.MAX_CHARS + 1) }, user: { id: "u1" } }, r2);
    const r3 = mockRes(); await route({ body: {}, user: { id: "u1" } }, r3);
    expect([r1.statusCode, r2.statusCode, r3.statusCode]).toEqual([400, 400, 400]);
    expect(extract).not.toHaveBeenCalled();
  });

  it("passes the user id and an ISO 'today', and returns normalized items", async () => {
    const extract = vi.fn().mockResolvedValue([
      { customer: "יוסי", amount: "3,500", expected_date: "2026-09-12", collected_date: null, source: "יוסי 3500 12/9" },
      { customer: "", amount: 100 },
    ]);
    const route = loadRoute({ extractCollectionsFromText: extract });
    const res = mockRes();
    await route({ body: { text: "יוסי 3500 12/9" }, user: { id: "u1" } }, res);
    expect(extract).toHaveBeenCalledWith("יוסי 3500 12/9", "u1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(res.statusCode).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ customer: "יוסי", amount: 3500 });
  });

  it("returns a generic 500 (no internals) when Claude fails", async () => {
    const route = loadRoute({ extractCollectionsFromText: vi.fn().mockRejectedValue(new Error("secret detail")) });
    const res = mockRes();
    await route({ body: { text: "abc" }, user: { id: "u1" } }, res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });

  it("never touches the database (no supabase require in the route or normalizer)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["../server/routes/collectionsParse.js", "../server/lib/collectionsImport.js"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      expect(src).not.toMatch(/require\(['"][^'"]*supabase/);
    }
  });
});
