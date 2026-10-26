import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alertLine,
  alertsForRide,
  firstKmInside,
  pointInRing,
  routeSamples,
  sortAlerts,
  type RouteAlert,
} from "@/lib/alerts";
import type { LngLat } from "@/lib/geo";
import type { AlertsProvider, CapAlert } from "@/server/providers/alerts";
import {
  createSachetProvider,
  parseAreaFile,
  parseCap,
  parseFeed,
  parseRing,
  type FeedItem,
} from "@/server/providers/alerts/sachet";
import { routeFixture } from "../helpers/fixtures";

vi.mock("@/server/db", () => ({ getDb: vi.fn() }));
const { getDb } = await import("@/server/db");
const {
  alertRegions,
  alertsAlongRoute,
  currentAlerts,
  kmByDistricts,
  regionsByBox,
  routeDistricts,
} = await import("@/server/services/alertsService");

// Recorded 2026-10-14 from sachet.ndma.gov.in: Karnataka's feed, one of its alerts (thunderstorm
// over Chikkamagaluru, Dakshina Kannada, Shivamogga, Udupi and Uttara Kannada), an Andhra Pradesh
// alert in English and Telugu, and that Karnataka alert's district outlines (simplified to 1 km
// for the fixture; the real file is 431 KB).
const fixture = (name: string) => readFileSync(`tests/fixtures/sachet/${name}`, "utf8");
const FEED = fixture("rss_karnataka.xml");
const CAP = fixture("cap-1791630422097019.xml");
const CAP_TWO_LANGUAGES = fixture("cap-andhra-two-languages.xml");
const AREAS = fixture("poly-1791630422097019.xml");

const BASE = "https://sachet.example/cap_public_website";
const item: FeedItem = {
  guid: "1791630422097019",
  title: "Thunderstorm with Lightning is likely …",
  issuer: "IMD Bengaluru",
  listed: "2026-10-10T11:12:30.000Z",
};
const cap = parseCap(CAP, item, "karnataka", `${BASE}/FetchXMLFile?identifier=${item.guid}`)!;
const districts = parseAreaFile(AREAS);

const line = (name: Parameters<typeof routeFixture>[0]) =>
  routeFixture(name)[0]!.geometry.coordinates as LngLat[];

describe("parseFeed", () => {
  it("reads the items with their issuer and time", () => {
    const items = parseFeed(FEED);
    expect(items).toHaveLength(10);
    expect(items[0]).toEqual({
      guid: "1791630422097019",
      title: expect.stringContaining("Chikkamagaluru"),
      issuer: "IMD Bengaluru",
      listed: "2026-10-10T11:12:30.000Z",
    });
  });

  it("reads a feed with no items", () => {
    const empty = `<?xml version="1.0"?><rss version="2.0"><channel><title>Goa</title></channel></rss>`;
    expect(parseFeed(empty)).toEqual([]);
  });
});

describe("parseCap", () => {
  it("reads the alert, what it updates, and that its areas are in a file", () => {
    expect(cap).toMatchObject({
      guid: "1791630422097019",
      id: "IN-1791630422097019_19",
      feed: "karnataka",
      msgType: "Update",
      references: ["IN-1791630422097019_51"],
      sender: "Karnataka-SNDMC",
      issuer: "IMD Bengaluru",
      event: "Thunderstorm with Lightning",
      severity: "Moderate",
      urgency: "Expected",
      certainty: "Possible",
      onset: "2026-10-10T11:12:28.000Z",
      expires: "2026-10-10T14:05:00.000Z",
      area: "5 districts of Karnataka",
      districtCodes: [532, 547, 549, 534, 550],
      rings: [],
      hasAreaFile: true,
    });
  });

  it("takes the English part of a message in two languages", () => {
    const two = parseCap(CAP_TWO_LANGUAGES, { ...item, issuer: null }, "india", "u")!;
    expect(two.event).toBe("Lightning");
    expect(two.headline).toMatch(/^[\x20-\x7e]+$/); // English, not Telugu
    expect(two.issuer).toBe("Andhra Pradesh SDMA"); // from the sender when the feed has none
  });

  it("skips a message with no expiry", () => {
    expect(parseCap(CAP.replace(/<cap:expires>[^<]*<\/cap:expires>/, ""), item, "x", "u")).toBe(
      null,
    );
  });
});

describe("area outlines", () => {
  it("reads every district as a ring of [lng, lat]", () => {
    expect(districts).toHaveLength(5);
    for (const ring of districts) {
      expect(ring.length).toBeGreaterThan(20);
      for (const [lng, lat] of ring) {
        expect(lng).toBeGreaterThan(74);
        expect(lng).toBeLessThan(77);
        expect(lat).toBeGreaterThan(12);
        expect(lat).toBeLessThan(16);
      }
    }
  });

  it("flips CAP's lat,lon order and drops bad pairs", () => {
    expect(parseRing("13.5,75.5 13.6,75.6 x,y 13.5,75.7")).toEqual([
      [75.5, 13.5],
      [75.6, 13.6],
      [75.7, 13.5],
    ]);
  });
});

describe("the route and an area", () => {
  const square: LngLat[] = [
    [75, 13],
    [76, 13],
    [76, 14],
    [75, 14],
  ];

  it("tells inside from outside", () => {
    expect(pointInRing([75.5, 13.5], square)).toBe(true);
    expect(pointInRing([76.5, 13.5], square)).toBe(false);
  });

  it("samples the route every 500 m with the destination last", () => {
    const coords: LngLat[] = [
      [75, 13],
      [75, 13.0101],
    ];
    const samples = routeSamples(coords);
    expect(samples.map((s) => s.km)).toEqual([0, 0.5, 1, expect.closeTo(1.123, 2)]);
    expect(samples.at(-1)!.point).toEqual(coords[1]);
  });

  it("finds Bengaluru → Kalasa entering the alert's districts, before Kalasa", () => {
    const km = firstKmInside(routeSamples(line("bengaluru-sakleshpur-kalasa")), districts);
    expect(km).not.toBeNull();
    expect(km!).toBeGreaterThan(150); // not in Bengaluru, Hassan or Sakleshpur
  });

  it("finds Bengaluru → Ooty and Pune → Goa outside them", () => {
    expect(firstKmInside(routeSamples(line("bengaluru-ooty")), districts)).toBeNull();
    expect(firstKmInside(routeSamples(line("pune-goa")), districts)).toBeNull();
  });
});

const alert = (over: Partial<RouteAlert>): RouteAlert => ({
  id: "a",
  event: "Heavy Rain",
  headline: "Heavy rain likely",
  severity: "Moderate",
  urgency: "Expected",
  certainty: "Likely",
  issuer: "IMD Bengaluru",
  area: "Chikkamagaluru",
  onset: "2026-10-15T00:30:00.000Z",
  expires: "2026-10-15T12:30:00.000Z",
  kmFromStart: 182.4,
  url: "u",
  ...over,
});

describe("alerts for a ride", () => {
  it("keeps the alerts in force between the start and the arrival", () => {
    const all = [
      alert({ id: "during" }),
      alert({ id: "over before", expires: "2026-10-15T00:00:00.000Z" }),
      alert({ id: "starts after", onset: "2026-10-15T20:00:00.000Z" }),
      alert({ id: "no onset", onset: null }),
    ];
    // Leave 6:00 IST (00:30 UTC), 5 h riding + 30 min of breaks.
    const kept = alertsForRide(all, new Date("2026-10-15T00:30:00.000Z"), 300);
    expect(kept.map((a) => a.id)).toEqual(["during", "no onset"]);
    expect(alertsForRide(all, null, 300)).toHaveLength(4);
  });

  it("puts the worst first, then the first met", () => {
    const sorted = sortAlerts([
      alert({ id: "minor", severity: "Minor", kmFromStart: 1 }),
      alert({ id: "late severe", severity: "Severe", kmFromStart: 90 }),
      alert({ id: "early severe", severity: "Severe", kmFromStart: 10 }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["early severe", "late severe", "minor"]);
  });

  it("reads as one line", () => {
    const utc = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    expect(alertLine(alert({}), utc)).toBe(
      "Heavy Rain · from km 182 · until Thu 12:30 · IMD Bengaluru",
    );
    expect(alertLine(alert({ kmFromStart: 0 }), utc)).toContain("from the start");
  });
});

const capAlert = (over: Partial<CapAlert>): CapAlert => ({ ...cap, ...over });

describe("which states an alert is for", () => {
  it("is its state's feed, else its sender, issuer or area", () => {
    expect(alertRegions(capAlert({ feed: "karnataka" }))).toEqual(["karnataka"]);
    expect(alertRegions(capAlert({ feed: "tamil" }))).toEqual(["tamil-nadu"]);
    const india = { feed: "india", issuer: "", area: "" };
    expect(alertRegions(capAlert({ ...india, sender: "Andhra-Pradesh-SDMA" }))).toEqual([
      "andhra-pradesh",
    ]);
    expect(alertRegions(capAlert({ ...india, sender: "IMD-Chennai" }))).toEqual([
      "tamil-nadu",
      "puducherry",
    ]);
    expect(
      alertRegions(capAlert({ ...india, sender: "x", area: "4 districts of Rajasthan" })),
    ).toEqual(["rajasthan"]);
  });

  it("is unknown for national issuers, and Goalpara is not Goa", () => {
    expect(alertRegions(capAlert({ feed: "india", sender: "CWC", issuer: "CWC", area: "" }))).toBe(
      null,
    );
    expect(
      alertRegions(capAlert({ feed: "india", sender: "CWC", issuer: "", area: "Goalpara" })),
    ).toBe(null);
  });
});

// Bengaluru → Sakleshpur → Kalasa's districts as districts_along_route gives them (LGD codes as in
// OSM's ref:LGD:district: Chikkamagaluru 532).
const ROUTE_DISTRICTS = [
  {
    lgd_code: 572,
    name: "Bengaluru Urban",
    names: ["bengaluru urban"],
    region: "karnataka",
    km_from_start: 0,
  },
  { lgd_code: 526, name: "Hassan", names: ["hassan"], region: "karnataka", km_from_start: 118.4 },
  {
    lgd_code: 532,
    name: "Chikkamagaluru",
    names: ["chikkamagaluru", "chikmagalur"],
    region: "karnataka",
    km_from_start: 254.2,
  },
];
const routeDistrictsAre = (rows: unknown[]) =>
  vi.mocked(getDb).mockReturnValue({ execute: vi.fn().mockResolvedValue(rows) } as never);

describe("the route's districts", () => {
  it("come from districts_along_route, in km order", async () => {
    routeDistrictsAre([...ROUTE_DISTRICTS, { ...ROUTE_DISTRICTS[0], region: "nowhere" }]);
    const districts = await routeDistricts(routeFixture("bengaluru-kalasa")[0]!.geometry);
    expect(districts.map((d) => [d.name, d.kmFromStart])).toEqual([
      ["Bengaluru Urban", 0],
      ["Hassan", 118.4],
      ["Chikkamagaluru", 254.2],
    ]);
  });

  it("are none when the database is down", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("down");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await routeDistricts(routeFixture("bengaluru-kalasa")[0]!.geometry)).toEqual([]);
    // Then states come from their boxes, which overlap: Tamil Nadu's reaches Bengaluru.
    expect(regionsByBox([[77.59, 12.97]])).toEqual(
      expect.arrayContaining(["karnataka", "tamil-nadu"]),
    );
  });
});

describe("matching an alert to the route's districts", () => {
  const districts = ROUTE_DISTRICTS.map((d) => ({
    lgdCode: d.lgd_code,
    name: d.name,
    names: d.names,
    region: d.region as "karnataka",
    kmFromStart: d.km_from_start,
  }));

  it("uses LGD codes", () => {
    expect(kmByDistricts({ districtCodes: [549, 532], area: "" }, districts)).toBe(254.2);
    expect(kmByDistricts({ districtCodes: [549], area: "" }, districts)).toBeNull();
    // A district on the route with no code in OSM: only the area file can tell.
    const uncoded = [...districts, { ...districts[0]!, lgdCode: null }];
    expect(kmByDistricts({ districtCodes: [549], area: "" }, uncoded)).toBeUndefined();
  });

  it("reads a river flood's district and state", () => {
    const flood = (area: string) => kmByDistricts({ districtCodes: [], area }, districts);
    expect(flood("Hemavathi, Gorur, Hassan, Karnataka")).toBe(118.4);
    expect(flood("Bhadra, Lakkavalli, Chikmagalur, Karnataka")).toBe(254.2); // its old name
    expect(flood("Tunga, Shivamogga, Shivamogga, Karnataka")).toBeNull();
    expect(flood("tpt-sullurpeta, tpt-tada mandals")).toBeUndefined();
  });
});

describe("current alerts", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");

  it("leaves out expired, replaced and cancelling messages, and repeats", () => {
    const list = [
      capAlert({ id: "new", references: ["old"] }),
      capAlert({ id: "old", references: [] }),
      capAlert({ id: "cancel", msgType: "Cancel", references: ["gone"] }),
      capAlert({ id: "gone", references: [] }),
      capAlert({ id: "expired", references: [], expires: "2026-10-10T11:00:00.000Z" }),
      capAlert({ id: "new", references: ["old"] }),
    ];
    expect(currentAlerts(list, now).map((a) => a.id)).toEqual(["new"]);
  });
});

describe("alertsAlongRoute", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  const fake = (alerts: CapAlert[], areas: Record<string, LngLat[][] | null>) => {
    const provider: AlertsProvider = {
      alerts: vi.fn().mockResolvedValue({ alerts, complete: true }),
      areas: vi.fn(async (a: CapAlert) => (a.id in areas ? areas[a.id]! : [])),
    };
    return provider;
  };

  const route = () => routeFixture("bengaluru-sakleshpur-kalasa")[0]!.geometry;
  const square: LngLat[][] = [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ];

  beforeEach(() => {
    routeDistrictsAre(ROUTE_DISTRICTS);
  });

  it("matches alerts by district, downloading no area files", async () => {
    const provider = fake(
      [
        capAlert({ id: "ka" }), // the recorded alert: codes 532, 547, 549, 534, 550
        capAlert({ id: "udupi", districtCodes: [549] }),
        capAlert({ id: "ap", feed: "andhra" }),
      ],
      {},
    );
    const result = await alertsAlongRoute(route(), provider, now);
    expect(provider.alerts).toHaveBeenCalledWith(["karnataka", "india"], expect.any(Function));
    // India's feed lists every state: listings from elsewhere are not wanted.
    const wanted = vi.mocked(provider.alerts).mock.calls[0]![1]!;
    expect(wanted({ feed: "india", issuer: "IMD Chennai", title: "Rain over Chennai" })).toBe(
      false,
    );
    expect(wanted({ feed: "india", issuer: "IMD Bengaluru", title: "Rain" })).toBe(true);
    expect(wanted({ feed: "india", issuer: "CWC", title: "Ganga at Farakka" })).toBe(true); // cannot tell: read it
    expect(result).toEqual({
      alerts: [expect.objectContaining({ id: "ka", kmFromStart: 254.2, issuer: "IMD Bengaluru" })],
      partial: false,
    });
    expect(provider.areas).not.toHaveBeenCalled();
  });

  it("reads the area file of an alert that names no district", async () => {
    const provider = fake(
      [
        capAlert({ id: "inside", districtCodes: [], area: "12 Mandals" }),
        capAlert({ id: "outside", districtCodes: [], area: "3 Mandals" }),
      ],
      { inside: districts, outside: square },
    );
    const result = await alertsAlongRoute(route(), provider, now);
    expect(result.alerts.map((a) => a.id)).toEqual(["inside"]);
    expect(result.alerts[0]!.kmFromStart).toBeGreaterThan(150);
  });

  it("is partial when an area file could not be read", async () => {
    const provider = fake([capAlert({ id: "x", districtCodes: [], area: "" })], { x: null });
    expect(await alertsAlongRoute(route(), provider, now)).toEqual({ alerts: [], partial: true });
  });

  it("still works without the database, from area files and state boxes", async () => {
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("down");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = fake([capAlert({ id: "ka" })], { ka: districts });
    const result = await alertsAlongRoute(route(), provider, now);
    expect(result.alerts.map((a) => a.id)).toEqual(["ka"]);
    expect(vi.mocked(provider.alerts).mock.calls[0]![0]).toContain("karnataka");
  });
});

describe("the SACHET provider", () => {
  const memory = () => {
    const m = new Map<string, unknown>();
    return {
      get: async (k: string) => m.get(k),
      set: async (k: string, v: unknown) => void m.set(k, v),
      m,
    };
  };
  const answer = (body: string) => new Response(body, { status: 200 });

  afterEach(() => vi.unstubAllGlobals());

  it("reads a feed's messages once, within its limit, and their areas", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.endsWith("/rss/rss_karnataka.xml")) return answer(FEED);
        if (url.includes("FetchPolygonXMLFile")) return answer(AREAS);
        return answer(CAP);
      }),
    );
    const feeds = memory();
    const files = memory();
    const make = () =>
      createSachetProvider({
        baseUrl: `${BASE}/`,
        userAgent: "test",
        areaTurn: async () => {},
        feedCache: feeds,
        fileCache: files,
        maxMessages: 3,
        maxAreaFiles: 1,
        now: () => Date.parse("2026-10-14T12:00:00Z"),
      });

    const first = await make().alerts(["karnataka"]);
    expect(first.complete).toBe(false); // 10 items, 3 messages a request
    expect(first.alerts).toHaveLength(3);
    expect(urls.filter((u) => u.includes("FetchXMLFile"))).toHaveLength(3);

    const provider = make();
    const second = await provider.alerts(["karnataka"]);
    expect(second.alerts).toHaveLength(6); // 3 cached + 3 more; the feed itself was cached
    expect(urls.filter((u) => u.endsWith(".xml"))).toHaveLength(1);

    expect(await provider.areas(first.alerts[0]!)).toHaveLength(5);
    expect(await provider.areas(first.alerts[1]!)).toBeNull(); // over this request's limit
    expect(await make().areas(first.alerts[0]!)).toHaveLength(5); // cached
    expect(urls.filter((u) => u.includes("FetchPolygonXMLFile"))).toHaveLength(1);
    expect(urls[0]).toBe(`${BASE}/rss/rss_karnataka.xml`);
  });

  it("fetches no message for a listing that is not wanted", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        return answer(url.endsWith(".xml") ? FEED : CAP);
      }),
    );
    const provider = createSachetProvider({
      baseUrl: BASE,
      userAgent: "test",
      areaTurn: async () => {},
      feedCache: memory(),
      fileCache: memory(),
      now: () => Date.parse("2026-10-14T12:00:00Z"),
    });
    const { alerts } = await provider.alerts(["karnataka"], ({ title }) => title.includes("Udupi"));
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.length).toBeLessThan(10);
    expect(urls.filter((u) => u.includes("FetchXMLFile"))).toHaveLength(alerts.length);
  });

  it("goes on without a feed that fails, and fails when none can be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("rss_india.xml")
          ? answer(FEED.replace(/<item>[\s\S]*<\/item>/, ""))
          : new Response("busy", { status: 503 }),
      ),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const make = () =>
      createSachetProvider({
        baseUrl: BASE,
        userAgent: "test",
        areaTurn: async () => {},
        feedCache: memory(),
        fileCache: memory(),
      });
    expect(await make().alerts(["karnataka", "india"])).toEqual({ alerts: [], complete: false });
    await expect(make().alerts(["karnataka"])).rejects.toThrow("No SACHET feed could be read");
  });

  it("stops reading area files for 6 hours after a 403", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return new Response("Error Code: 403", { status: 403 });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const files = memory();
    const make = (at: number) =>
      createSachetProvider({
        baseUrl: BASE,
        userAgent: "test",
        areaTurn: async () => {},
        feedCache: memory(),
        fileCache: files,
        now: () => at,
      });
    const t = Date.parse("2026-10-14T10:00:00Z");
    expect(await make(t).areas(cap)).toBeNull();
    expect(await make(t + 60_000).areas({ ...cap, guid: "2" })).toBeNull();
    expect(calls).toBe(1); // the second was not even tried
    await make(t + 7 * 3_600_000).areas({ ...cap, guid: "3" });
    expect(calls).toBe(2);
  });
});
