import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedTrip } from "@/lib/savedTrip";

vi.mock("@/server/services/tripService", () => ({
  createTrip: vi.fn(),
  getTrip: vi.fn(),
  listTrips: vi.fn(),
  tripEditAccess: vi.fn(),
  updateTrip: vi.fn(),
}));
vi.mock("@/server/services/writeLimit", () => ({ allowWrite: vi.fn() }));

const { createTrip, getTrip, listTrips, tripEditAccess, updateTrip } =
  await import("@/server/services/tripService");
const { allowWrite } = await import("@/server/services/writeLimit");
const trips = await import("@/app/api/trips/route");
const trip = await import("@/app/api/trips/[id]/route");

const ID = "0b7e4b8e-2f4e-4c55-9d8e-3f1f5b0a9c11";
const body = {
  title: "Coffee country",
  stops: [
    { label: "Bengaluru", location: [77.5946, 12.9716] },
    { label: "Kalasa", location: [75.356, 13.234] },
  ],
  vehicle: "bike",
  corridorKm: 5,
  route: {
    id: "x-0",
    geometry: {
      type: "LineString",
      coordinates: [
        [77.5946, 12.9716],
        [75.356, 13.234],
      ],
    },
    distanceKm: 337.6,
    durationMin: 410,
    viaLabel: "via Chikkamagaluru",
  },
};
const savedTrip = { id: ID, title: body.title } as SavedTrip;

const request = (
  method: string,
  json?: unknown,
  token?: string,
  url = "http://localhost/api/trips",
) =>
  new Request(url, {
    method,
    body: json === undefined ? undefined : JSON.stringify(json),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
const ctx = <T extends object>(params: T) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  vi.mocked(createTrip).mockReset().mockResolvedValue({ trip: savedTrip, editToken: "tok" });
  vi.mocked(getTrip).mockReset().mockResolvedValue(savedTrip);
  vi.mocked(updateTrip).mockReset().mockResolvedValue(savedTrip);
  vi.mocked(listTrips).mockReset().mockResolvedValue([]);
  vi.mocked(tripEditAccess).mockReset().mockResolvedValue("ok");
  vi.mocked(allowWrite).mockReset().mockResolvedValue(true);
});

describe("POST /api/trips", () => {
  it("saves a valid trip and sends its edit token once", async () => {
    const res = await trips.POST(request("POST", body));
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ trip: savedTrip, editToken: "tok" });
    expect(createTrip).toHaveBeenCalledWith(body);
  });

  it("is 429 once the visitor is over the hourly limit, without saving", async () => {
    vi.mocked(allowWrite).mockResolvedValue(false);
    const res = await trips.POST(request("POST", body));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("rejects an invalid trip without saving it", async () => {
    const res = await trips.POST(request("POST", { ...body, corridorKm: 3 }));
    expect(res.status).toBe(400);
    expect(createTrip).not.toHaveBeenCalled();
  });
});

describe("GET /api/trips", () => {
  const OTHER = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
  const list = (qs: string) =>
    trips.GET(request("GET", undefined, undefined, `http://localhost/api/trips${qs}`));

  it("lists only the trips the device asks for", async () => {
    expect((await list(`?ids=${ID},${OTHER}`)).status).toBe(200);
    expect(listTrips).toHaveBeenCalledWith([ID, OTHER]);
  });

  it("lists nothing without ids: there is no list of everyone's trips", async () => {
    await list("");
    expect(listTrips).toHaveBeenCalledWith([]);
  });

  it("rejects ids that are not uuids, and more than 50", async () => {
    expect((await list("?ids=1%20OR%201=1")).status).toBe(400);
    expect((await list(`?ids=${Array(51).fill(ID).join(",")}`)).status).toBe(400);
    expect(listTrips).not.toHaveBeenCalled();
  });
});

describe("/api/trips/[id]", () => {
  it("returns a trip", async () => {
    const res = await trip.GET(request("GET"), ctx({ id: ID }));
    expect(res.status).toBe(200);
    expect(getTrip).toHaveBeenCalledWith(ID);
  });

  it("is 404 for ids that are not uuids, without a query", async () => {
    const res = await trip.GET(request("GET"), ctx({ id: "1 OR 1=1" }));
    expect(res.status).toBe(404);
    expect(getTrip).not.toHaveBeenCalled();
  });

  it("renames a trip with its edit token", async () => {
    const res = await trip.PATCH(request("PATCH", { title: " New name " }, "tok"), ctx({ id: ID }));
    expect(res.status).toBe(200);
    expect(tripEditAccess).toHaveBeenCalledWith(ID, "tok");
    expect(updateTrip).toHaveBeenCalledWith(ID, { title: "New name" });
  });

  it("lets only the saving device change a trip", async () => {
    vi.mocked(tripEditAccess).mockResolvedValue("no-token");
    expect((await trip.PATCH(request("PATCH", { title: "x" }), ctx({ id: ID }))).status).toBe(401);
    vi.mocked(tripEditAccess).mockResolvedValue("wrong-token");
    expect(
      (await trip.PATCH(request("PATCH", { title: "x" }, "bad"), ctx({ id: ID }))).status,
    ).toBe(403);
    vi.mocked(tripEditAccess).mockResolvedValue("read-only");
    const old = await trip.PATCH(request("PATCH", { title: "x" }, "tok"), ctx({ id: ID }));
    expect(old.status).toBe(403);
    expect((await old.json()).error).toMatch(/Save a copy/);
    expect(updateTrip).not.toHaveBeenCalled();
  });

  it("limits renames too", async () => {
    vi.mocked(allowWrite).mockResolvedValue(false);
    const res = await trip.PATCH(request("PATCH", { title: "x" }), ctx({ id: ID }));
    expect(res.status).toBe(429);
    expect(updateTrip).not.toHaveBeenCalled();
  });

  it("rejects an empty update", async () => {
    const res = await trip.PATCH(request("PATCH", {}), ctx({ id: ID }));
    expect(res.status).toBe(400);
  });

  it("is 404 when updating a trip that does not exist", async () => {
    vi.mocked(tripEditAccess).mockResolvedValue("not-found");
    const res = await trip.PATCH(request("PATCH", { title: "x" }, "tok"), ctx({ id: ID }));
    expect(res.status).toBe(404);
    expect(updateTrip).not.toHaveBeenCalled();
  });
});
