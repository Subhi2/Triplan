"use client";

import { useEffect, useState } from "react";

export type WakeLockStatus = "off" | "held" | "unavailable";

/**
 * Keeps the screen on while `active` (Screen Wake Lock API), so ride mode stays glanceable. The
 * browser drops the lock when the page is hidden; it is asked for again when the page is back.
 * Where the API is missing or refused, the rider is told to keep the screen on themselves.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>("off");

  useEffect(() => {
    if (!active) {
      setStatus("off");
      return;
    }
    if (!("wakeLock" in navigator)) {
      setStatus("unavailable");
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) {
          void next.release();
          return;
        }
        lock = next;
        setStatus("held");
      } catch {
        setStatus("unavailable");
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);

  return status;
}
