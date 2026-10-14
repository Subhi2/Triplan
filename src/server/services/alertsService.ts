import { sql } from "drizzle-orm";
import type { LineString } from "geojson";
import {
  firstKmInside,
  routeSamples,
  severityRank,
  sortAlerts,
  type RouteAlert,
  type RouteAlertsResponse,
} from "@/lib/alerts";
import { resampleLine, type LngLat } from "@/lib/geo";
import { getDb } from "../db";
import type { AlertsProvider, CapAlert } from "../providers/alerts";
import { normalizeDistrictName } from "./districtImportService";
import { isOsmRegionKey, OSM_REGIONS, type OsmRegionKey } from "./osmRegions";

// Official alerts on the route (docs/02, "Alerts on the route"). The alert feeds list every
// state's alerts with no geometry. Most alerts name their districts by LGD code, matched to the
// districts the route passes through (our own outlines, `district`); river floods name the
// district in words; the rest have only a file of outlines, read sparingly.

/** SACHET's short name for each state's feed: `rss/rss_<name>.xml`. */
export const SACHET_FEEDS: Record<OsmRegionKey, string> = {
  karnataka: "karnataka",
  kerala: "kerala",
  "tamil-nadu": "tamil",
  goa: "goa",
  maharashtra: "maharashtra",
  "andhra-pradesh": "andhra",
  telangana: "telangana",
  puducherry: "puducherry",
  gujarat: "gujarat",
  rajasthan: "rajasthan",
  "madhya-pradesh": "madhya",
  "himachal-pradesh": "himachal",
  uttarakhand: "uttarakhand",
  "jammu-and-kashmir": "jammu",
  ladakh: "ladakh",
  punjab: "punjab",
  haryana: "haryana",
  delhi: "delhi",
  chandigarh: "chandigarh",
  "uttar-pradesh": "uttar",
  bihar: "bihar",
  jharkhand: "jharkhand",
  chhattisgarh: "chhattisgarh",
  odisha: "odisha",
  "west-bengal": "west",
  sikkim: "sikkim",
  assam: "assam",
  meghalaya: "meghalaya",
  "arunachal-pradesh": "arunachal",
  nagaland: "nagaland",
  manipur: "manipur",
  mizoram: "mizoram",
  tripura: "tripura",
  "andaman-and-nicobar": "andaman",
  lakshadweep: "lakshadweep",
  "dadra-nagar-haveli-daman-diu": "dadra",
};

/** The all-India feed: the latest hundred alerts from every state, and national ones (CWC). */
export const INDIA_FEED = "india";

/**
 * Other names an alert may use for a state, and IMD's regional centres with the states they warn
 * for ("IMD-Chennai" issues Tamil Nadu's and Puducherry's alerts).
 */
const NAMES: [string, OsmRegionKey[]][] = [
  ["pondicherry", ["puducherry"]],
  ["karaikal", ["puducherry"]],
  ["orissa", ["odisha"]],
  ["jammu", ["jammu-and-kashmir"]],
  ["kashmir", ["jammu-and-kashmir"]],
  ["andaman", ["andaman-and-nicobar"]],
  ["nicobar", ["andaman-and-nicobar"]],
  ["daman", ["dadra-nagar-haveli-daman-diu"]],
  ["dadra", ["dadra-nagar-haveli-daman-diu"]],
  ["chennai", ["tamil-nadu", "puducherry"]],
  ["bengaluru", ["karnataka"]],
  ["bangalore", ["karnataka"]],
  ["thiruvananthapuram", ["kerala"]],
  ["hyderabad", ["telangana"]],
  ["amaravati", ["andhra-pradesh"]],
  ["visakhapatnam", ["andhra-pradesh"]],
  ["mumbai", ["maharashtra"]],
  ["nagpur", ["maharashtra"]],
  ["kolkata", ["west-bengal", "sikkim", "andaman-and-nicobar"]],
  ["gangtok", ["sikkim"]],
  [
    "guwahati",
    ["assam", "meghalaya", "arunachal-pradesh", "nagaland", "manipur", "mizoram", "tripura"],
  ],
  ["bhubaneswar", ["odisha"]],
  ["patna", ["bihar"]],
  ["ranchi", ["jharkhand"]],
  ["lucknow", ["uttar-pradesh"]],
  ["bhopal", ["madhya-pradesh"]],
  ["raipur", ["chhattisgarh"]],
  ["ahmedabad", ["gujarat", "dadra-nagar-haveli-daman-diu"]],
  ["jaipur", ["rajasthan"]],
  ["dehradun", ["uttarakhand"]],
  ["shimla", ["himachal-pradesh"]],
  ["srinagar", ["jammu-and-kashmir", "ladakh"]],
  ["leh", ["ladakh"]],
  ["agartala", ["tripura"]],
  ["imphal", ["manipur"]],
  ["aizawl", ["mizoram"]],
  ["kohima", ["nagaland"]],
  ["itanagar", ["arunachal-pradesh"]],
  ["shillong", ["meghalaya"]],
];

const REGION_KEYS = Object.keys(OSM_REGIONS) as OsmRegionKey[];

/** Lower-case words padded with spaces, so " goa " matches "IMD Goa" but not "Goalpara". */
function words(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()} `;
}

/**
 * The states an alert is for: its state's feed, else the states its sender, issuer and area name
 * ("Andhra-Pradesh-SDMA", "IMD Chennai", "4 districts of Tamil Nadu"). Null when none can be told
 * (national issuers such as CWC): its areas are then read to find out.
 */
export function alertRegions(
  alert: Pick<CapAlert, "feed" | "sender" | "issuer" | "area">,
): OsmRegionKey[] | null {
  const byFeed = REGION_KEYS.find((key) => SACHET_FEEDS[key] === alert.feed);
  if (byFeed) return [byFeed];
  const text = words(`${alert.sender} ${alert.issuer} ${alert.area}`);
  const found = new Set<OsmRegionKey>();
  for (const key of REGION_KEYS) {
    if (text.includes(words(OSM_REGIONS[key].name))) found.add(key);
  }
  for (const [name, keys] of NAMES) {
    if (text.includes(` ${name} `)) keys.forEach((key) => found.add(key));
  }
  return found.size > 0 ? [...found] : null;
}

/** A district the route passes through (districts_along_route, migration 0019). */
export interface RouteDistrict {
  lgdCode: number | null;
  name: string;
  /** Normalized names (normalizeDistrictName). */
  names: string[];
  region: OsmRegionKey;
  kmFromStart: number;
}

interface DistrictRawRow extends Record<string, unknown> {
  lgd_code: number | null;
  name: string;
  names: string[];
  region: string;
  km_from_start: number | string | null;
}

/** The districts the route passes through, in km order; empty when the database cannot tell. */
export async function routeDistricts(geometry: LineString): Promise<RouteDistrict[]> {
  try {
    const rows = await getDb().execute<DistrictRawRow>(
      sql`SELECT * FROM districts_along_route(${JSON.stringify(geometry)})`,
    );
    return rows.flatMap((r) =>
      isOsmRegionKey(r.region)
        ? [
            {
              lgdCode: r.lgd_code,
              name: r.name,
              names: r.names,
              region: r.region,
              kmFromStart: Number(r.km_from_start ?? 0),
            },
          ]
        : [],
    );
  } catch (err) {
    console.warn(`Districts along the route failed: ${(err as Error).message}`);
    return [];
  }
}

/** States whose bounding box holds a point of the route: wide, since state boxes overlap. */
export function regionsByBox(points: LngLat[]): OsmRegionKey[] {
  return REGION_KEYS.filter((key) => {
    const [west, south, east, north] = OSM_REGIONS[key].bbox;
    return points.some(([x, y]) => x >= west && x <= east && y >= south && y <= north);
  });
}

/** A state's key from its name as an alert writes it ("Bihar", "Tamil Nadu"). */
function regionByName(name: string): OsmRegionKey | null {
  const w = words(name);
  return REGION_KEYS.find((key) => words(OSM_REGIONS[key].name) === w) ?? null;
}

/**
 * Where the route enters an alert's districts, from what the alert says: LGD codes, or for river
 * floods the district and state in words ("Ganga, Patna Gandhighat, Patna, Bihar"). Null when it
 * names districts the route does not pass; undefined when it names none we can match (its area
 * file is the only way to tell).
 */
export function kmByDistricts(
  alert: Pick<CapAlert, "districtCodes" | "area">,
  districts: RouteDistrict[],
): number | null | undefined {
  if (alert.districtCodes.length > 0) {
    const codes = new Set(alert.districtCodes);
    const hit = districts.find((d) => d.lgdCode !== null && codes.has(d.lgdCode));
    if (hit) return hit.kmFromStart;
    // A district on the route without a code in OSM could be one of them: let the file decide.
    return districts.some((d) => d.lgdCode === null) ? undefined : null;
  }
  const parts = alert.area.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    const state = regionByName(parts.at(-1)!);
    const name = normalizeDistrictName(parts.at(-2)!);
    if (state && name) {
      const hit = districts.find((d) => d.region === state && d.names.includes(name));
      if (hit) return hit.kmFromStart;
      // The district is known in words; the route passes it or not.
      return districts.some((d) => d.region === state) ? null : undefined;
    }
  }
  return undefined;
}

/** Alerts whose areas are read per request (cached ones cost nothing). */
const MAX_AREA_CHECKS = 30;

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * Alerts that are still current, with the ones an update or cancellation replaced, and the
 * cancellations themselves, left out.
 */
export function currentAlerts(alerts: CapAlert[], now: number): CapAlert[] {
  const replaced = new Set(alerts.flatMap((a) => a.references));
  const seen = new Set<string>();
  return alerts.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return (
      a.msgType.toLowerCase() !== "cancel" && !replaced.has(a.id) && Date.parse(a.expires) > now
    );
  });
}

function toRouteAlert(a: CapAlert, km: number): RouteAlert {
  return {
    id: a.id,
    event: a.event,
    headline: a.headline,
    severity: a.severity,
    urgency: a.urgency,
    certainty: a.certainty,
    issuer: a.issuer,
    area: a.area,
    onset: a.onset,
    expires: a.expires,
    kmFromStart: Math.round(km * 10) / 10,
    url: a.url,
  };
}

/**
 * The current alerts whose areas the route enters, worst first. Alerts for other states are not
 * looked at; `partial` is set when some in the route's states could not be checked this time.
 */
export async function alertsAlongRoute(
  geometry: LineString,
  provider: AlertsProvider,
  now = Date.now(),
): Promise<RouteAlertsResponse> {
  const coords = geometry.coordinates as LngLat[];
  const districts = await routeDistricts(geometry);
  // Without districts (database down), the states whose boxes the route crosses, and only
  // area files can place an alert.
  const regions =
    districts.length > 0
      ? [...new Set(districts.map((d) => d.region))]
      : regionsByBox([...resampleLine(coords, 10_000), coords.at(-1)!]);
  // The states' own feeds first, so an alert listed in both is credited to its state.
  const feeds = [...new Set(regions.map((key) => SACHET_FEEDS[key])), INDIA_FEED];
  const onRoute = new Set(regions);
  const forRoute = (states: OsmRegionKey[] | null) =>
    states === null || states.some((key) => onRoute.has(key));
  // India's feed lists every state's alerts: its issuer and headline tell most of them apart
  // before their messages are fetched.
  const { alerts, complete } = await provider.alerts(feeds, ({ feed, issuer, title }) =>
    forRoute(alertRegions({ feed, sender: "", issuer: issuer ?? "", area: title })),
  );

  const candidates = currentAlerts(alerts, now)
    .map((alert) => ({ alert, states: alertRegions(alert) }))
    .filter(({ states }) => forRoute(states))
    // The route's own states first, then national alerts; worst first within each.
    .sort(
      (a, b) =>
        Number(a.states === null) - Number(b.states === null) ||
        severityRank(a.alert.severity) - severityRank(b.alert.severity),
    );
  const checked = candidates.slice(0, MAX_AREA_CHECKS);
  let partial = !complete || candidates.length > checked.length;

  const samples = routeSamples(coords);
  const found = await mapLimited(checked, 4, async ({ alert }) => {
    const byDistrict = districts.length > 0 ? kmByDistricts(alert, districts) : undefined;
    if (byDistrict !== undefined) {
      return byDistrict === null ? null : toRouteAlert(alert, byDistrict);
    }
    const rings = await provider.areas(alert);
    if (rings === null) {
      partial = true;
      return null;
    }
    const km = firstKmInside(samples, rings);
    return km === null ? null : toRouteAlert(alert, km);
  });
  return { alerts: sortAlerts(found.filter((a): a is RouteAlert => a !== null)), partial };
}
