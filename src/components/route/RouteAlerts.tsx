"use client";

import { useState } from "react";
import { alertLine, alertTone, type RouteAlert } from "@/lib/alerts";

const TONE = {
  bad: "border-ghat bg-marigold-tint text-stone-900 dark:bg-orange-950 dark:text-orange-50",
  warn: "border-marigold bg-marigold-tint text-stone-900 dark:bg-amber-950 dark:text-amber-50",
  muted: "border-stone-300 bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
} as const;

function WarningIcon() {
  return (
    <svg
      aria-hidden
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ghat-dark mt-0.5 shrink-0 dark:text-orange-300"
    >
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  );
}

/**
 * Official alerts in force during the ride, under the route cards: the worst one in a line, the
 * rest behind "+N more" (docs/02, "Alerts on the route"). Nothing at all when there are none.
 */
export function RouteAlerts({ alerts }: { alerts: RouteAlert[] }) {
  const [open, setOpen] = useState(false);
  const worst = alerts[0];
  if (!worst) return null;
  const more = alerts.length - 1;
  return (
    <section
      aria-label="Official alerts on the route"
      className={`rounded-xl border-l-4 px-3 py-2 text-sm ${TONE[alertTone(worst.severity)]}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-start gap-2 text-left md:min-h-0"
      >
        <WarningIcon />
        <span className="min-w-0 flex-1">
          <span className="font-bold">{worst.severity} alert</span> · {alertLine(worst)}
        </span>
        <span className="text-brand-dark shrink-0 text-xs font-bold dark:text-teal-300">
          {more > 0 ? `+${more} more` : open ? "Less" : "More"}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-2 border-t border-stone-300/60 pt-2 dark:border-stone-600">
          {alerts.map((a) => (
            <li key={a.id}>
              <p className="font-medium">{a.headline}</p>
              <p className="text-xs text-stone-700 dark:text-stone-300">
                {a.severity} · {alertLine(a)}
                {a.area && ` · ${a.area}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
        Official alerts in force while you ride, from{" "}
        <a
          href="https://sachet.ndma.gov.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          NDMA&apos;s SACHET
        </a>
        .
      </p>
    </section>
  );
}
