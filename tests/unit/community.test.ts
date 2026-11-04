import { describe, expect, it } from "vitest";
import {
  canActOnClubMember,
  canActOnRideMember,
  canClub,
  canRide,
  canSeeRide,
  CLUB_ROLES,
  CLUB_STATUSES,
  RIDE_ROLES,
  RIDE_STATUSES,
  type ClubAction,
  type RideAction,
} from "@/lib/community/roles";
import {
  clubInputSchema,
  groupRideInputSchema,
  joinRequestSchema,
  whatsappUrlSchema,
} from "@/lib/community/schemas";
import {
  newRequestStatus,
  promoteFromWaitlist,
  seatsLeft,
  seatsTaken,
  type SeatHolder,
} from "@/lib/community/seats";
import {
  clubInviteText,
  formatRideTime,
  rideApprovedText,
  rideInviteText,
} from "@/lib/community/shareText";

const CLUB_ACTIONS: ClubAction[] = [
  "view_private",
  "manage_members",
  "set_admins",
  "edit",
  "reset_invite",
  "host_ride",
  "transfer",
  "delete",
];
const RIDE_ACTIONS: RideAction[] = [
  "view_private",
  "manage_riders",
  "set_cohosts",
  "edit",
  "cancel",
];

describe("club roles", () => {
  const expected: Record<(typeof CLUB_ROLES)[number], ClubAction[]> = {
    owner: CLUB_ACTIONS,
    admin: ["view_private", "manage_members", "edit", "reset_invite", "host_ride"],
    member: ["view_private"],
  };

  it.each(CLUB_ROLES)("gives an active %s exactly its rights", (role) => {
    for (const action of CLUB_ACTIONS) {
      expect(canClub({ role, status: "active" }, action)).toBe(expected[role].includes(action));
    }
  });

  it("gives pending and blocked riders, and strangers, no rights at all", () => {
    for (const role of CLUB_ROLES) {
      for (const status of CLUB_STATUSES.filter((s) => s !== "active")) {
        for (const action of CLUB_ACTIONS) expect(canClub({ role, status }, action)).toBe(false);
      }
    }
    for (const action of CLUB_ACTIONS) expect(canClub(null, action)).toBe(false);
  });

  it("lets the owner act on anyone else and an admin only on members and requests", () => {
    const owner = { role: "owner", status: "active" } as const;
    const admin = { role: "admin", status: "active" } as const;
    const member = { role: "member", status: "active" } as const;
    const request = { role: "member", status: "pending" } as const;
    expect(canActOnClubMember(owner, admin, false)).toBe(true);
    expect(canActOnClubMember(owner, owner, true)).toBe(false);
    expect(canActOnClubMember(admin, member, false)).toBe(true);
    expect(canActOnClubMember(admin, request, false)).toBe(true);
    expect(canActOnClubMember(admin, owner, false)).toBe(false);
    expect(canActOnClubMember(admin, admin, false)).toBe(false);
    expect(canActOnClubMember(member, request, false)).toBe(false);
  });
});

describe("ride roles", () => {
  const expected: Record<(typeof RIDE_ROLES)[number], RideAction[]> = {
    host: RIDE_ACTIONS,
    cohost: ["view_private", "manage_riders", "edit"],
    rider: ["view_private"],
  };

  it.each(RIDE_ROLES)("gives an approved %s exactly its rights", (role) => {
    for (const action of RIDE_ACTIONS) {
      expect(canRide({ role, status: "approved" }, action)).toBe(expected[role].includes(action));
    }
  });

  it("shows the meeting point to nobody who is not in", () => {
    for (const status of RIDE_STATUSES.filter((s) => s !== "approved")) {
      expect(canRide({ role: "rider", status }, "view_private")).toBe(false);
    }
    expect(canRide(null, "view_private")).toBe(false);
  });

  it("lets the host act on anyone but themselves, and a co-host on riders only", () => {
    const host = { role: "host", status: "approved" } as const;
    const cohost = { role: "cohost", status: "approved" } as const;
    const rider = { role: "rider", status: "pending" } as const;
    expect(canActOnRideMember(host, cohost, false)).toBe(true);
    expect(canActOnRideMember(host, host, true)).toBe(false);
    expect(canActOnRideMember(cohost, rider, false)).toBe(true);
    expect(canActOnRideMember(cohost, host, false)).toBe(false);
    expect(canActOnRideMember(cohost, cohost, false)).toBe(false);
    expect(canActOnRideMember({ role: "rider", status: "approved" }, rider, false)).toBe(false);
  });

  it("shows members-only rides to the club's members and the ride's own riders", () => {
    expect(canSeeRide("public", null, null)).toBe(true);
    expect(canSeeRide("link", null, null)).toBe(true);
    expect(canSeeRide("club", null, null)).toBe(false);
    expect(canSeeRide("club", { role: "member", status: "pending" }, null)).toBe(false);
    expect(canSeeRide("club", { role: "member", status: "active" }, null)).toBe(true);
    expect(canSeeRide("club", null, { role: "rider", status: "approved" })).toBe(true);
    expect(canSeeRide("club", null, { role: "rider", status: "removed" })).toBe(false);
  });
});

describe("seats", () => {
  const row = (riderId: string, over: Partial<SeatHolder> = {}): SeatHolder => ({
    riderId,
    role: "rider",
    status: "approved",
    seatsTaken: 1,
    createdAt: `2026-11-0${riderId.length}T00:00:00.000Z`,
    ...over,
  });

  it("counts approved riders and co-hosts, pillions twice, never the host", () => {
    const rows = [
      row("h", { role: "host" }),
      row("aa", { seatsTaken: 2 }),
      row("bbb", { role: "cohost" }),
      row("cccc", { status: "pending" }),
      row("ddddd", { status: "waitlist" }),
    ];
    expect(seatsTaken(rows)).toBe(3);
    expect(seatsLeft(4, rows)).toBe(1);
    expect(seatsLeft(2, rows)).toBe(0);
  });

  it("lets riders straight in on an open ride while they fit, else waitlists them", () => {
    expect(newRequestStatus("open", 1, 1)).toBe("approved");
    expect(newRequestStatus("open", 1, 2)).toBe("waitlist");
    expect(newRequestStatus("open", 0, 1)).toBe("waitlist");
    expect(newRequestStatus("approval", 5, 1)).toBe("pending");
  });

  it("moves the waitlist up first come first served, skipping who does not fit", () => {
    const rows = [
      row("first", { status: "waitlist", seatsTaken: 2, createdAt: "2026-11-01T00:00:00Z" }),
      row("second", { status: "waitlist", createdAt: "2026-11-02T00:00:00Z" }),
      row("third", { status: "waitlist", createdAt: "2026-11-03T00:00:00Z" }),
      row("in", { status: "approved" }),
    ];
    expect(promoteFromWaitlist(1, rows)).toEqual(["second"]);
    expect(promoteFromWaitlist(3, rows)).toEqual(["first", "second"]);
    expect(promoteFromWaitlist(0, rows)).toEqual([]);
  });
});

describe("community inputs", () => {
  it("takes only WhatsApp group invite links", () => {
    expect(whatsappUrlSchema.parse("https://chat.whatsapp.com/AbCdEf123456")).toBe(
      "https://chat.whatsapp.com/AbCdEf123456",
    );
    expect(whatsappUrlSchema.parse("")).toBeNull();
    for (const bad of [
      "https://example.com/x",
      "http://chat.whatsapp.com/AbCdEf123456",
      "https://chat.whatsapp.com.evil.in/AbCdEf123456",
      "https://chat.whatsapp.com/AbCdEf123456?x=https://spam",
    ]) {
      expect(whatsappUrlSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("fills a club's defaults", () => {
    expect(clubInputSchema.parse({ name: "Hassan Riders", homeLabel: "Hassan" })).toEqual({
      name: "Hassan Riders",
      about: "",
      homeLabel: "Hassan",
      homePoint: null,
      vehicle: "any",
      joinPolicy: "approval",
      whatsappUrl: null,
    });
  });

  const ride = {
    tripId: "00000000-0000-4000-8000-000000000001",
    title: "Charmadi at dawn",
    startsAt: "2026-11-15T00:00:00.000Z",
    meetLabel: "Bengaluru",
    seats: 6,
  };

  it("needs a club for a members-only ride, and drops repeated needs", () => {
    expect(groupRideInputSchema.safeParse({ ...ride, visibility: "club" }).success).toBe(false);
    const parsed = groupRideInputSchema.parse({
      ...ride,
      visibility: "club",
      clubId: "00000000-0000-4000-8000-000000000002",
      needs: ["helmet", "helmet", "licence"],
    });
    expect(parsed.needs).toEqual(["helmet", "licence"]);
  });

  it("caps seats and the join note", () => {
    expect(groupRideInputSchema.safeParse({ ...ride, seats: 0 }).success).toBe(false);
    expect(groupRideInputSchema.safeParse({ ...ride, seats: 51 }).success).toBe(false);
    expect(joinRequestSchema.safeParse({ note: "x".repeat(301) }).success).toBe(false);
    expect(joinRequestSchema.parse({})).toEqual({ note: "", pillion: false });
  });
});

describe("share texts", () => {
  const ride = {
    title: "Charmadi at dawn",
    startsAt: "2026-11-15T00:00:00.000Z",
    meetLabel: "Bengaluru",
  };

  it("writes the start in India's time", () => {
    expect(formatRideTime(ride.startsAt)).toBe("Sun, 15 Nov, 5:30 am");
  });

  it("invites, tells a rider they are in, and invites to a club", () => {
    expect(rideInviteText(ride)).toBe(
      "Join my ride: Charmadi at dawn · Sun, 15 Nov, 5:30 am from Bengaluru. Ask to join here:",
    );
    expect(rideApprovedText(ride, "Asha")).toContain("Asha, you're in for Charmadi at dawn");
    expect(clubInviteText("Hassan Riders")).toContain("Join Hassan Riders");
  });
});
