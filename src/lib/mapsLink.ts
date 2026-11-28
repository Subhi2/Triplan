import type { LngLat } from "./geo";

// "Share to Triplan" (G12, A2): a link or text shared from another app (Google Maps, mostly) read
// into trip stops. Full Google Maps links are read for their coordinates and names; short links
// (maps.app.goo.gl) are never followed or fetched: the place name in the shared text is searched
// in our own places and the geocoder instead.

/** A stop from a shared link: a point, or a name still to be found. */
export interface SharedStop {
  label: string;
  location: LngLat | null;
}

const LAT_LNG = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** "12.97,77.59" -> [77.59, 12.97] (links write latitude first); null when not a point. */
function latLng(s: string): LngLat | null {
  const m = LAT_LNG.exec(s);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
}

const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, " ")).trim();

function isGoogleMaps(u: URL): boolean {
  const host = u.hostname.replace(/^www\./, "");
  return (
    (/^google\.[a-z.]+$/.test(host) && u.pathname.startsWith("/maps")) ||
    /^maps\.google\.[a-z.]+$/.test(host)
  );
}

/** A stop from one value: a point, or a name. */
function stopFrom(value: string, fallbackLabel: string): SharedStop | null {
  const v = decode(value);
  if (!v) return null;
  const at = latLng(v);
  return at ? { label: fallbackLabel, location: at } : { label: v, location: null };
}

/**
 * The stops a Google Maps link names, in order: /dir/A/B, ?origin=&destination=, ?q= or
 * ?query=, /place/<name>/@lat,lng, or /@lat,lng. Null for any other link (including short
 * links, which are not followed).
 */
export function parseMapsLink(url: string): SharedStop[] | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !isGoogleMaps(u)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(u.pathname);
  const atPoint = at ? latLng(`${at[1]},${at[2]}`) : null;

  const q = u.searchParams;
  if (q.get("api") === "1" && (q.get("destination") || q.get("query"))) {
    const out: SharedStop[] = [];
    const origin = q.get("origin");
    if (origin) out.push(stopFrom(origin, "Start")!);
    const dest = q.get("destination") ?? q.get("query")!;
    out.push(stopFrom(dest, "Shared place")!);
    return out.filter(Boolean);
  }
  // Directions: /maps/dir/<from>/<to>/... (the @ part and data= are not stops)
  const dir = parts.indexOf("dir");
  if (dir >= 0) {
    const stops = parts
      .slice(dir + 1)
      .filter((p) => !p.startsWith("@") && !p.startsWith("data="))
      .map((p, i) => stopFrom(p, i === 0 ? "Start" : "Stop"))
      .filter((s): s is SharedStop => s !== null);
    return stops.length > 0 ? stops : null;
  }
  const query = q.get("q") ?? q.get("query");
  if (query) {
    const s = stopFrom(query, "Shared place");
    return s ? [s] : null;
  }
  const place = parts.indexOf("place");
  if (place >= 0 && parts[place + 1]) {
    return [{ label: decode(parts[place + 1]!), location: atPoint }];
  }
  return atPoint ? [{ label: "Shared place", location: atPoint }] : null;
}

/** The first https link in a piece of text. */
export function firstLink(text: string): string | null {
  return /https:\/\/[^\s<>"]+/.exec(text)?.[0] ?? null;
}

/**
 * What a share brought (title, text, url), as stops: a full Google Maps link's stops, else the
 * place's name (Google Maps puts it on the first line of the text, before the short link).
 */
export function stopsFromShare(share: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): SharedStop[] {
  const text = share.text ?? "";
  const link = share.url || firstLink(text);
  const fromLink = link ? parseMapsLink(link) : null;
  if (fromLink) return fromLink;
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^https?:\/\//.test(l));
  const name = (share.title?.trim() || firstLine || "").slice(0, 120);
  return name ? [{ label: name, location: null }] : [];
}
