import { z } from "zod";
import { lngLatSchema } from "../trip";

// Community (docs/02, "Community (G6)"): what a rider may send when they pick a nickname, start a
// club, host a group ride or ask to join one. Everything a rider types is checked here, in the
// browser before sending and on the server before it is read.

export const NICKNAME_MAX = 24;
export const nicknameSchema = z.string().trim().min(1).max(NICKNAME_MAX);

/**
 * A WhatsApp group's invite link, the only link a club or ride may carry: nothing else gets in, so
 * listings cannot be used to spread other links. Empty means none.
 */
export const WHATSAPP_GROUP_PATTERN = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{10,40}$/;
export const whatsappUrlSchema = z
  .string()
  .trim()
  .transform((s) => s || null)
  .pipe(
    z
      .string()
      .regex(WHATSAPP_GROUP_PATTERN, "Paste a WhatsApp group invite link (chat.whatsapp.com/…)")
      .nullable(),
  )
  .nullable()
  .default(null);

export const COMMUNITY_VEHICLES = ["bike", "car", "any"] as const;
export type CommunityVehicle = (typeof COMMUNITY_VEHICLES)[number];
export const COMMUNITY_VEHICLE_LABELS: Record<CommunityVehicle, string> = {
  bike: "Bikes",
  car: "Cars",
  any: "Bikes and cars",
};

// Clubs ---------------------------------------------------------------------------------------

export const CLUB_JOIN_POLICIES = ["open", "approval", "invite"] as const;
export type ClubJoinPolicy = (typeof CLUB_JOIN_POLICIES)[number];
export const CLUB_JOIN_LABELS: Record<ClubJoinPolicy, string> = {
  open: "Anyone can join",
  approval: "Ask to join",
  invite: "Invite link only",
};

export const CLUB_NAME_MAX = 60;
export const CLUB_ABOUT_MAX = 600;

export const clubInputSchema = z.object({
  name: z.string().trim().min(3).max(CLUB_NAME_MAX),
  about: z.string().trim().max(CLUB_ABOUT_MAX).default(""),
  homeLabel: z.string().trim().min(2).max(60),
  homePoint: lngLatSchema.nullable().default(null),
  vehicle: z.enum(COMMUNITY_VEHICLES).default("any"),
  joinPolicy: z.enum(CLUB_JOIN_POLICIES).default("approval"),
  whatsappUrl: whatsappUrlSchema,
});
export type ClubInput = z.infer<typeof clubInputSchema>;

/** What an owner or admin can do to a member or a request. */
export const CLUB_MEMBER_ACTIONS = [
  "approve",
  "decline",
  "remove",
  "block",
  "unblock",
  "make_admin",
  "make_member",
  "make_owner",
] as const;
export type ClubMemberAction = (typeof CLUB_MEMBER_ACTIONS)[number];

export const clubSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,70}$/);

// Group rides ---------------------------------------------------------------------------------

export const RIDE_PACES = ["relaxed", "steady", "brisk"] as const;
export type RidePace = (typeof RIDE_PACES)[number];
export const RIDE_PACE_LABELS: Record<RidePace, string> = {
  relaxed: "Relaxed",
  steady: "Steady",
  brisk: "Brisk",
};

export const RIDE_NEEDS = [
  "own_vehicle",
  "helmet",
  "riding_gear",
  "licence",
  "pillion_ok",
] as const;
export type RideNeed = (typeof RIDE_NEEDS)[number];
export const RIDE_NEED_LABELS: Record<RideNeed, string> = {
  own_vehicle: "Own vehicle",
  helmet: "Helmet",
  riding_gear: "Riding gear",
  licence: "Licence",
  pillion_ok: "Pillion welcome",
};

export const RIDE_VISIBILITIES = ["public", "club", "link"] as const;
export type RideVisibility = (typeof RIDE_VISIBILITIES)[number];
export const RIDE_VISIBILITY_LABELS: Record<RideVisibility, string> = {
  public: "Listed for everyone",
  club: "Club members only",
  link: "Anyone with the link",
};

export const RIDE_JOIN_POLICIES = ["approval", "open"] as const;
export type RideJoinPolicy = (typeof RIDE_JOIN_POLICIES)[number];
export const RIDE_JOIN_LABELS: Record<RideJoinPolicy, string> = {
  approval: "I approve each rider",
  open: "Open until full",
};

export const RIDE_TITLE_MAX = 80;
export const RIDE_ABOUT_MAX = 1000;
export const RIDE_SEATS_MAX = 50;

export const groupRideInputSchema = z
  .object({
    tripId: z.uuid(),
    clubId: z.uuid().nullable().default(null),
    title: z.string().trim().min(3).max(RIDE_TITLE_MAX),
    about: z.string().trim().max(RIDE_ABOUT_MAX).default(""),
    startsAt: z.iso.datetime({ offset: true }),
    meetLabel: z.string().trim().min(2).max(60),
    meetNote: z.string().trim().max(200).default(""),
    meetPoint: lngLatSchema.nullable().default(null),
    seats: z.number().int().min(1).max(RIDE_SEATS_MAX),
    vehicle: z.enum(COMMUNITY_VEHICLES).default("bike"),
    pace: z.enum(RIDE_PACES).default("steady"),
    needs: z
      .array(z.enum(RIDE_NEEDS))
      .max(RIDE_NEEDS.length)
      .default([])
      .transform((n) => [...new Set(n)]),
    visibility: z.enum(RIDE_VISIBILITIES).default("public"),
    joinPolicy: z.enum(RIDE_JOIN_POLICIES).default("approval"),
    whatsappUrl: whatsappUrlSchema,
  })
  .refine((r) => r.visibility !== "club" || r.clubId !== null, {
    message: "A members-only ride belongs to a club",
    path: ["visibility"],
  });
export type GroupRideInput = z.infer<typeof groupRideInputSchema>;

/** What a host may change after the ride is up (not its trip or club). */
export const groupRideUpdateSchema = z
  .object({
    title: z.string().trim().min(3).max(RIDE_TITLE_MAX),
    about: z.string().trim().max(RIDE_ABOUT_MAX),
    startsAt: z.iso.datetime({ offset: true }),
    meetLabel: z.string().trim().min(2).max(60),
    meetNote: z.string().trim().max(200),
    meetPoint: lngLatSchema.nullable(),
    seats: z.number().int().min(1).max(RIDE_SEATS_MAX),
    pace: z.enum(RIDE_PACES),
    needs: z
      .array(z.enum(RIDE_NEEDS))
      .max(RIDE_NEEDS.length)
      .transform((n) => [...new Set(n)]),
    joinPolicy: z.enum(RIDE_JOIN_POLICIES),
    whatsappUrl: whatsappUrlSchema,
    cancelled: z.boolean(),
  })
  .partial();
export type GroupRideUpdate = z.infer<typeof groupRideUpdateSchema>;

export const JOIN_NOTE_MAX = 300;
export const joinRequestSchema = z.object({
  note: z.string().trim().max(JOIN_NOTE_MAX).default(""),
  pillion: z.boolean().default(false),
});
export type JoinRequestInput = z.infer<typeof joinRequestSchema>;

/** What a host or co-host can do to a rider or a request. */
export const RIDE_MEMBER_ACTIONS = [
  "approve",
  "waitlist",
  "decline",
  "remove",
  "make_cohost",
  "make_rider",
] as const;
export type RideMemberAction = (typeof RIDE_MEMBER_ACTIONS)[number];

/** How many rides a rider may host that have not happened yet, and clubs they may own. */
export const MAX_UPCOMING_HOSTED = 5;
export const MAX_OWNED_CLUBS = 3;
/** How far ahead a ride may be put up. */
export const MAX_DAYS_AHEAD = 180;
/** A ride counts as past this long after its start (multi-day rides stay current a while). */
export const RIDE_CURRENT_FOR_MS = 2 * 24 * 60 * 60_000;
