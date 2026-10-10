import { MAX_DEVICE_TRIPS } from "./savedTrip";

// The trips this device saved or opened, newest first, and the edit token of each trip it saved
// (needed to rename or change the trip). Kept in localStorage, which can be missing or throw
// (private windows, blocked storage): then nothing is remembered and saved trips are read only
// here. Never sent anywhere but our own API.

const KEY = "triplan.trips.v1";

export interface DeviceTrip {
  id: string;
  /** Set for trips saved on this device. */
  token?: string;
}

function read(): DeviceTrip[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list)
      ? list.filter(
          (t): t is DeviceTrip =>
            typeof t === "object" &&
            t !== null &&
            typeof (t as DeviceTrip).id === "string" &&
            ((t as DeviceTrip).token === undefined || typeof (t as DeviceTrip).token === "string"),
        )
      : [];
  } catch {
    return [];
  }
}

function write(list: DeviceTrip[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_DEVICE_TRIPS)));
  } catch {
    // Storage full or blocked: the trip still works by its link.
  }
}

/** Puts a trip at the top of this device's list, keeping a token it already has. */
export function rememberTrip(id: string, token?: string) {
  const list = read();
  const known = list.find((t) => t.id === id);
  const kept = token ?? known?.token;
  write([{ id, ...(kept ? { token: kept } : {}) }, ...list.filter((t) => t.id !== id)]);
}

/** The edit token of a trip saved on this device, or null. */
export function tripToken(id: string): string | null {
  return read().find((t) => t.id === id)?.token ?? null;
}

/** Ids of the trips saved or opened on this device, newest first. */
export function deviceTripIds(): string[] {
  return read().map((t) => t.id);
}

/** Ids of the trips saved on this device (it holds their tokens). */
export function ownTripIds(): Set<string> {
  return new Set(
    read()
      .filter((t) => t.token)
      .map((t) => t.id),
  );
}

/** Takes a trip off this device's list (and forgets its token). */
export function forgetTrip(id: string) {
  write(read().filter((t) => t.id !== id));
}
