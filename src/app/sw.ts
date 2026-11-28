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

// "Share to Triplan" (G12, manifest share_target): another app shares a ride file or a link. The
// file is kept on this phone (IndexedDB, the offline store's "recent" table) for the planner to
// read; it never goes to our server as a file. Links and text go to the planner in its address.
const SHARE_DB = "triplan-offline";
const SHARE_STORE = "recent";
const SHARED_FILE_KEY = "shared-file";

function keepSharedFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SHARE_DB);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(SHARE_STORE)) {
        db.close();
        reject(new Error("no store"));
        return;
      }
      const tx = db.transaction(SHARE_STORE, "readwrite");
      tx.objectStore(SHARE_STORE).put(
        { name: file.name, type: file.type, blob: file },
        SHARED_FILE_KEY,
      );
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== self.location.origin) return;
  if (url.pathname !== "/share") return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        try {
          await keepSharedFile(file);
          return Response.redirect("/?shared=file", 303);
        } catch {
          return Response.redirect("/?shared=failed", 303);
        }
      }
      const q = new URLSearchParams({ shared: "link" });
      for (const k of ["title", "text", "url"]) {
        const v = form.get(k);
        if (typeof v === "string" && v.trim()) q.set(`s${k[0]}`, v.trim().slice(0, 1000));
      }
      return Response.redirect(`/?${q.toString()}`, 303);
    })(),
  );
});
