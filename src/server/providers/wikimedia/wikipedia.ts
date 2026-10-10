import { z } from "zod";
import { fetchJson, ProviderError } from "../http";

// The opening sentences of English Wikipedia articles, as plain text, for place descriptions
// (docs/04, G4 step C2). Wikipedia text is CC BY-SA 4.0: it is shown with a link to the article
// and the licence. Up to 20 articles a request (the API's limit for intros), with a User-Agent.

const API = "https://en.wikipedia.org/w/api.php";
export const EXTRACT_BATCH = 20;
/** Sentences to take from the start of an article. */
const SENTENCES = 3;
/** Longer intros are cut at the last sentence that fits. */
const MAX_CHARS = 600;

export interface WikipediaIntro {
  text: string;
  url: string; // the article, to credit
}

export interface WikipediaProvider {
  /** Intros of articles by title ("Jog Falls"); missing articles and empty intros are left out. */
  intros(titles: string[]): Promise<Map<string, WikipediaIntro>>;
}

export const extractsSchema = z.object({
  query: z
    .object({
      normalized: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      redirects: z.array(z.object({ from: z.string(), to: z.string() })).optional(),
      pages: z.array(
        z.object({
          title: z.string(),
          missing: z.boolean().optional(),
          extract: z.string().optional(),
        }),
      ),
    })
    .optional(),
});

/**
 * Plain text fit for a place page: no pronunciations or names in other scripts in brackets
 * ("Jog Falls (Kannada: ಜೋಗ ಜಲಪಾತ) is..."), single spaces, at most MAX_CHARS ending on a sentence.
 */
export function cleanIntro(text: string): string {
  const plain = text
    .replace(/\s*\([^()]*[^\x00-\x7F][^()]*\)/g, "")
    .replace(/\s*\((?:pronounced|lit\.|listen)[^()]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= MAX_CHARS) return plain;
  const cut = plain.slice(0, MAX_CHARS);
  const end = cut.lastIndexOf(". ");
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export function articleUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** The API's answer -> the titles we asked for, to their intros. */
export function parseExtracts(
  data: z.infer<typeof extractsSchema>,
  asked: string[],
): Map<string, WikipediaIntro> {
  const q = data.query;
  if (!q) return new Map();
  // Follow each asked title through normalisation and redirects to the page's title.
  const step = (map?: { from: string; to: string }[]) => new Map(map?.map((m) => [m.from, m.to]));
  const normalized = step(q.normalized);
  const redirects = step(q.redirects);
  const pages = new Map(q.pages.map((p) => [p.title, p]));
  const intros = new Map<string, WikipediaIntro>();
  for (const title of asked) {
    const n = normalized.get(title) ?? title;
    const page = pages.get(redirects.get(n) ?? n);
    if (!page || page.missing || !page.extract) continue;
    const text = cleanIntro(page.extract);
    if (text) intros.set(title, { text, url: articleUrl(page.title) });
  }
  return intros;
}

export function createWikipediaProvider(userAgent: string): WikipediaProvider {
  return {
    async intros(titles) {
      if (titles.length === 0) return new Map();
      if (titles.length > EXTRACT_BATCH) {
        throw new Error(`At most ${EXTRACT_BATCH} articles per request`);
      }
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        formatversion: "2",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exsentences: String(SENTENCES),
        exlimit: String(EXTRACT_BATCH),
        redirects: "1",
        titles: titles.join("|"),
      });
      const { status, data } = await fetchJson(
        "wikipedia",
        `${API}?${params.toString()}`,
        extractsSchema,
        { headers: { "User-Agent": userAgent, Accept: "application/json" } },
        30_000,
      );
      if (status !== 200) throw new ProviderError(`Wikipedia HTTP ${status}`, "wikipedia", status);
      return parseExtracts(data, titles);
    },
  };
}
