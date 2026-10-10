"use client";

import { trackEvent } from "@/lib/track";

/** Opens the 3D ride preview: a soft button with a play icon. */
export function PreviewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        trackEvent("preview_3d");
        onClick();
      }}
      className="lift bg-brand-tint text-brand-dark inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold active:scale-[0.97] md:min-h-11 dark:bg-teal-950 dark:text-teal-200"
    >
      <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor">
        <path d="M3 15l4-6 3 4 2-3 5 5z" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="14" cy="5" r="2" strokeWidth="1.6" />
      </svg>
      Preview the ride in 3D
    </button>
  );
}
