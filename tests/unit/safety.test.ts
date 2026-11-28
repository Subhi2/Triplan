import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  helplines,
  positionLinks,
  positionMessage,
  longestGap,
  type SafetyPoint,
  type SafetySummary,
  summariseSafety,
  telLink,
  thinByStretch,
} from "@/lib/safety";

const point = (id: string, kind: SafetyPoint["kind"], km: number, detourKm = 0.2): SafetyPoint => ({
  id,
  kind,
  name: id,
  phone: null,
  location: [75, 13],
  kmFromStart: km,
  detourKm,
});

describe("safety stops", () => {
  it("finds the longest stretch without one, from start to destination", () => {
    expect(longestGap([20, 30, 110], 150)).toEqual({ fromKm: 30, toKm: 110, km: 80 });
    expect(longestGap([], 90)).toEqual({ fromKm: 0, toKm: 90, km: 90 });
  });

  it("keeps the nearest few of each kind per 10 km", () => {
    const points = [
      point("a", "atm", 1, 2.5),
      point("b", "atm", 2, 0.1),
      point("c", "atm", 3, 1),
      point("d", "atm", 4, 0.5),
      point("h", "hospital", 5),
      point("e", "atm", 15),
    ];
    expect(thinByStretch(points).map((p) => p.id)).toEqual(["b", "c", "d", "h", "e"]);
  });

  it("counts per kind and per 50 km", () => {
    const s = summariseSafety([point("h1", "hospital", 10), point("h2", "hospital", 60)], 100);
    expect(s.counts.hospital).toBe(2);
    expect(s.counts.police).toBe(0);
    expect(s.perFiftyKm.hospital).toBe(1);
    expect(s.longestGap.hospital.km).toBe(50);
    expect(s.longestGap.police.km).toBe(100);
  });

  it("makes tap-to-call links from mapped numbers", () => {
    expect(telLink("+91 8173 244 444")).toBe("tel:+918173244444");
    expect(telLink("108")).toBe("tel:108");
    expect(telLink("n/a")).toBeNull();
  });
});

vi.mock("@/server/services/servicePointService", () => ({ servicesAlong: vi.fn() }));
vi.mock("@/server/services/routeService", () => ({ getRouteGeometry: vi.fn() }));

describe("POST /api/services/along", () => {
  const line = {
    type: "LineString" as const,
    coordinates: [
      [75, 13],
      [75, 13.9],
    ] as [number, number][],
  };
  beforeEach(() => vi.resetModules());

  it("summarises the stops near the route and 404s an expired route id", async () => {
    const { servicesAlong } = await import("@/server/services/servicePointService");
    const { getRouteGeometry } = await import("@/server/services/routeService");
    const { POST } = await import("@/app/api/services/along/route");
    vi.mocked(servicesAlong).mockResolvedValue([
      {
        osmId: "node/1",
        kind: "hospital",
        name: "CGH",
        phone: "108",
        location: [75, 13.1],
        kmFromStart: 11.12,
        detourM: 340,
      },
      {
        osmId: "node/2",
        kind: "toll",
        name: "Toll Plaza",
        phone: null,
        location: [75, 13.3],
        kmFromStart: 33.3,
        detourM: 40,
      },
      {
        // A booth on a parallel road, not this one.
        osmId: "node/3",
        kind: "toll",
        name: null,
        phone: null,
        location: [75.01, 13.5],
        kmFromStart: 55,
        detourM: 900,
      },
    ]);
    const post = (body: unknown) =>
      POST(
        new Request("http://x/api/services/along", { method: "POST", body: JSON.stringify(body) }),
      );
    const res = await post({ geometry: line });
    expect(res.status).toBe(200);
    const data = (await res.json()) as SafetySummary;
    expect(data.counts.hospital).toBe(1);
    expect(data.points).toHaveLength(1);
    expect(data.points[0]).toMatchObject({ id: "node/1", kmFromStart: 11.1, detourKm: 0.3 });
    expect(data.tolls).toEqual([
      { id: "node/2", name: "Toll Plaza", location: [75, 13.3], kmFromStart: 33.3 },
    ]);
    expect(servicesAlong).toHaveBeenCalledWith(line, 3000, [
      "hospital",
      "police",
      "atm",
      "tyre",
      "repair",
      "toll",
    ]);

    vi.mocked(getRouteGeometry).mockResolvedValue(null);
    expect((await post({ routeId: `${"c".repeat(32)}-0` })).status).toBe(404);
    expect((await post({})).status).toBe(400);
  });
});

describe("helplines", () => {
  it("are 112 everywhere, and 1033 on a route with national highways", () => {
    expect(helplines(0).map((h) => h.number)).toEqual(["112"]);
    expect(helplines(42.5).map((h) => h.number)).toEqual(["112", "1033"]);
    // No road mix: 1033 is not guessed.
    expect(helplines(null).map((h) => h.number)).toEqual(["112"]);
  });
});

describe("Send my position (G10)", () => {
  const line: [number, number][] = [
    [77.5946, 12.9716],
    [76.0996, 13.0072],
    [75.356, 13.234],
  ];
  const when = new Date("2026-11-28T10:35:00Z");

  it("gives an OpenStreetMap link, the accuracy, the town and the km of the trip", () => {
    const msg = positionMessage([76.1, 13.007], 32, when, {
      line,
      tripName: "Bengaluru → Kalasa",
      towns: [
        { name: "Hassan", location: [76.0996, 13.0072] },
        { name: "Sakleshpur", location: [75.785, 12.943] },
      ],
    });
    expect(msg).toContain("https://www.openstreetmap.org/?mlat=13.00700&mlon=76.10000");
    expect(msg).toContain("(to about 30 m)");
    expect(msg).toMatch(/Near Hassan, km \d+ of Bengaluru → Kalasa/);
    expect(msg).toMatch(/Sent at /);
  });

  it("leaves out what it does not know", () => {
    const msg = positionMessage([80, 20], null, when);
    expect(msg).not.toContain("Near");
    expect(msg).not.toContain("km");
    expect(msg).not.toContain("to about");
    // Far from the trip's line: no km along it.
    expect(positionMessage([80, 20], 10, when, { line })).not.toContain("km");
  });

  it("opens WhatsApp or an SMS with the message", () => {
    const links = positionLinks("I need help. Here");
    expect(links.whatsapp).toBe("https://wa.me/?text=I%20need%20help.%20Here");
    expect(links.sms).toBe("sms:?&body=I%20need%20help.%20Here");
  });
});
