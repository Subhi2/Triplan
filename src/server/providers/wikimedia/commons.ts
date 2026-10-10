import { z } from "zod";
import type { LngLat } from "@/lib/geo";
import { fetchJson, ProviderError } from "../http";
import {
  COMMONS_BATCH,
  WIKIDATA_BATCH,
  type CommonsImage,
  type WikidataItem,
  type WikidataPlaceItem,
  type WikimediaProvider,
} from "./types";

// Wikidata's query service gives each item's main image (P18), coordinates (P625) and whether it
// is a person, to check the link; the Commons API gives the image's author, licence and
// thumbnail URLs. Both ask for an identifying User-Agent. Only photo formats
// are kept (no SVG maps or logos, no PDFs).

const SPARQL_URL = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
/** Commons serves these standard widths from cache; other widths may be refused. */
const WIDTH = 960;
const THUMB_WIDTH = 330;
const WIKIDATA_ID = /^Q\d+$/;

export const sparqlSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        item: z.object({ value: z.string() }),
        image: z.object({ value: z.string() }).optional(),
        coord: z.object({ value: z.string() }).optional(),
        human: z.object({ value: z.string() }).optional(),
        article: z.object({ value: z.string() }).optional(),
        desc: z.object({ value: z.string() }).optional(),
      }),
    ),
  }),
});

const metaValue = z.object({ value: z.union([z.string(), z.number()]) }).optional();

export const imageInfoSchema = z.object({
  query: z
    .object({
      normalized: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      pages: z.array(
        z.object({
          title: z.string(),
          missing: z.boolean().optional(),
          imageinfo: z
            .array(
              z.object({
                url: z.string(),
                thumburl: z.string().optional(),
                thumbwidth: z.number().optional(),
                thumbheight: z.number().optional(),
                width: z.number(),
                height: z.number(),
                descriptionurl: z.string(),
                mime: z.string(),
                extmetadata: z
                  .object({ Artist: metaValue, LicenseShortName: metaValue })
                  .partial()
                  .optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});

export const boxSchema = z.object({
  results: z.object({
    bindings: z.array(
      z.object({
        item: z.object({ value: z.string() }),
        label: z.object({ value: z.string() }),
        loc: z.object({ value: z.string() }),
      }),
    ),
  }),
});

/** Box bindings -> items, one per id (the first coordinates win). */
export function parseBoxItems(data: z.infer<typeof boxSchema>): WikidataPlaceItem[] {
  const items = new Map<string, WikidataPlaceItem>();
  for (const b of data.results.bindings) {
    const id = b.item.value.split("/").pop() ?? "";
    const location = parsePoint(b.loc.value);
    if (!WIKIDATA_ID.test(id) || !location || items.has(id)) continue;
    items.set(id, { id, label: b.label.value.trim(), location });
  }
  return [...items.values()];
}

/** "Point(75.7581 12.9173)" -> [75.7581, 12.9173]. */
function parsePoint(wkt: string | undefined): LngLat | null {
  const m = wkt ? /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/i.exec(wkt) : null;
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Bindings -> Wikidata id to its item. The first image and coordinates win when there are several. */
export function parseItems(data: z.infer<typeof sparqlSchema>): Map<string, WikidataItem> {
  const items = new Map<string, WikidataItem>();
  for (const b of data.results.bindings) {
    const id = b.item.value.split("/").pop() ?? "";
    if (!WIKIDATA_ID.test(id)) continue;
    const item: WikidataItem = items.get(id) ?? {
      file: null,
      human: false,
      location: null,
      enwiki: null,
      description: null,
    };
    const name = decodeURIComponent(b.image?.value.split("/Special:FilePath/")[1] ?? "");
    if (!item.file && name) item.file = `File:${name}`;
    item.human ||= b.human?.value === "true";
    item.location ??= parsePoint(b.coord?.value);
    // https://en.wikipedia.org/wiki/Jog_Falls -> "Jog Falls"
    const article = b.article?.value.split("/wiki/")[1];
    item.enwiki ??= article ? decodeURIComponent(article).replace(/_/g, " ") : null;
    item.description ??= b.desc?.value.trim() || null;
    items.set(id, item);
  }
  return items;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  nbsp: " ",
};

/** Commons returns the author as HTML (links, spans): keep the text only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Longer credits (whole paragraphs on some files) are cut; the full one is on the file page. */
const MAX_AUTHOR_CHARS = 80;

/**
 * A credit fit for a caption: no "Unknown author" (the page then says so and links the file
 * page), and at most MAX_AUTHOR_CHARS, cut at a word.
 */
export function tidyAuthor(text: string): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || /^(unknown author\s*)+$/i.test(t)) return null;
  if (t.length <= MAX_AUTHOR_CHARS) return t;
  const cut = t.slice(0, MAX_AUTHOR_CHARS);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim()}…`;
}

/** Drops the utm_* tracking parameters Commons adds to its URLs. */
export function cleanUrl(url: string): string {
  const u = new URL(url);
  for (const key of [...u.searchParams.keys()]) {
    if (key.startsWith("utm_")) u.searchParams.delete(key);
  }
  return u.toString();
}

export function parseImageInfo(data: z.infer<typeof imageInfoSchema>): Map<string, CommonsImage> {
  const images = new Map<string, CommonsImage>();
  // Titles Commons uses (underscores, first letter upper case) -> the titles we sent.
  const asked = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
  for (const page of data.query?.pages ?? []) {
    const info = page.imageinfo?.[0];
    if (page.missing || !info || !PHOTO_MIME.has(info.mime)) continue;
    const license = String(info.extmetadata?.LicenseShortName?.value ?? "").trim();
    if (!license) continue; // no licence stated: not safe to show
    // Smaller than 960 px: Commons returns the original, which then serves as both sizes.
    const scaled = info.thumburl !== undefined && info.thumbwidth === WIDTH;
    const url = cleanUrl(scaled ? info.thumburl! : info.url);
    const thumbUrl = scaled ? url.replace(`/${WIDTH}px-`, `/${THUMB_WIDTH}px-`) : url;
    const author = tidyAuthor(htmlToText(String(info.extmetadata?.Artist?.value ?? "")));
    images.set(asked.get(page.title) ?? page.title, {
      file: page.title,
      url,
      thumbUrl,
      pageUrl: info.descriptionurl,
      author,
      license,
      width: scaled ? (info.thumbwidth ?? info.width) : info.width,
      height: scaled ? (info.thumbheight ?? info.height) : info.height,
    });
  }
  return images;
}

export function createWikimediaProvider(userAgent: string): WikimediaProvider {
  const headers = { "User-Agent": userAgent, Accept: "application/json" };
  return {
    async items(wikidataIds) {
      const ids = wikidataIds.filter((id) => WIKIDATA_ID.test(id));
      if (ids.length === 0) return new Map();
      if (ids.length > WIKIDATA_BATCH) {
        throw new Error(`At most ${WIKIDATA_BATCH} Wikidata ids per request`);
      }
      const values = ids.map((id) => `wd:${id}`).join(" ");
      const query =
        `SELECT ?item ?image ?coord ?human ?article ?desc WHERE { VALUES ?item { ${values} } ` +
        "OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?item wdt:P625 ?coord } " +
        "OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } " +
        'OPTIONAL { ?item schema:description ?desc FILTER(lang(?desc) = "en") } ' +
        "BIND(EXISTS { ?item wdt:P31 wd:Q5 } AS ?human) }";
      const { status, data } = await fetchJson(
        "wikidata",
        SPARQL_URL,
        sparqlSchema,
        {
          method: "POST",
          headers: {
            ...headers,
            Accept: "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ query }).toString(),
        },
        60_000,
      );
      if (status !== 200) throw new ProviderError(`Wikidata HTTP ${status}`, "wikidata", status);
      return parseItems(data);
    },

    async itemsInBox([west, south, east, north]) {
      const query =
        "SELECT ?item ?label ?loc WHERE { SERVICE wikibase:box { ?item wdt:P625 ?loc . " +
        `bd:serviceParam wikibase:cornerSouthWest "Point(${west} ${south})"^^geo:wktLiteral . ` +
        `bd:serviceParam wikibase:cornerNorthEast "Point(${east} ${north})"^^geo:wktLiteral . } ` +
        '?item rdfs:label ?label . FILTER(lang(?label) = "en") ' +
        "FILTER NOT EXISTS { ?item wdt:P1082 [] } FILTER NOT EXISTS { ?item wdt:P31 wd:Q5 } }";
      const { status, data } = await fetchJson(
        "wikidata",
        SPARQL_URL,
        boxSchema,
        {
          method: "POST",
          headers: {
            ...headers,
            Accept: "application/sparql-results+json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ query }).toString(),
        },
        90_000,
      );
      if (status !== 200) throw new ProviderError(`Wikidata HTTP ${status}`, "wikidata", status);
      return parseBoxItems(data);
    },

    async imageInfo(files) {
      if (files.length === 0) return new Map();
      if (files.length > COMMONS_BATCH) {
        throw new Error(`At most ${COMMONS_BATCH} Commons files per request`);
      }
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "imageinfo",
        iiprop: "url|size|mime|extmetadata",
        iiurlwidth: String(WIDTH),
        iiextmetadatafilter: "Artist|LicenseShortName",
        titles: files.join("|"),
      });
      const { status, data } = await fetchJson(
        "commons",
        `${COMMONS_API}?${params.toString()}`,
        imageInfoSchema,
        { headers },
        30_000,
      );
      if (status !== 200) throw new ProviderError(`Commons HTTP ${status}`, "commons", status);
      return parseImageInfo(data);
    },
  };
}
