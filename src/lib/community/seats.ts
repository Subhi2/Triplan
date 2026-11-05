import type { RideJoinPolicy } from "./schemas";
import type { RideRole, RideStatus } from "./roles";

// Seats on a group ride (docs/02, "Community (G6)"). Pure. `seats` is how many riders the host
// takes besides themselves; a rider with a pillion takes two.

export interface SeatHolder {
  riderId: string;
  role: RideRole;
  status: RideStatus;
  seatsTaken: number;
  /** ISO time the request came in: the waitlist is first come, first served. */
  createdAt: string;
}

/** Seats taken by approved riders and co-hosts (the host does not take one). */
export function seatsTaken(rows: readonly SeatHolder[]): number {
  return rows
    .filter((r) => r.status === "approved" && r.role !== "host")
    .reduce((sum, r) => sum + r.seatsTaken, 0);
}

export function seatsLeft(seats: number, rows: readonly SeatHolder[]): number {
  return Math.max(0, seats - seatsTaken(rows));
}

/**
 * Where a new request lands: on an open ride, straight in while it fits, else the waitlist; on a
 * ride the host approves, waiting for them.
 */
export function newRequestStatus(
  policy: RideJoinPolicy,
  left: number,
  want: number,
): "approved" | "waitlist" | "pending" {
  if (policy === "approval") return "pending";
  return want <= left ? "approved" : "waitlist";
}

/**
 * Riders to move up from the waitlist once seats free up, first come first served. A rider who
 * needs two seats when one is left is skipped for the next one who fits.
 */
export function promoteFromWaitlist(left: number, rows: readonly SeatHolder[]): string[] {
  const waiting = rows
    .filter((r) => r.status === "waitlist")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const ids: string[] = [];
  let free = left;
  for (const r of waiting) {
    if (r.seatsTaken > free) continue;
    ids.push(r.riderId);
    free -= r.seatsTaken;
  }
  return ids;
}
