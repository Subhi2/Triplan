import { randomUUID } from "node:crypto";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Serwist builds the service worker with webpack, so it is disabled in dev.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // The offline page (src/app/~offline), precached so it shows with no connection at all.
  additionalPrecacheEntries: [
    { url: "/~offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID() },
  ],
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
    return [
      // Everything but the embeds: no framing by other sites.
      { source: "/((?!embed/).*)", headers: SECURITY_HEADERS },
      // Embeds (G12): any site may frame them; the rest of the safe defaults stay.
      {
        source: "/embed/:path*",
        headers: [
          ...SECURITY_HEADERS.filter(
            (h) => h.key !== "X-Frame-Options" && h.key !== "Content-Security-Policy",
          ),
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
        ],
      },
    ];
  },
  // Two Next processes must not share a build dir. Playwright uses .next-e2e so it can run
  // beside your dev server; NEXT_DIST_DIR=.next-build pnpm build does the same for builds.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // /rides and the sitemap prerender from the database; a build during a data import once took
  // more than the default 60 s for /rides and failed the deploy (2026-11-28).
  staticPageGenerationTimeout: 180,
};

export default withSerwist(nextConfig);
