import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests hit the real database in DATABASE_URL (seeded with `pnpm db:seed`).
config({ path: ".env.local", quiet: true });

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
