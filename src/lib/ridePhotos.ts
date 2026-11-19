// Choosing a famous ride's gallery from the Commons photos found along its road (docs/02,
// "Famous rides"): landscape photos with a licence we may show, no maps, signs or portraits, spread
// along the road so the gallery tells the ride from start to end.

/** Photos kept per ride. */
export const GALLERY_MAX = 8;
/** Photos not named for anything to see are used only to reach this many. */
export const GALLERY_MIN = 4;
/** Wider than tall by at least this, so a photo fills a card without cutting off its subject. */
const MIN_RATIO = 1.25;
/** The 960 px version exists only for originals at least this wide. */
const MIN_WIDTH = 900;

/** Titles that are not a view of the road or its sights. */
const NOT_A_VIEW_WORDS = [
  "map",
  "maps",
  "logo",
  "sign",
  "signboard",
  "board",
  "plaque",
  "inscription",
  "flag",
  "poster",
  "chart",
  "diagram",
  "screenshot",
  "stamp",
  "coin",
  "emblem",
  "banner",
  "menu",
  "certificate",
  "portrait",
  "selfie",
  "crowd",
  "queue",
  "passport",
  "ticket",
  "timetable",
  "hospital",
  "school",
  "college",
  "office",
  "restaurant",
  "hotel",
  "room",
  "interior",
  "inside",
  "wedding",
  "festival",
  "procession",
  "rally",
  "protest",
  "election",
  "minister",
  "chief",
  "actor",
  "actress",
  "cricket",
  "football",
  "ceremony",
  "death",
  "funeral",
  "ritual",
  "puja",
  "dance",
  "dancers",
  "seller",
  "vendor",
  "shop",
  "market",
  "mall",
  "street",
  "people",
  "man",
  "woman",
  "girl",
  "boy",
  "child",
  "children",
  "worker",
  "workers",
  "awareness",
  "sticker",
  "nursery",
  "earth",
  "species",
  "insect",
  "butterfly",
  "moth",
  "beetle",
  "spider",
  "flower",
  "flowers",
  "bird",
  "leaf",
  "fruit",
  "food",
  "dish",
  "sculpture",
  "idol",
  "idols",
  "statue",
  // Towns and their buildings: a photo near the start city says little about the road.
  "bank",
  "stadium",
  "building",
  "buildings",
  "complex",
  "junction",
  "circle",
  "flyover",
  "apartment",
  "apartments",
  "university",
  "airport",
  "metro",
  "tower",
  "towers",
  "shopping",
  "traffic",
  "cinema",
  "theatre",
  "club",
  "extension",
  "stairs",
  "steps",
  "construction",
  "garbage",
  "kitchen",
  "charity",
  "museum",
  "church",
  "mosque",
  "bus",
  "car",
  "cars",
  "truck",
  "lorry",
  "auto",
  "rickshaw",
  "aerial",
];
/** Whole words only: "man" must not match "Manali". Built without backslashes on purpose. */
const NOT_A_VIEW = new RegExp(
  "(?<![a-z])(?:" + NOT_A_VIEW_WORDS.join("|") + "|iss[0-9]+)(?![a-z0-9])",
  "i",
);

/** Titles that name something worth seeing from the road. */
const SCENIC =
  /\b(waterfall|waterfalls|falls|view|views|valley|lake|pass|ghat|ghats|hill|hills|peak|fort|temple|beach|bridge|river|sunrise|sunset|highway|monastery|forest|mountain|mountains|lagoon|backwaters|plateau|palace|caves|cave|dam|coast|sea|island|desert|dunes|tea|plantation|snow|glacier|gompa|stupa|canyon|gorge|meadow|paddy|fields|landscape|panorama)\b/i;

/** Licences we may show with a credit; anything non-commercial or no-derivatives is out. */
export function licenceAllowed(license: string): boolean {
  const l = license.trim();
  if (/\b(NC|ND)\b/i.test(l)) return false;
  return /^(CC BY(-SA)? \d|CC0|Public domain|PD)/i.test(l);
}

/** What a gallery needs to know about a Commons photo (a CommonsImage fits). */
export interface PhotoImage {
  file: string;
  url: string;
  thumbUrl: string;
  pageUrl: string;
  author: string | null;
  license: string;
  width: number;
  height: number;
}

export interface PhotoCandidate {
  image: PhotoImage;
  /** Kilometres from the start of the ride to the nearest point of the road. */
  kmAlong: number;
  /** Metres from the road. */
  distM: number;
}

/** The title as words: "File:Jog_Falls_at_Shimoga_(2).jpg" -> "Jog Falls at Shimoga". */
export function captionOf(file: string): string {
  return file
    .replace(/^File:/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, " ")
    .replace(/\(\s*\d+\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The title with its numbers taken out, so near-duplicates ("... 1", "... 2") count as one. */
function stem(file: string): string {
  return captionOf(file)
    .toLowerCase()
    .replace(/[\d\W_]+/g, " ")
    .trim()
    .slice(0, 30);
}

/** Whether a candidate may be in a gallery at all. */
export function eligible(c: PhotoCandidate): boolean {
  const { image } = c;
  return (
    licenceAllowed(image.license) &&
    image.width >= MIN_WIDTH &&
    image.width / image.height >= MIN_RATIO &&
    !NOT_A_VIEW.test(captionOf(image.file)) &&
    // Vector and scan formats are filtered by the provider; "DSC_1234" alone says nothing.
    captionOf(image.file).replace(/[\d\s_-]/g, "").length >= 6
  );
}

/** Higher is better: close to the road and named for something to see. */
export function score(c: PhotoCandidate): number {
  const caption = captionOf(c.image.file);
  return (
    (SCENIC.test(caption) ? 2 : 0) -
    c.distM / 2_000 +
    // Titles that are only a camera's file number are a gamble.
    (/^(img|dsc|dscn|dscf|p\d|pxl|photo|image)[\s_-]*\d/i.test(caption) ? -1.5 : 0)
  );
}

/**
 * Up to `max` photos, in order along the road: the best photo of each equal stretch of the ride,
 * then the best of what is left, never two with the same title stem.
 */
export function pickGallery(
  candidates: PhotoCandidate[],
  rideKm: number,
  max = GALLERY_MAX,
): PhotoCandidate[] {
  // Not the towns at either end: their photos are of streets and buildings, not of the ride.
  const edge = Math.min(12, rideKm * 0.07);
  const ok = candidates
    .filter((c) => c.kmAlong >= edge && c.kmAlong <= rideKm - edge)
    .filter(eligible)
    .sort((a, b) => score(b) - score(a));
  // Photos named for something to see come first; the rest only fill a gallery that is too thin.
  const scenic = ok.filter((c) => SCENIC.test(captionOf(c.image.file)));
  const rest = ok.filter((c) => !SCENIC.test(captionOf(c.image.file)));
  const chosen: PhotoCandidate[] = [];
  const stems = new Set<string>();
  const take = (c: PhotoCandidate) => {
    const s = stem(c.image.file);
    if (stems.has(s) || chosen.some((x) => x.image.file === c.image.file)) return false;
    stems.add(s);
    chosen.push(c);
    return true;
  };
  const stretch = rideKm / max;
  for (let i = 0; i < max && stretch > 0; i++) {
    const best = scenic.find(
      (c) => c.kmAlong >= i * stretch && c.kmAlong < (i + 1) * stretch + 1e-9,
    );
    if (best) take(best);
  }
  for (const c of scenic) {
    if (chosen.length >= max) break;
    take(c);
  }
  for (const c of rest) {
    if (chosen.length >= GALLERY_MIN) break;
    take(c);
  }
  return chosen.sort((a, b) => a.kmAlong - b.kmAlong);
}
