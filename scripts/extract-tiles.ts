/**
 * Our own map file of India for offline packs (docs/02, "Offline trip pack"; CLAUDE.md, "Choosing
 * new features"): one PMTiles file at zoom 0–13, cut out of a Protomaps daily build of
 * OpenStreetMap (ODbL), plus the label fonts the offline style uses. Upload the folder it writes
 * and set NEXT_PUBLIC_OFFLINE_TILES_URL to the file's address.
 *
 *   pnpm tiles:extract                         # the newest build, into data/tiles/
 *   pnpm tiles:extract -- --build=20261022     # a given day's build
 *   pnpm tiles:extract -- --fonts-only         # just the fonts
 *
 * Needs the `pmtiles` command (go-pmtiles, BSD-3): https://github.com/protomaps/go-pmtiles/releases
 * It reads only the parts of the planet build it needs, over HTTP range requests. If Protomaps'
 * builds ever stop, Planetiler (Apache-2.0) makes the same file from an OpenStreetMap extract.
 */
import { spawnSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { PACK_FONTSTACKS, PACK_GLYPH_RANGES, PACK_MAX_ZOOM } from "../src/lib/offlinePack";

/** India and its islands, with a margin: [west, south, east, north]. */
const INDIA_BBOX = [68.0, 6.5, 97.5, 35.8] as const;
const BUILDS = "https://build.protomaps.com";
const FONTS = "https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"), // pnpm passes the "--" through
  options: {
    build: { type: "string" },
    out: { type: "string", default: "data/tiles" },
    "fonts-only": { type: "boolean", default: false },
  },
});

const day = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

/** The newest daily build that exists (they are kept for a few days). */
async function newestBuild(): Promise<string> {
  for (let back = 0; back < 10; back++) {
    const name = day(new Date(Date.now() - back * 86_400_000));
    const res = await fetch(`${BUILDS}/${name}.pmtiles`, { method: "HEAD" });
    if (res.ok) return name;
  }
  throw new Error(`No Protomaps build in the last 10 days at ${BUILDS}; pass --build=YYYYMMDD.`);
}

async function fonts(out: string): Promise<number> {
  let n = 0;
  for (const stack of PACK_FONTSTACKS) {
    const dir = path.join(out, "fonts", stack);
    await mkdir(dir, { recursive: true });
    for (const range of PACK_GLYPH_RANGES) {
      const res = await fetch(`${FONTS}/${encodeURIComponent(stack)}/${range}.pbf`);
      if (!res.ok) throw new Error(`${stack} ${range}: HTTP ${res.status}`);
      await writeFile(path.join(dir, `${range}.pbf`), Buffer.from(await res.arrayBuffer()));
      n += 1;
    }
  }
  return n;
}

async function main() {
  const out = path.resolve(values.out!);
  await mkdir(out, { recursive: true });
  console.log(
    `Fonts: ${await fonts(out)} files (Noto Sans, SIL Open Font License) in ${out}/fonts`,
  );
  if (values["fonts-only"]) return;

  const version = spawnSync("pmtiles", ["version"], { encoding: "utf8", shell: true });
  if (version.status !== 0) {
    throw new Error(
      "The pmtiles command was not found. Get it from " +
        "https://github.com/protomaps/go-pmtiles/releases and put it on your PATH.",
    );
  }
  const build = values.build ?? (await newestBuild());
  const file = path.join(out, "india.pmtiles");
  console.log(`Cutting India out of ${BUILDS}/${build}.pmtiles (zoom 0–${PACK_MAX_ZOOM})…`);
  const run = spawnSync(
    "pmtiles",
    [
      "extract",
      `${BUILDS}/${build}.pmtiles`,
      file,
      `--bbox=${INDIA_BBOX.join(",")}`,
      `--maxzoom=${PACK_MAX_ZOOM}`,
    ],
    { stdio: "inherit", shell: true },
  );
  if (run.status !== 0) throw new Error(`pmtiles extract failed (exit ${run.status}).`);
  const size = (await stat(file)).size;
  console.log(`\nWrote ${file} (${(size / 1024 ** 3).toFixed(2)} GB) from build ${build}.`);
  console.log(
    [
      "",
      "Next:",
      `1. Upload india.pmtiles and the fonts/ folder side by side to storage that serves HTTP range`,
      "   requests (Cloudflare R2 or Supabase Storage), allowing GET and HEAD with a Range header",
      "   from the site's address (CORS).",
      "2. Set NEXT_PUBLIC_OFFLINE_TILES_URL to the file's address, for example",
      "   https://tiles.example.com/india.pmtiles, in Vercel and .env.local.",
      "Refresh it a few times a year.",
    ].join("\n"),
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
