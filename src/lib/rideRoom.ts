import { z } from "zod";
import { haversineM, round5, type LngLat } from "./geo";

// Ride together (docs/02, "Ride together"): a room on the Realtime channel where a group sees
// each other on the map. Positions travel only through the channel: never stored, logged or sent
// to our server. Pure: room ids, what a message may hold, and the list of riders.

/** 128 random bits as base64url: 22 characters. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
/** A rider's position goes out this often while sharing. */
export const SHARE_EVERY_MS = 10_000;
/** A rider not heard from for this long shows as "last seen". */
export const STALE_MS = 60_000;
/** Sharing stops on its own after this long. */
export const ROOM_MAX_MS = 12 * 60 * 60_000;

/** A new room id from 16 random bytes. */
export function newRoomId(bytes: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** A rider's id for this tab, from 9 random bytes. */
export function newRiderId(): string {
  return newRoomId(crypto.getRandomValues(new Uint8Array(9)));
}

export const nicknameSchema = z.string().trim().min(1).max(24);

const riderIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,24}$/);
const lngSchema = z.number().min(-180).max(180);
const latSchema = z.number().min(-90).max(90);

/** A position as it travels on the channel (from other riders' phones, so checked). */
export const positionMessageSchema = z.object({
  id: riderIdSchema,
  lng: lngSchema,
  lat: latSchema,
  heading: z.number().min(0).max(360).nullable(),
  at: z.number().int().positive(),
});
export type PositionMessage = z.infer<typeof positionMessageSchema>;

/** A regroup pin anyone in the room can drop. */
export const pinMessageSchema = z.object({
  by: nicknameSchema,
  lng: lngSchema,
  lat: latSchema,
  at: z.number().int().positive(),
});
export type PinMessage = z.infer<typeof pinMessageSchema>;

/** Who is in the room (presence): riders and followers, by the nickname each picked. */
export const presenceSchema = z.object({
  id: riderIdSchema,
  name: nicknameSchema,
  follow: z.boolean(),
});
export type RiderPresence = z.infer<typeof presenceSchema>;

/** The message for our own position, rounded to 5 decimals (about 1 m). */
export function positionMessage(
  id: string,
  [lng, lat]: LngLat,
  heading: number | null,
  at: number,
): PositionMessage {
  return {
    id,
    lng: round5(lng),
    lat: round5(lat),
    heading: heading === null || Number.isNaN(heading) ? null : Math.round(heading) % 360,
    at: Math.round(at),
  };
}

export interface RiderView {
  id: string;
  name: string;
  me: boolean;
  location: LngLat | null;
  heading: number | null;
  /** Seconds since the last position, or null with none. */
  seenAgoS: number | null;
  stale: boolean;
  /** Straight-line km from me, when both positions are known. */
  distanceKm: number | null;
}

/**
 * The riders to list: everyone present who is not just following, with their last position.
 * Me first, then the nearest; riders without a position last, by name.
 */
export function ridersView(
  presence: RiderPresence[],
  positions: ReadonlyMap<string, PositionMessage>,
  meId: string,
  myLocation: LngLat | null,
  now: number,
): RiderView[] {
  const seen = new Set<string>();
  const riders: RiderView[] = [];
  for (const p of presence) {
    if (p.follow || seen.has(p.id)) continue;
    seen.add(p.id);
    const me = p.id === meId;
    const pos = positions.get(p.id);
    const location: LngLat | null = me ? myLocation : pos ? [pos.lng, pos.lat] : null;
    const seenAgoS = me || !pos ? null : Math.max(0, Math.round((now - pos.at) / 1000));
    riders.push({
      id: p.id,
      name: p.name,
      me,
      location,
      heading: pos?.heading ?? null,
      seenAgoS,
      stale: seenAgoS !== null && seenAgoS * 1000 > STALE_MS,
      distanceKm: !me && location && myLocation ? haversineM(myLocation, location) / 1000 : null,
    });
  }
  return riders.sort(
    (a, b) =>
      Number(b.me) - Number(a.me) ||
      (a.location ? 0 : 1) - (b.location ? 0 : 1) ||
      (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

/** The room's link: with the trip's route and title, and ?follow=1 for family at home. */
export function rideRoomPath(
  room: string,
  { routeId, title, follow }: { routeId?: string | null; title?: string | null; follow?: boolean },
): string {
  const params = new URLSearchParams();
  if (routeId) params.set("route", routeId);
  if (title) params.set("title", title);
  if (follow) params.set("follow", "1");
  const q = params.toString();
  return `/ride/${room}${q ? `?${q}` : ""}`;
}
