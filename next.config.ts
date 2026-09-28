import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Serwist builds the service worker with webpack, so it is disabled in dev.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Two Next processes must not share a build dir. Playwright uses .next-e2e so it can run
  // beside your dev server; NEXT_DIST_DIR=.next-build pnpm build does the same for builds.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withSerwist(nextConfig);
