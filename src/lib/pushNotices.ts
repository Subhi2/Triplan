import { z } from "zod";

// Push notices (G11, C9): what a club or group ride tells its riders' phones. The text carries
// only the ride or club name and what happened: never a meeting point, WhatsApp link or room id.

export interface Notice {
  title: string;
  body: string;
  /** Our own page the notice opens. */
  url: string;
}

export type RideDecision = "approve" | "waitlist" | "decline" | "remove";

export function rideRequestNotice(rideTitle: string, rideId: string): Notice {
  return {
    title: rideTitle,
    body: "Someone asked to join your ride.",
    url: `/group-rides/${rideId}`,
  };
}

export function rideDecisionNotice(
  rideTitle: string,
  rideId: string,
  decision: RideDecision,
): Notice {
  const body = {
    approve: "You're in. The meeting point is on the ride's page.",
    waitlist: "You're on the waitlist.",
    decline: "The host could not take you on this ride.",
    remove: "The host took you off this ride.",
  }[decision];
  return { title: rideTitle, body, url: `/group-rides/${rideId}` };
}

export function rideChangeNotice(
  rideTitle: string,
  rideId: string,
  what: "cancelled" | "restored" | "time",
): Notice {
  const body = {
    cancelled: "The host called this ride off.",
    restored: "The ride is back on.",
    time: "The start time changed. Check the ride's page.",
  }[what];
  return { title: rideTitle, body, url: `/group-rides/${rideId}` };
}

export function clubRequestNotice(clubName: string, slug: string): Notice {
  return { title: clubName, body: "Someone asked to join your club.", url: `/clubs/${slug}` };
}

export function clubDecisionNotice(clubName: string, slug: string, approved: boolean): Notice {
  return {
    title: clubName,
    body: approved ? "You're in the club." : "The club could not take you this time.",
    url: `/clubs/${slug}`,
  };
}

/** A browser's push subscription, as PushSubscription.toJSON() gives it. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
