import type { LngLat } from "../geo";
import type { Vehicle } from "../trip";
import type { ClubRole, ClubSeat, ClubStatus, RideRole, RideSeat, RideStatus } from "./roles";
import type {
  ClubJoinPolicy,
  CommunityVehicle,
  RideJoinPolicy,
  RideNeed,
  RidePace,
  RideVisibility,
} from "./schemas";

// What the community API answers (docs/02, "Community (G6)"). Public parts go to anyone who may
// see the club or ride; private parts only to members, as `canClub` / `canRide` allow. Riders are
// shown by nickname only: never an email, phone number or account id other than our own.

export interface RiderMe {
  id: string;
  nickname: string;
  /** False once the rider has kept the account with an email. */
  isAnonymous: boolean;
}

export interface ClubSummary {
  slug: string;
  name: string;
  homeLabel: string;
  vehicle: CommunityVehicle;
  joinPolicy: ClubJoinPolicy;
  members: number;
  upcomingRides: number;
}

export interface ClubPublic extends ClubSummary {
  id: string;
  about: string;
  /** The owner's chosen point for "clubs near me", rounded to about 100 m. */
  homePoint: LngLat | null;
  createdAt: string;
}

export interface ClubMemberRow {
  riderId: string;
  nickname: string;
  role: ClubRole;
  status: ClubStatus;
  note: string;
  /** ISO: when they joined or asked. */
  at: string;
}

/** A club as one viewer sees it. */
export interface ClubView {
  club: ClubPublic;
  me: { riderId: string; seat: ClubSeat | null } | null;
  /** Members only. */
  whatsappUrl?: string | null;
  members?: ClubMemberRow[];
  /** Owners and admins only: requests waiting and riders they blocked. */
  requests?: ClubMemberRow[];
  blocked?: ClubMemberRow[];
  /** Owners and admins: whether an invite link is set (the link itself shows once, when made). */
  hasInvite?: boolean;
  /** Rides coming up: members see members-only ones too (added by GET /api/clubs/[slug]). */
  rides?: GroupRideSummary[];
}

export type GroupRideState = "open" | "full" | "cancelled" | "past";

export interface GroupRideSummary {
  id: string;
  title: string;
  /** ISO. */
  startsAt: string;
  meetLabel: string;
  vehicle: CommunityVehicle;
  pace: RidePace;
  seats: number;
  seatsLeft: number;
  from: string;
  to: string;
  distanceKm: number | null;
  durationMin: number | null;
  host: string;
  club: { slug: string; name: string } | null;
  state: GroupRideState;
}

export interface GroupRidePublic extends GroupRideSummary {
  about: string;
  needs: RideNeed[];
  visibility: RideVisibility;
  joinPolicy: RideJoinPolicy;
  tripId: string;
  tripVehicle: Vehicle;
  viaLabel: string | null;
  line: LngLat[];
}

export interface RideMemberRow {
  riderId: string;
  nickname: string;
  role: RideRole;
  status: RideStatus;
  note: string;
  pillion: boolean;
  at: string;
}

/** A group ride as one viewer sees it. */
export interface GroupRideView {
  /** Null when the viewer may not see it (a members-only ride). */
  ride: GroupRidePublic | null;
  /** The club a members-only ride belongs to, so the page can point there. */
  club: { slug: string; name: string } | null;
  me: { riderId: string; seat: RideSeat | null; clubSeat: ClubSeat | null } | null;
  /** Approved riders, co-hosts and the host only. */
  private?: {
    meetNote: string;
    meetPoint: LngLat | null;
    whatsappUrl: string | null;
    /** The ride-together room for the day. */
    roomPath: string;
    riders: RideMemberRow[];
  };
  /** Host and co-hosts only. */
  requests?: RideMemberRow[];
}

/** The badge on "Me": what is new since the rider last looked. */
export interface MeUpdates {
  /** Requests waiting on rides and clubs this rider runs. */
  waiting: number;
  /** Decisions on this rider's own requests since `since`. */
  decided: number;
}

export interface MeOverview {
  me: RiderMe;
  clubs: (ClubSummary & { role: ClubRole; status: ClubStatus })[];
  rides: (GroupRideSummary & { role: RideRole; status: RideStatus })[];
}
