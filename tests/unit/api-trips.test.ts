import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedTrip } from "@/lib/savedTrip";

vi.mock("@/server/services/tripService", () => ({
  createTrip: vi.fn(),
  getTrip: vi.fn(),
  listTrips: vi.fn(),
  updateTrip: vi.fn(),
}));

const { createTrip, getTrip, updateTrip } = await import("@/server/services/tripService");
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

const request = (method: string, json?: unknown) =>
  new Request("http://localhost/api/trips", {
    method,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
const ctx = <T extends object>(params: T) => ({ params: Promise.resolve(params) });

beforeEach(() => {
  vi.mocked(createTrip).mockReset().mockResolvedValue(savedTrip);
  vi.mocked(getTrip).mockReset().mockResolvedValue(savedTrip);
  vi.mocked(updateTrip).mockReset().mockResolvedValue(savedTrip);
});

describe("POST /api/trips", () => {
  it("saves a valid trip", async () => {
    const res = await trips.POST(request("POST", body));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ trip: savedTrip });
    expect(createTrip).toHaveBeenCalledWith(body);
  });

  it("rejects an invalid trip without saving it", async () => {
    const res = await trips.POST(request("POST", { ...body, corridorKm: 3 }));
    expect(res.status).toBe(400);
    expect(createTrip).not.toHaveBeenCalled();
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

  it("renames a trip", async () => {
    const res = await trip.PATCH(request("PATCH", { title: " New name " }), ctx({ id: ID }));
    expect(res.status).toBe(200);
    expect(updateTrip).toHaveBeenCalledWith(ID, { title: "New name" });
  });

  it("rejects an empty update", async () => {
    const res = await trip.PATCH(request("PATCH", {}), ctx({ id: ID }));
    expect(res.status).toBe(400);
  });

  it("is 404 when updating a trip that does not exist", async () => {
    vi.mocked(updateTrip).mockResolvedValue(null);
    const res = await trip.PATCH(request("PATCH", { title: "x" }), ctx({ id: ID }));
    expect(res.status).toBe(404);
  });
});
