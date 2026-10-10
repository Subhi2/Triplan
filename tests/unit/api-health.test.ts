import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCronRequest } from "@/server/services/cron";

const execute = vi.fn();
vi.mock("@/server/db", () => ({ getDb: () => ({ execute }) }));
const forgetOldCache = vi.fn();
const forgetOldForecasts = vi.fn();
vi.mock("@/server/db/cache", () => ({ forgetOldCache, forgetOldForecasts }));
const forgetOldVisitors = vi.fn();
vi.mock("@/server/services/writeLimit", () => ({ forgetOldVisitors }));

const { GET } = await import("@/app/api/health/route");

const get = (auth?: string) =>
  GET(new Request("http://localhost/api/health", auth ? { headers: { authorization: auth } } : {}));

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    execute.mockReset().mockResolvedValue([{ places: 93_000 }]);
    forgetOldCache.mockReset().mockResolvedValue({ routes: 3, geocodes: 4 });
    forgetOldForecasts.mockReset().mockResolvedValue(2);
    forgetOldVisitors.mockReset().mockResolvedValue(1);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("cleans up only for the cron's secret", async () => {
    const res = await get("Bearer s3cret");
    expect(await res.json()).toEqual({
      ok: true,
      places: 93_000,
      cleaned: { visitors: 1, forecasts: 2, routes: 3, geocodes: 4 },
    });
  });

  it("answers anyone else with the health check alone, deleting nothing", async () => {
    for (const auth of [undefined, "Bearer wrong", "s3cret"]) {
      const res = await get(auth);
      expect(await res.json()).toEqual({ ok: true, places: 93_000 });
    }
    expect(forgetOldVisitors).not.toHaveBeenCalled();
    expect(forgetOldCache).not.toHaveBeenCalled();
  });

  it("never cleans up when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isCronRequest(new Request("http://x", { headers: { authorization: "Bearer " } }))).toBe(
      false,
    );
    await get("Bearer ");
    expect(forgetOldVisitors).not.toHaveBeenCalled();
  });

  it("is 503 when the database is down", async () => {
    execute.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await get()).status).toBe(503);
  });
});
