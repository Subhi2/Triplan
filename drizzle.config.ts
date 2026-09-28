import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // PostGIS owns its own tables (spatial_ref_sys etc.); keep drizzle-kit away from them.
  extensionsFilters: ["postgis"],
});
