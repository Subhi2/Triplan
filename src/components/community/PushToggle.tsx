"use client";

import { useEffect, useState } from "react";
import { communityFetch } from "./riderSession";
import { card, muted, secondaryButton } from "./ui";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

/** The VAPID public key as the bytes PushManager.subscribe wants. */
function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "unsupported" | "off" | "on" | "busy" | "blocked";

/**
 * "Notices on this device" (G11, C9): join requests, the host's decisions, and rides called off
 * or moved, as push notices. Hidden when notices are off (no VAPID key) or the browser has no
 * push (iPhones: only once the site is added to the home screen).
 */
export function PushToggle() {
  const [state, setState] = useState<State>("unsupported");
  const [iphone, setIphone] = useState(false);

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    setIphone(/iPhone|iPad/.test(navigator.userAgent));
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return setState("blocked");
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  if (!PUBLIC_KEY) return null;

  async function turnOn() {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(PUBLIC_KEY) as BufferSource,
      });
      await communityFetch("/api/me/push", { method: "POST", body: sub.toJSON() });
      setState("on");
    } catch {
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await communityFetch("/api/me/push", {
          method: "DELETE",
          body: { endpoint: sub.endpoint },
        });
        await sub.unsubscribe();
      }
    } finally {
      setState("off");
    }
  }

  return (
    <section aria-labelledby="notices" className={`${card} flex flex-col gap-2`}>
      <h2 id="notices" className="font-display text-xl font-bold">
        Notices on this device
      </h2>
      <p className={muted}>
        When someone asks to join your ride or club, when a host lets you in, and when a ride is
        called off or moved. Only the ride or club name: never a meeting point.
      </p>
      {state === "unsupported" ? (
        <p className={muted}>
          {iphone
            ? "On an iPhone, add this site to your home screen first, then open it from there."
            : "This browser cannot show notices."}
        </p>
      ) : state === "blocked" ? (
        <p className={muted}>Notices are blocked for this site in the browser&apos;s settings.</p>
      ) : (
        <button
          type="button"
          disabled={state === "busy"}
          onClick={() => void (state === "on" ? turnOff() : turnOn())}
          className={`${secondaryButton} self-start`}
        >
          {state === "on" ? "Turn notices off" : "Turn notices on"}
        </button>
      )}
    </section>
  );
}
