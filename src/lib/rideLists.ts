import { rideArea, type RideSummary } from "./rides";

// Curated lists on the rides pages ("Himalaya", "High passes"...). Worked out from each ride's own
// numbers and text, so a new ride lands in the right lists without anyone tagging it.

export type ListRide = Pick<
  RideSummary,
  "region" | "tags" | "distanceKm" | "hairpins" | "highestM"
>;

export const RIDE_LIST_KEYS = [
  "himalaya",
  "high-passes",
  "hairpins",
  "coast",
  "easy",
  "long",
] as const;
export type RideListKey = (typeof RIDE_LIST_KEYS)[number];

/** Tops of the lists, as numbers a rider can check on the ride's page. */
export const HIGH_PASS_M = 3_500;
export const HAIRPINS_MIN = 20;
export const EASY_MAX_KM = 150;
export const EASY_MAX_HAIRPINS = 10;
export const EASY_MAX_HEIGHT_M = 2_500;
export const LONG_MIN_KM = 300;

export const RIDE_LISTS: { key: RideListKey; label: string; about: string }[] = [
  { key: "himalaya", label: "Himalaya", about: "Mountain roads in the Himalaya." },
  { key: "high-passes", label: "High passes", about: `Climbs above ${HIGH_PASS_M} m.` },
  { key: "hairpins", label: "Hairpin roads", about: `${HAIRPINS_MIN} or more hairpins.` },
  { key: "coast", label: "Coast", about: "Along the sea." },
  {
    key: "easy",
    label: "Easy rides",
    about: `Up to ${EASY_MAX_KM} km, few bends and no high climbs: a good first ride.`,
  },
  { key: "long", label: "Long hauls", about: `${LONG_MIN_KM} km or more.` },
];

const HIMALAYAN_STATES = [
  "himachal pradesh",
  "uttarakhand",
  "jammu and kashmir",
  "ladakh",
  "sikkim",
  "arunachal pradesh",
];

const COAST_WORDS = /\b(coast|coastal|beach|beaches|sea|seaside|shore)\b/i;

/** Whether a ride belongs in a curated list. */
export function rideInList(ride: ListRide, key: RideListKey): boolean {
  switch (key) {
    case "himalaya": {
      const region = ride.region.toLowerCase();
      // Darjeeling and Kalimpong are in West Bengal's hills; its plains rides are not Himalayan.
      const bengalHills = region.includes("west bengal") && (ride.highestM ?? 0) >= 1_000;
      return (
        HIMALAYAN_STATES.some((s) => region.includes(s)) ||
        bengalHills ||
        (rideArea(ride.region) === "North and Himalaya" && (ride.highestM ?? 0) >= 2_000)
      );
    }
    case "high-passes":
      return (ride.highestM ?? 0) >= HIGH_PASS_M;
    case "hairpins":
      return ride.hairpins >= HAIRPINS_MIN;
    case "coast":
      return ride.tags.some((t) => COAST_WORDS.test(t));
    case "easy":
      return (
        ride.distanceKm <= EASY_MAX_KM &&
        ride.hairpins <= EASY_MAX_HAIRPINS &&
        (ride.highestM ?? 0) < EASY_MAX_HEIGHT_M
      );
    case "long":
      return ride.distanceKm >= LONG_MIN_KM;
  }
}
