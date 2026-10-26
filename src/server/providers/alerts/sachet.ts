import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { ALERT_SEVERITIES, type AlertSeverity } from "@/lib/alerts";
import { simplifyLine, type LngLat } from "@/lib/geo";
import type { JsonCache } from "../../db/cache";
import { createThrottle, fetchText, ProviderError } from "../http";
import { softGet, softSet } from "../softCache";
import type { AlertsProvider, CapAlert } from "./types";

// NDMA's SACHET (docs/02, "Alerts on the route"). Each state has an RSS feed of its latest alerts
// (`rss/rss_<name>.xml`, the feed calls itself public domain); each item is a CAP 1.2 message
// (`FetchXMLFile?identifier=<guid>`) whose areas are in a separate file of district or mandal
// outlines (`FetchPolygonXMLFile?identifier=<guid>`, "lat,lon" pairs, 100–500 KB). No CORS, so
// only the server reads them.

/** Feed items older than this are not read. Alerts last hours to a few days. */
const LISTED_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
/** Outlines are simplified to this, in metres: plenty for "does the road enter the district". */
const AREA_TOLERANCE_M = 200;
const CONCURRENCY = 4;
const TIMEOUT_MS = 10_000;

// The area files sit behind a firewall that blocks an address after a burst of downloads (it
// answered 403 for hours after about 30 in a few minutes, 2026-10-14). Districts usually come
// from our own outlines by LGD code (alertsService), so files are a fallback: one at a time, 2 s
// apart, a few per request, and none for 6 hours after a 403.
const areaThrottle = createThrottle(2_000, Date.now, 10_000);
const BLOCKED_KEY = "sachet:v1:blocked";
const BLOCKED_FOR_MS = 6 * 60 * 60 * 1000;

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  // Keep every value a string: identifiers are 16 digits and dates must stay as written.
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["item", "info", "parameter", "area", "polygon", "geocode"].includes(name),
});

const text = z.string().optional().catch(undefined);

const rssSchema = z.object({
  rss: z.object({
    channel: z.object({
      item: z
        .array(
          z.object({
            title: text,
            author: text,
            guid: z.string(),
            pubDate: text,
          }),
        )
        .optional(),
    }),
  }),
});

const capSchema = z.object({
  alert: z.object({
    identifier: z.string(),
    sender: text,
    sent: text,
    msgType: text,
    references: text,
    info: z
      .array(
        z.object({
          language: text,
          event: text,
          urgency: text,
          severity: text,
          certainty: text,
          onset: text,
          expires: text,
          headline: text,
          parameter: z.array(z.object({ valueName: text, value: text })).optional(),
          area: z
            .array(
              z.object({
                areaDesc: text,
                polygon: z.array(z.string()).optional(),
                geocode: z.array(z.object({ valueName: text, value: text })).optional(),
              }),
            )
            .optional(),
        }),
      )
      .min(1),
  }),
});

const areaFileSchema = z.object({
  alert: z.object({ polygon: z.array(z.string()).optional() }),
});

export interface FeedItem {
  guid: string;
  title: string;
  /** "IMD Bengaluru", from "controlroom@ndma.gov.in (IMD Bengaluru)". */
  issuer: string | null;
  /** ISO time, or null when the feed's date could not be read. */
  listed: string | null;
}

/** The items of a SACHET RSS feed. Items with an unexpected id are left out. */
export function parseFeed(xml: string): FeedItem[] {
  const items = rssSchema.parse(parser.parse(xml)).rss.channel.item ?? [];
  return items
    .filter((it) => /^\d{6,30}$/.test(it.guid))
    .map((it) => {
      const listed = it.pubDate ? Date.parse(it.pubDate) : NaN;
      return {
        guid: it.guid,
        title: it.title ?? "",
        issuer: it.author?.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() ?? null,
        listed: Number.isFinite(listed) ? new Date(listed).toISOString() : null,
      };
    });
}

/** "lat,lon lat,lon …" (CAP's order) as a ring of [lng, lat], simplified. */
export function parseRing(polygon: string): LngLat[] {
  const ring: LngLat[] = [];
  for (const pair of polygon.trim().split(/\s+/)) {
    const [lat, lng] = pair.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat!) <= 90) {
      ring.push([lng!, lat!]);
    }
  }
  return simplifyLine(ring, AREA_TOLERANCE_M).map(([lng, lat]) => [
    Number(lng.toFixed(4)),
    Number(lat.toFixed(4)),
  ]);
}

function rings(polygons: string[] | undefined): LngLat[][] {
  return (polygons ?? []).map(parseRing).filter((r) => r.length >= 4);
}

/** The rings of an area file (`FetchPolygonXMLFile`). */
export function parseAreaFile(xml: string): LngLat[][] {
  return rings(areaFileSchema.parse(parser.parse(xml)).alert.polygon);
}

function severity(s: string | undefined): AlertSeverity {
  return ALERT_SEVERITIES.find((v) => v.toLowerCase() === s?.toLowerCase()) ?? "Unknown";
}

/**
 * A CAP message as an alert, taking the English part when there are several languages. Null when
 * it has no expiry (it could never be judged current).
 */
export function parseCap(xml: string, item: FeedItem, feed: string, url: string): CapAlert | null {
  const { alert } = capSchema.parse(parser.parse(xml));
  const info = alert.info.find((i) => i.language?.toLowerCase().startsWith("en")) ?? alert.info[0]!;
  const expires = info.expires ? Date.parse(info.expires) : NaN;
  if (!Number.isFinite(expires)) return null;
  const onset = info.onset ? Date.parse(info.onset) : NaN;
  const areas = info.area ?? [];
  const sender = alert.sender ?? "";
  return {
    guid: item.guid,
    id: alert.identifier,
    feed,
    msgType: alert.msgType ?? "Alert",
    // "sender,identifier,sent" triples separated by spaces.
    references: (alert.references ?? "")
      .split(/\s+/)
      .map((ref) => ref.split(",")[1]?.trim())
      .filter((id): id is string => Boolean(id)),
    sender,
    issuer: item.issuer ?? sender.replace(/-/g, " "),
    listed: item.listed ?? new Date(0).toISOString(),
    event: info.event ?? "Alert",
    headline: info.headline || item.title,
    severity: severity(info.severity),
    urgency: info.urgency ?? "Unknown",
    certainty: info.certainty ?? "Unknown",
    onset: Number.isFinite(onset) ? new Date(onset).toISOString() : null,
    expires: new Date(expires).toISOString(),
    area: areas
      .map((a) => a.areaDesc)
      .filter(Boolean)
      .join("; "),
    districtCodes: [
      ...new Set(
        areas
          .flatMap((a) => a.geocode ?? [])
          .filter((g) => /lgd district/i.test(g.valueName ?? ""))
          .map((g) => Number(g.value))
          .filter((n) => Number.isInteger(n) && n > 0),
      ),
    ],
    rings: areas.flatMap((a) => rings(a.polygon)),
    hasAreaFile: (info.parameter ?? []).some((p) => p.valueName?.toLowerCase() === "polygon url"),
    url,
  };
}

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

export interface SachetOptions {
  /** "https://sachet.ndma.gov.in/cap_public_website" */
  baseUrl: string;
  userAgent: string;
  /** Feeds change every few minutes: a 10-minute cache. */
  feedCache: JsonCache;
  /** Messages and areas never change: kept a week. */
  fileCache: JsonCache;
  /** Messages and area files fetched per provider (one provider per request). */
  maxMessages?: number;
  maxAreaFiles?: number;
  now?: () => number;
  /** Waits for an area file's turn; shared by every request on this server (tests skip it). */
  areaTurn?: () => Promise<void>;
}

/** A cached message: the alert (its feed is set again from the listing), or a message to skip. */
type CachedCap = CapAlert | { skip: true };

export function createSachetProvider(opts: SachetOptions): AlertsProvider {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const now = opts.now ?? Date.now;
  const init = { headers: { "User-Agent": opts.userAgent } };
  let messagesLeft = opts.maxMessages ?? 40;
  let areaFilesLeft = opts.maxAreaFiles ?? 3;

  async function feed(name: string): Promise<FeedItem[] | null> {
    const key = `sachet:v1:feed:${name}`;
    const hit = await softGet(opts.feedCache, key);
    if (Array.isArray(hit)) return hit as FeedItem[];
    try {
      const xml = await fetchText("sachet", `${base}/rss/rss_${name}.xml`, init, TIMEOUT_MS);
      const items = parseFeed(xml);
      await softSet(opts.feedCache, key, items);
      return items;
    } catch (err) {
      console.warn(`SACHET feed ${name} failed: ${(err as Error).message}`);
      return null;
    }
  }

  return {
    async alerts(feeds, wanted = () => true) {
      let complete = true;
      const lists = await mapLimited(feeds, CONCURRENCY, feed);
      // With no feed at all there is nothing to say, not "no alerts".
      if (feeds.length > 0 && lists.every((list) => list === null)) {
        throw new ProviderError("No SACHET feed could be read", "sachet");
      }
      const seen = new Set<string>();
      const items = lists
        .flatMap((list, i) => {
          if (!list) complete = false;
          return (list ?? []).map((item) => ({ item, feed: feeds[i]! }));
        })
        .filter(({ item, feed: name }) => {
          if (seen.has(item.guid)) return false; // a state's feed and India's list the same alert
          seen.add(item.guid);
          const recent = !item.listed || Date.parse(item.listed) > now() - LISTED_WITHIN_MS;
          return recent && wanted({ feed: name, issuer: item.issuer, title: item.title });
        })
        .sort((a, b) => (b.item.listed ?? "").localeCompare(a.item.listed ?? ""));

      const alerts = await mapLimited(items, CONCURRENCY, async ({ item, feed: name }) => {
        const key = `sachet:v2:cap:${item.guid}`;
        const hit = (await softGet(opts.fileCache, key)) as CachedCap | undefined;
        if (hit) return "skip" in hit ? null : { ...hit, feed: name };
        if (messagesLeft <= 0) {
          complete = false;
          return null;
        }
        messagesLeft--;
        const url = `${base}/FetchXMLFile?identifier=${item.guid}`;
        try {
          const cap = parseCap(await fetchText("sachet", url, init, TIMEOUT_MS), item, name, url);
          await softSet(opts.fileCache, key, cap ?? { skip: true });
          return cap;
        } catch (err) {
          complete = false;
          console.warn(`SACHET message ${item.guid} failed: ${(err as Error).message}`);
          return null;
        }
      });
      return { alerts: alerts.filter((a): a is CapAlert => a !== null), complete };
    },

    async areas(alert) {
      if (alert.rings.length > 0 || !alert.hasAreaFile) return alert.rings;
      const key = `sachet:v1:area:${alert.guid}`;
      const hit = await softGet(opts.fileCache, key);
      if (Array.isArray(hit)) return hit as LngLat[][];
      if (areaFilesLeft <= 0) return null;
      const blocked = (await softGet(opts.fileCache, BLOCKED_KEY)) as { until: number } | undefined;
      if (blocked && blocked.until > now()) return null;
      areaFilesLeft--;
      try {
        await (opts.areaTurn ?? areaThrottle)();
        const url = `${base}/FetchPolygonXMLFile?identifier=${alert.guid}`;
        const parsed = parseAreaFile(await fetchText("sachet", url, init, 15_000, 8_000_000));
        await softSet(opts.fileCache, key, parsed);
        return parsed;
      } catch (err) {
        console.warn(`SACHET areas ${alert.guid} failed: ${(err as Error).message}`);
        if (err instanceof ProviderError && err.status === 403) {
          await softSet(opts.fileCache, BLOCKED_KEY, { until: now() + BLOCKED_FOR_MS });
        }
        return null;
      }
    },
  };
}
