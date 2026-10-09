import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Serwist builds the service worker with webpack, so it is disabled in dev.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// Safe defaults for every response. No full Content-Security-Policy yet: the Google map needs a
// wide one, so only framing is restricted (no clickjacking of the planner).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  // Location is asked for on a tap only (Near me, Use my location); nothing uses the camera or mic.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Two Next processes must not share a build dir. Playwright uses .next-e2e so it can run
  // beside your dev server; NEXT_DIST_DIR=.next-build pnpm build does the same for builds.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default withSerwist(nextConfig);
