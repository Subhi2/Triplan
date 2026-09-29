import { describe, expect, it } from "vitest";
import { clientIp, visitorKey } from "@/server/services/writeLimit";

const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

describe("write limit keys", () => {
  it("takes the first address from x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(req({}))).toBe("unknown");
  });

  it("stores a hash, never the address", () => {
    const key = visitorKey("203.0.113.7");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(key).not.toContain("203");
    expect(visitorKey("203.0.113.7")).toBe(key);
    expect(visitorKey("203.0.113.8")).not.toBe(key);
  });
});
