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
};

export default withSerwist(nextConfig);
