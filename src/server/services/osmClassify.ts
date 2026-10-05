import { slugify } from "@/lib/slug";
import type { CategorySlug } from "@/lib/categories";
import { haversineM, type LngLat } from "@/lib/geo";
import type { OsmElement } from "../providers/osm";

export interface OsmPlaceCandidate {
  osmId: string;
  slug: string;
  name: string;
  altNames: string[];
  category: CategorySlug;
  location: LngLat;
  population: number | null;
  wikidataId: string | null;
  osmTags: Record<string, string>;
  /** Wildlife areas: the lines of the outline (the import builds the polygon in PostGIS). */
  outline?: LngLat[][];
}

/** Tags worth keeping on the place row (provenance, later guide fields). */
const KEPT_TAGS = [
  "tourism",
  "historic",
  "castle_type",
  "natural",
  "waterway",
  "water",
  "landuse",
  "amenity",
  "place",
  "religion",
  "denomination",
  "memorial",
  "heritage",
  "wikidata",
  "wikipedia",
  "boundary",
  "protect_class",
  "protection_title",
  "leisure",
  "garden:type",
  "brand",
  "operator",
  "opening_hours",
  "ele",
  "population",
  "website",
  "fee",
  "description",
];

const NAME_TAGS = [
  "name",
  "name:en",
  "int_name",
  "official_name",
  "name:kn",
  "name:ta",
  "name:ml",
  "name:mr",
  "name:kok",
  "name:hi",
  "name:te",
  "name:bn",
  "name:gu",
  "name:pa",
  "name:or",
  "name:as",
  "name:ur",
  "name:ne",
  "alt_name",
  "old_name",
  "short_name",
];

const TEMPLE_RELIGIONS = new Set(["hindu", "jain", "buddhist"]);
const LATIN = /[A-Za-z]/;
const LETTER = /\p{L}/u;

// historic=castle in India covers forts, palaces, and houses mappers tagged by mistake.
const FORT_CASTLE_TYPES = new Set(["fortress", "defensive", "castrum", "kremlin"]);
const PALACE_CASTLE_TYPES = new Set(["palace", "stately", "manor", "chateau"]);
const FORT_WORDS =
  /\b(forts?|fortress|citadel|kote|killa|kila|qila|qilla|durg|durga|droog|garh|gadh?)\b|(durga|garh|gadh?|ghur|kote)\b/i;
// "Wada" is a Marathi mansion or palace (Shaniwar Wada, Bhor Rajwada).
const PALACE_WORDS =
  /\b(palace|mahal|kottaram|kovilakam|vilas|vilasam|haveli|raja?wada|wada|residency)\b|wada\b/i;
// Private homes and venues that mappers tagged as castles.
const HOUSE_WORDS =
  /\b(house|villa|bungalow|bunglow|residence|regency|manzil|niwas|nivas|home|cottage|apartments?|flats?|hall|auditorium)\b/i;
/**
 * Protected areas that are worth a stop: national parks, wildlife and bird sanctuaries, tiger and
 * elephant reserves. India also maps thousands of reserved forests and biosphere reserves as
 * protected areas; those are not places to visit.
 */
const WILD_WORDS =
  /\b(national park|wildlife|sanctuary|wls|w\.l\.s|tiger reserve|elephant reserve|bird|conservation reserve|zoo|zoological|safari|deer park|biological park)\b/i;
const NOT_WILD_WORDS =
  /\b(reserved? forests?|r\.? ?f\.?|forest block|biosphere|eco[- ]?sensitive|esz|community reserve|forest reserve)\b/i;
/** IUCN classes for strict reserves and national parks. */
const WILD_PROTECT_CLASSES = new Set(["1", "1a", "1b", "2"]);
/** An outline is kept for areas wider than this; smaller ones are found by their point. */
const MIN_OUTLINE_EXTENT_M = 1_000;
/** Names that only say what the place is ("Temple", "Mandir"): too vague for a list. */
const GENERIC_TEMPLE_NAMES =
  /^(sri |shri |shree )?(temple|mandir|mandira|gudi|kovil|koil|devasthana|devasthanam|devalaya|devalayam|math|matha|mutt|shrine|mandap|mandapam|ashram|gompa|jinalaya|basadi|vihar|vihara|stupa)$/i;
/** Goa maps each subsidiary shrine of a temple complex as "Sri Krishna Prasanna". */
const SHRINE_IN_COMPLEX = /\bprasanna$/i;
/** Park zones mapped apart from the park: buffer zones are left out, core zones named as the park. */
const BUFFER_ZONE = /\bbuffer\b/i;

/** "Mhadei WLS Core Zone" -> "Mhadei Wildlife Sanctuary". */
export function wildlifeName(name: string): string {
  return name
    .replace(/\bWLS\b/g, "Wildlife Sanctuary")
    .replace(/\bW\.?L\.?S\.?(?=\s|$)/g, "Wildlife Sanctuary")
    .replace(/\bNP\b/g, "National Park")
    .replace(/\bTR\b/g, "Tiger Reserve")
    .replace(/\s*\b(core)\s+(zone|area)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Viewpoints and attractions named for a waterfall are waterfalls (Kalhatty Falls). */
const WATERFALL_WORDS = /\b(falls?|waterfalls?|jalapatha|jalapata|jharna|abbi)\b/i;
/** A village is a town row when it is well known: so it labels routes and is found by search. */
const VILLAGE_MIN_POPULATION = 5_000;
const VILLAGE_MIN_NAME_LANGUAGES = 2;

/** Lake outlines smaller than this across are ponds or wells. */
export const MIN_LAKE_EXTENT_M = 150;
/** Same name and category within this distance counts as one place. */
const DEDUPE_RADIUS_M: Partial<Record<CategorySlug, number>> = {
  town: 3_000,
  wildlife: 10_000,
  beach: 2_000,
  lake: 1_000,
};
const DEFAULT_DEDUPE_RADIUS_M = 300;

function clean(value: string | undefined): string | undefined {
  const v = value?.replace(/\s+/g, " ").trim();
  return v ? v : undefined;
}

/** English name first, then a Latin-script name, then whatever name the element has. */
function pickName(tags: Record<string, string>): string | undefined {
  const en = clean(tags["name:en"]);
  if (en) return en;
  const name = clean(tags.name);
  if (name && LATIN.test(name)) return name;
  return clean(tags.int_name) ?? name;
}

/** Names in this many languages (name:kn, name:ta...), a sign that a village is well known. */
function nameLanguages(tags: Record<string, string>): number {
  return Object.keys(tags).filter((k) => /^name:[a-z]{2,3}$/.test(k)).length;
}

/** A national park, wildlife sanctuary, tiger reserve or zoo, not a reserved forest. */
export function isWildlife(tags: Record<string, string>): boolean {
  if (tags.tourism === "zoo") return true;
  const text = `${tags.name ?? ""} ${tags["name:en"] ?? ""} ${tags.protection_title ?? ""}`;
  if (NOT_WILD_WORDS.test(text)) return false;
  if (tags.boundary === "national_park") return true;
  if (tags.boundary !== "protected_area" && tags.leisure !== "nature_reserve") return false;
  return WILD_WORDS.test(text) || WILD_PROTECT_CLASSES.has(tags.protect_class ?? "");
}

function categoryFor(tags: Record<string, string>): CategorySlug | null {
  const t = (k: string) => tags[k];
  if (t("place") === "city" || t("place") === "town") return "town";
  if (t("place") === "village") {
    const wellKnown =
      Boolean(t("wikidata")) ||
      (parsePopulation(t("population")) ?? 0) >= VILLAGE_MIN_POPULATION ||
      nameLanguages(tags) >= VILLAGE_MIN_NAME_LANGUAGES;
    return wellKnown ? "town" : null;
  }
  // A protected area that is not wildlife (a reserved forest) goes on to the other checks, so
  // one also tagged as an attraction is still kept.
  if (isWildlife(tags)) return "wildlife";
  if (t("waterway") === "waterfall" || t("natural") === "waterfall") return "waterfall";
  if (t("historic") === "fort" || t("historic") === "castle") return "fort";
  if (t("amenity") === "place_of_worship") {
    return TEMPLE_RELIGIONS.has(t("religion") ?? "") ? "temple" : "worship";
  }
  if (t("tourism") === "museum" || t("tourism") === "gallery") return "museum";
  const historic = t("historic") ?? "";
  if (
    [
      "monument",
      "ruins",
      "archaeological_site",
      "memorial",
      "tomb",
      "palace",
      "city_gate",
      "monastery",
    ].includes(historic)
  ) {
    return "heritage";
  }
  if (t("natural") === "beach") return "beach";
  if (t("natural") === "cave_entrance") return "cave";
  if (t("natural") === "peak") return "peak";
  if (t("water") === "lake" || t("water") === "reservoir" || t("landuse") === "reservoir") {
    return "lake";
  }
  if (t("tourism") === "viewpoint") return "viewpoint";
  if (t("tourism") === "camp_site") return "stay";
  if (
    t("tourism") === "attraction" ||
    t("tourism") === "theme_park" ||
    t("tourism") === "aquarium"
  ) {
    return "attraction";
  }
  if (t("waterway") === "dam") return "attraction";
  if (t("leisure") === "garden" && t("garden:type") === "botanical") return "attraction";
  if (t("amenity") === "fuel") return "fuel";
  return null;
}

function parsePopulation(value: string | undefined): number | null {
  const digits = value?.replace(/[\s,._]/g, "");
  if (!digits || !/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 && n < 50_000_000 ? n : null;
}

/**
 * Category for a historic=castle: castle_type when tagged, else the name ("Bekal Fort",
 * "Uchchangidurga", "Gawilghur" are forts; "Mysore Palace", "Shaniwar Wada" are heritage). Names
 * that say house, villa, hall and the like are private homes and venues: dropped unless notable.
 * Anything else is kept, as a fort when notable (the usual meaning in India), else as heritage.
 */
export function castleCategory(
  castleType: string | undefined,
  name: string,
  notable: boolean,
): "fort" | "heritage" | null {
  if (castleType && FORT_CASTLE_TYPES.has(castleType)) return "fort";
  if (castleType && PALACE_CASTLE_TYPES.has(castleType)) return "heritage";
  if (FORT_WORDS.test(name)) return "fort";
  if (PALACE_WORDS.test(name)) return "heritage";
  if (HOUSE_WORDS.test(name)) return notable ? "heritage" : null;
  return notable ? "fort" : "heritage";
}

/** "Aguada Fortress" + way/156595303 -> "aguada-fortress-w156595303" (stable and unique). */
export function osmSlug(name: string, osmId: string, category: string): string {
  const [type, id] = osmId.split("/") as [string, string];
  const base = slugify(name).slice(0, 60).replace(/-+$/, "") || category;
  return `${base}-${type[0]}${id}`;
}

/** Maps an OSM element to a place, or null if it should not be imported. */
export function classifyOsmElement(el: OsmElement): OsmPlaceCandidate | null {
  const { tags } = el;
  if (tags.access === "private" || tags.access === "no") return null;

  let category = categoryFor(tags);
  if (!category) return null;

  // Memorials are mostly road plaques and junction statues; keep the notable ones only.
  const notable = Boolean(tags.wikidata || tags.wikipedia || tags.tourism === "attraction");
  if (tags.historic === "memorial" && category === "heritage" && !notable) return null;
  if (category === "lake" && el.extentM > 0 && el.extentM < MIN_LAKE_EXTENT_M) return null;

  let name = pickName(tags);
  // Fuel stations often carry a generic local-script name ("गैस स्टेशन"); the brand says more.
  if (category === "fuel" && !(name && LATIN.test(name))) {
    name = clean(tags["brand:en"]) ?? clean(tags.brand) ?? clean(tags.operator) ?? "Fuel station";
  }
  // An unnamed viewpoint or peak is not useful in a list, nor is a name with no letters ("15 | 36").
  if (!name || !LETTER.test(name)) return null;
  // Temples come in by name now (not only with a Wikidata link): drop the ones named "Temple".
  if (
    category === "temple" &&
    !notable &&
    (GENERIC_TEMPLE_NAMES.test(name) || SHRINE_IN_COMPLEX.test(name))
  ) {
    return null;
  }
  if (category === "wildlife") {
    if (BUFFER_ZONE.test(name)) return null;
    name = wildlifeName(name);
  }
  if ((category === "viewpoint" || category === "attraction") && WATERFALL_WORDS.test(name)) {
    category = "waterfall";
  }

  if (tags.historic === "castle") {
    const kind = castleCategory(clean(tags.castle_type), name, notable || !!tags.heritage);
    if (!kind) return null;
    category = kind;
  }

  const altNames = [
    ...new Set(
      NAME_TAGS.flatMap((k) => (tags[k] ?? "").split(";"))
        .map((n) => clean(n))
        .filter((n): n is string => !!n && n !== name),
    ),
  ].slice(0, 10);

  const osmTags: Record<string, string> = {};
  for (const k of KEPT_TAGS) {
    const v = tags[k];
    if (v) osmTags[k] = k === "description" ? v.slice(0, 500) : v;
  }

  return {
    osmId: el.id,
    slug: osmSlug(name, el.id, category),
    name,
    altNames,
    category,
    location: el.location,
    population: category === "town" ? parsePopulation(tags.population) : null,
    wikidataId: clean(tags.wikidata) ?? null,
    osmTags,
    ...(category === "wildlife" && el.outline && el.extentM >= MIN_OUTLINE_EXTENT_M
      ? { outline: el.outline }
      : {}),
  };
}

/**
 * Drops OSM duplicates of the same place (e.g. a fort mapped as a node and as an outline, or a
 * long beach mapped in parts): same category and name within 300 m (towns 3 km, beaches 2 km,
 * lakes 1 km). Keeps the one with a Wikidata link, then the way/relation over the node.
 */
export function dedupeCandidates(candidates: OsmPlaceCandidate[]): OsmPlaceCandidate[] {
  const score = (c: OsmPlaceCandidate) =>
    (c.wikidataId ? 2 : 0) + (c.osmId.startsWith("node/") ? 0 : 1);
  const groups = new Map<string, OsmPlaceCandidate[]>();
  for (const c of candidates) {
    const key = `${c.category}|${c.name.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  const kept: OsmPlaceCandidate[] = [];
  for (const group of groups.values()) {
    const chosen: OsmPlaceCandidate[] = [];
    for (const c of [...group].sort((a, b) => score(b) - score(a))) {
      const radius = DEDUPE_RADIUS_M[c.category] ?? DEFAULT_DEDUPE_RADIUS_M;
      if (!chosen.some((k) => haversineM(k.location, c.location) <= radius)) chosen.push(c);
    }
    kept.push(...chosen);
  }
  return kept;
}
