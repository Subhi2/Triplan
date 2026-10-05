import type { LngLat } from "@/lib/geo";
import type { OsmElement } from "../providers/osm";

// Service points from OpenStreetMap (docs/02, "Safety stops"): what each element is, its name and
// phone. Pure, so it is easy to test against real tags.

export const SERVICE_KINDS = ["hospital", "police", "atm", "tyre", "repair", "stay"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export interface ServicePointCandidate {
  osmId: string;
  kind: ServiceKind;
  name: string | null;
  phone: string | null;
  location: LngLat;
}

/** "Puncture", "tyre", "tire" in a shop's name or description: a puncture shop. */
const TYRE_WORDS = /puncture|tyre|tire/i;
/** Stays and hospitals bigger than this are campuses or mapping mistakes, not one point. */
const MAX_EXTENT_M = 3_000;

function firstPhone(tags: Record<string, string>): string | null {
  const raw = tags.phone ?? tags["contact:phone"] ?? tags["contact:mobile"] ?? tags.mobile;
  const first = raw?.split(/[;,]/)[0]?.trim();
  return first ? first.slice(0, 40) : null;
}

function kindOf(tags: Record<string, string>): ServiceKind | null {
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
  if (tags.amenity === "police") return "police";
  if (tags.amenity === "atm" || (tags.amenity === "bank" && tags.atm === "yes")) return "atm";
  const shop = tags.shop;
  if (shop === "tyres") return "tyre";
  if (shop === "motorcycle_repair" || shop === "car_repair" || shop === "motorcycle") {
    return TYRE_WORDS.test(`${tags.name ?? ""} ${tags.description ?? ""}`) ? "tyre" : "repair";
  }
  if (["hotel", "guest_house", "hostel", "motel"].includes(tags.tourism ?? "")) return "stay";
  return null;
}

/** A service point for an element, or null when it is not one we keep (or is closed or private). */
export function classifyService(e: OsmElement): ServicePointCandidate | null {
  const tags = e.tags;
  const kind = kindOf(tags);
  if (!kind) return null;
  if (tags.access === "private" || tags.access === "no") return null;
  if (tags.disused === "yes" || tags.abandoned === "yes" || tags["opening_hours"] === "closed") {
    return null;
  }
  if (e.extentM > MAX_EXTENT_M) return null;
  const name =
    tags.name?.trim() ||
    (kind === "atm" ? tags.brand?.trim() || tags.operator?.trim() : undefined) ||
    null;
  return {
    osmId: e.id,
    kind,
    name: name ? name.slice(0, 120) : null,
    phone: kind === "hospital" || kind === "police" || kind === "stay" ? firstPhone(tags) : null,
    location: e.location,
  };
}
