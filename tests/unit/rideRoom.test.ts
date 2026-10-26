import { describe, expect, it } from "vitest";
import {
  newRoomId,
  pinMessageSchema,
  positionMessage,
  positionMessageSchema,
  rideRoomPath,
  ridersView,
  ROOM_ID_PATTERN,
  type PositionMessage,
  type RiderPresence,
} from "@/lib/rideRoom";

describe("room ids", () => {
  it("are 128 random bits as 22 base64url characters", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRoomId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(ROOM_ID_PATTERN);
    expect(newRoomId(new Uint8Array(16).fill(255))).toBe("_____________________w");
  });

  it("make the room's links, with the follow link for family", () => {
    expect(rideRoomPath("abc", { routeId: "r-0", title: "Bengaluru → Kalasa" })).toBe(
      "/ride/abc?route=r-0&title=Bengaluru+%E2%86%92+Kalasa",
    );
    expect(rideRoomPath("abc", { follow: true })).toBe("/ride/abc?follow=1");
    expect(rideRoomPath("abc", {})).toBe("/ride/abc");
  });
});

describe("messages", () => {
  it("round a position to 5 decimals (about 1 m) and the heading to whole degrees", () => {
    expect(positionMessage("rider-abcd1", [75.785123456, 12.943987654], 359.7, 1000.4)).toEqual({
      id: "rider-abcd1",
      lng: 75.78512,
      lat: 12.94399,
      heading: 0,
      at: 1000,
    });
    expect(positionMessage("rider-abcd1", [75, 13], Number.NaN, 1).heading).toBeNull();
  });

  it("refuse what a rider's phone should never send", () => {
    const good = { id: "rider-abcd1", lng: 75.7, lat: 12.9, heading: null, at: 1 };
    expect(positionMessageSchema.safeParse(good).success).toBe(true);
    expect(positionMessageSchema.safeParse({ ...good, lat: 95 }).success).toBe(false);
    expect(positionMessageSchema.safeParse({ ...good, id: "<script>" }).success).toBe(false);
    expect(positionMessageSchema.safeParse({ ...good, lng: "75" }).success).toBe(false);
    expect(pinMessageSchema.safeParse({ by: "", lng: 75, lat: 13, at: 1 }).success).toBe(false);
    expect(
      pinMessageSchema.safeParse({ by: "x".repeat(25), lng: 75, lat: 13, at: 1 }).success,
    ).toBe(false);
  });
});

describe("ridersView", () => {
  const now = 1_000_000;
  const presence: RiderPresence[] = [
    { id: "me-000001", name: "Asha", follow: false },
    { id: "far-00001", name: "Bala", follow: false },
    { id: "near-0001", name: "Chetan", follow: false },
    { id: "quiet-001", name: "Divya", follow: false },
    { id: "home-0001", name: "Family", follow: true },
  ];
  const pos = (id: string, lng: number, at: number): [string, PositionMessage] => [
    id,
    { id, lng, lat: 13, heading: null, at },
  ];
  const positions = new Map([
    pos("far-00001", 75.5, now - 5_000),
    pos("near-0001", 75.05, now - 120_000),
  ]);

  it("lists me first, then the nearest, then those not sharing; followers are left out", () => {
    const view = ridersView(presence, positions, "me-000001", [75, 13], now);
    expect(view.map((r) => r.name)).toEqual(["Asha", "Chetan", "Bala", "Divya"]);
    expect(view[0]!.me).toBe(true);
    expect(view[1]!.distanceKm).toBeCloseTo(5.4, 0);
    expect(view.find((r) => r.name === "Divya")!.location).toBeNull();
  });

  it("marks a rider not heard from for a minute as stale", () => {
    const view = ridersView(presence, positions, "me-000001", null, now);
    expect(view.find((r) => r.name === "Chetan")).toMatchObject({ seenAgoS: 120, stale: true });
    expect(view.find((r) => r.name === "Bala")).toMatchObject({ seenAgoS: 5, stale: false });
    // Without my own position there is no distance.
    expect(view.find((r) => r.name === "Bala")!.distanceKm).toBeNull();
  });
});
