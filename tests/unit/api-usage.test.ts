import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const countLater = vi.fn();
vi.mock("@/server/services/usage", () => ({ countLater }));
const allowRequestOrOpen = vi.fn();
vi.mock("@/server/services/writeLimit", () => ({ allowRequestOrOpen }));

const { POST } = await import("@/app/api/usage/route");

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/usage", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/usage", () => {
  beforeEach(() => {
    countLater.mockReset();
    allowRequestOrOpen.mockReset().mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("counts a known event for today", async () => {
    expect((await post({ event: "gpx" })).status).toBe(204);
    expect(countLater).toHaveBeenCalledWith("event:gpx");
  });

  it("ignores unknown events and visitors over their hourly count", async () => {
    await post({ event: "drop table" });
    await post({});
    allowRequestOrOpen.mockResolvedValue(false);
    await post({ event: "share" });
    expect(countLater).not.toHaveBeenCalled();
  });

  it("counts nothing when switched off (end-to-end tests)", async () => {
    vi.stubEnv("USAGE_EVENTS_OFF", "1");
    await post({ event: "share" });
    expect(countLater).not.toHaveBeenCalled();
  });
});
