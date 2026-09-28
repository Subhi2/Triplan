import { z } from "zod";

const serverEnvSchema = z.object({
  OSRM_BASE_URL: z.url().default("https://router.project-osrm.org"),
  NOMINATIM_BASE_URL: z.url().default("https://nominatim.openstreetmap.org"),
  // Nominatim's usage policy requires an identifying User-Agent.
  NOMINATIM_USER_AGENT: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parsed on first use so a missing variable fails the request that needs it, not the build. */
export function serverEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}
