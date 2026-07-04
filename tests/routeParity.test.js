import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dev = readFileSync(join(root, "server/index.js"), "utf8");
const prod = readFileSync(join(root, "api/index.js"), "utf8");

// server/index.js (local dev) and api/index.js (Vercel prod) declare the same
// route table by hand. They have drifted before — prod shipped without the
// Stripe routes and without rate limiting. This test freezes the two tables
// together: any route added to one file must be added to the other.
const routes = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/app\.(get|post|put|delete|patch|use)\(\s*['"`](\/api[^'"`]*)['"`]/g)) {
    out.add(`${m[1].toUpperCase()} ${m[2]}`);
  }
  return out;
};

describe("dev and prod servers expose the same routes", () => {
  it("no route exists in only one entrypoint", () => {
    const devRoutes = routes(dev);
    const prodRoutes = routes(prod);
    const devOnly = [...devRoutes].filter((r) => !prodRoutes.has(r)).sort();
    const prodOnly = [...prodRoutes].filter((r) => !devRoutes.has(r)).sort();
    expect({ devOnly, prodOnly }).toEqual({ devOnly: [], prodOnly: [] });
  });

  it("both apply rate limiting to the expensive endpoints", () => {
    for (const src of [dev, prod]) {
      expect(src).toMatch(/\/api\/extract',\s*extractLimiter/);
      expect(src).toMatch(/\/api\/integrations\/:id\/sync',\s*syncLimiter/);
      expect(src).toMatch(/\/api\/account',\s*accountLimiter/);
    }
  });

  it("both register the raw-body webhooks before the json parser", () => {
    for (const src of [dev, prod]) {
      const jsonAt = src.indexOf("express.json(");
      expect(src.indexOf("/api/webhook/whatsapp")).toBeGreaterThan(-1);
      expect(src.indexOf("/api/webhook/whatsapp")).toBeLessThan(jsonAt);
      expect(src.indexOf("/api/stripe/webhook")).toBeGreaterThan(-1);
      expect(src.indexOf("/api/stripe/webhook")).toBeLessThan(jsonAt);
    }
  });
});
