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

// Push notices for clubs and group rides (G11, src/server/services/pushService.ts): show the
// notice, and open our own page on a tap. Nothing is stored here.
self.addEventListener("push", (event) => {
  const data = (() => {
    try {
      return (event.data?.json() ?? {}) as { title?: string; body?: string; url?: string };
    } catch {
      return {};
    }
  })();
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Triplan", {
      body: data.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/me" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | undefined)?.url ?? "/me";
  // Only our own pages open from a notice.
  const url = new URL(raw, self.location.origin);
  const target = url.origin === self.location.origin ? url.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url === target) as WindowClient | undefined;
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});
