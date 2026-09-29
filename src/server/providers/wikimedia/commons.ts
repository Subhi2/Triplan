import { z } from "zod";
import { fetchJson, ProviderError } from "../http";
import { COMMONS_BATCH, WIKIDATA_BATCH, type CommonsImage, type WikimediaProvider } from "./types";

// Wikidata's query service gives each item's main image (P18); the Commons API gives the image's
// author, licence and thumbnail URLs. Both ask for an identifying User-Agent. Only photo formats
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
        image: z.object({ value: z.string() }),
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

/** P18 bindings -> Wikidata id to "File:<name>". The first image wins when an item has several. */
export function parseImageFiles(data: z.infer<typeof sparqlSchema>): Map<string, string> {
  const files = new Map<string, string>();
  for (const b of data.results.bindings) {
    const id = b.item.value.split("/").pop() ?? "";
    const name = decodeURIComponent(b.image.value.split("/Special:FilePath/")[1] ?? "");
    if (WIKIDATA_ID.test(id) && name && !files.has(id)) files.set(id, `File:${name}`);
  }
  return files;
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
    const author = htmlToText(String(info.extmetadata?.Artist?.value ?? "")).slice(0, 200);
    images.set(asked.get(page.title) ?? page.title, {
      file: page.title,
      url,
      thumbUrl,
      pageUrl: info.descriptionurl,
      author: author || null,
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
    async imageFiles(wikidataIds) {
      const ids = wikidataIds.filter((id) => WIKIDATA_ID.test(id));
      if (ids.length === 0) return new Map();
      if (ids.length > WIKIDATA_BATCH) {
        throw new Error(`At most ${WIKIDATA_BATCH} Wikidata ids per request`);
      }
      const values = ids.map((id) => `wd:${id}`).join(" ");
      const query = `SELECT ?item ?image WHERE { VALUES ?item { ${values} } ?item wdt:P18 ?image }`;
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
      return parseImageFiles(data);
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
