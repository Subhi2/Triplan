import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests that read local dates and times (the ride check's dawn and sunset, departure times) are
// written for India. Set before the workers start, so they get it however the machine is set:
// GitHub's runners are in UTC.
process.env.TZ = "Asia/Kolkata";

export default defineConfig({
  // tsconfig keeps JSX for Next.js; tests compile it with the automatic runtime (share cards).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
  },
});
