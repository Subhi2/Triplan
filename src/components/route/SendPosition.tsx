"use client";

import { useState } from "react";
import { positionLinks, positionMessage, type PositionContext } from "@/lib/safety";

type State =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "error"; message: string }
  | { status: "ready"; whatsapp: string; sms: string };

/**
 * "Send my position" (G10, C5): one tap takes an exact fix and gets a message ready for WhatsApp
 * or an SMS, with an OpenStreetMap link, the nearest town and km of the trip. The position stays
 * on the phone: it goes only to whoever the rider sends it to, never to our server.
 */
export function SendPosition({ context }: { context?: PositionContext }) {
  const [state, setState] = useState<State>({ status: "idle" });

  function locate() {
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setState({ status: "error", message: "This browser can't share your position here." });
      return;
    }
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const message = positionMessage(
          [pos.coords.longitude, pos.coords.latitude],
          pos.coords.accuracy,
          new Date(),
          context,
        );
        setState({ status: "ready", ...positionLinks(message) });
      },
      (err) =>
        setState({
          status: "error",
          message:
            err.code === 1
              ? "Location is off for this site: turn it on, or call 112."
              : "Couldn't find your position. Try again, or call 112.",
        }),
      // Exact this time: it is for someone coming to help.
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  }

  const chip =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-bold md:min-h-9";
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
      {state.status === "ready" ? (
        <>
          <a
            href={state.whatsapp}
            target="_blank"
            rel="noopener"
            className={`${chip} border-brand text-brand-dark dark:text-teal-300`}
          >
            Send on WhatsApp
          </a>
          <a href={state.sms} className={`${chip} border-stone-300 dark:border-stone-600`}>
            Send by SMS
          </a>
        </>
      ) : (
        <button
          type="button"
          onClick={locate}
          disabled={state.status === "locating"}
          className={`${chip} border-stone-300 hover:bg-stone-100 disabled:opacity-70 dark:border-stone-600 dark:hover:bg-stone-800`}
        >
          {state.status === "locating" ? "Finding you…" : "Send my position"}
        </button>
      )}
      {state.status === "error" && (
        <p role="status" className="text-ghat-dark w-full text-sm dark:text-orange-300">
          {state.message}
        </p>
      )}
    </div>
  );
}
