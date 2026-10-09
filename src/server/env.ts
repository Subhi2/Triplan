import { z } from "zod";

const optionalKey = z
  .string()
  .trim()
  .optional()
  .transform((s) => s || undefined);

const serverEnvSchema = z.object({
  OSRM_BASE_URL: z.url().default("https://router.project-osrm.org"),
  NOMINATIM_BASE_URL: z.url().default("https://nominatim.openstreetmap.org"),
  // Nominatim's usage policy requires an identifying User-Agent. Also sent to Photon and Overpass.
  NOMINATIM_USER_AGENT: z.string().min(1),
  PHOTON_BASE_URL: z.url().default("https://photon.komoot.io/api"),
  // Comma-separated Overpass endpoints, tried in order when one is down or unreachable.
  OVERPASS_URLS: z
    .string()
    .default(
      "https://overpass-api.de/api/interpreter," +
        // overpass-api.de's second machine, with its own slots per address.
        "https://z.overpass-api.de/api/interpreter," +
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter," +
        "https://overpass.kumi.systems/api/interpreter",
    )
    .transform((s) =>
      s
        .split(",")
        .map((u) => u.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  // Google fills gaps only (docs/02, "Google Maps Platform"). One key serves the map and the
  // Places API (New) calls; GOOGLE_MAPS_API_KEY is only needed for a separate server key.
  // Without either, no Google call is made.
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optionalKey,
  GOOGLE_MAPS_API_KEY: optionalKey,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parsed on first use so a missing variable fails the request that needs it, not the build. */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
