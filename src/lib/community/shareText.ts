import { SITE_NAME } from "../site";

// The messages riders send each other on WhatsApp about clubs and group rides (docs/02,
// "Community (G6)"). Pure. Each goes with a link through whatsAppUrl in src/lib/site.ts; the rider
// taps Send in WhatsApp themselves, so the app never sends a message.

const RIDE_TIME = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/** "Sun, 15 Nov, 5:30 am": a ride's start in India's time, as riders write it. */
export function formatRideTime(iso: string): string {
  return RIDE_TIME.format(new Date(iso)).replace(/\b(am|pm)\b/i, (m) => m.toLowerCase());
}

interface RideText {
  title: string;
  startsAt: string;
  meetLabel: string;
}

/** The host's invitation: "Join my ride: … · Sun, 15 Nov, 5:30 am from Bengaluru." */
export function rideInviteText(ride: RideText): string {
  return `Join my ride: ${ride.title} · ${formatRideTime(ride.startsAt)} from ${ride.meetLabel}. Ask to join here:`;
}

/** For a rider who was let in, to tell the group or family. */
export function rideJoinedText(ride: RideText): string {
  return `I'm in for ${ride.title} · ${formatRideTime(ride.startsAt)} from ${ride.meetLabel}.`;
}

/** The host's message to a rider they approved: open the page for the meeting point. */
export function rideApprovedText(ride: RideText, nickname: string): string {
  return `${nickname}, you're in for ${ride.title} (${formatRideTime(ride.startsAt)}). The meeting point and the group link are on the ride's page:`;
}

export function clubInviteText(name: string): string {
  return `Join ${name}, our riding club on ${SITE_NAME}:`;
}
