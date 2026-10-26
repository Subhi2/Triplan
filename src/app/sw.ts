import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, NetworkOnly, Serwist } from "serwist";
import { isNeverCached } from "../lib/swCache";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // The first matching rule wins: our API and Google are never stored (src/lib/swCache.ts).
  // A page that cannot load offline (and is not cached) shows /~offline instead of an error.
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => isNeverCached(url, sameOrigin),
      handler: new NetworkOnly(),
    },
    // The planner, whatever trip its address holds: with no signal, the last planner page seen
    // opens a trip saved for offline (?pack=…). The page reads the trip from the address itself.
    {
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && request.mode === "navigate" && url.pathname === "/",
      handler: new NetworkFirst({
        cacheName: "planner-page",
        networkTimeoutSeconds: 5,
        matchOptions: { ignoreSearch: true },
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
