"use client";

import { useState } from "react";

/**
 * "Embed this ride" (G12, C8): the iframe code a club or blog pastes to show the ride's card,
 * with a copy button.
 */
export function EmbedSnippet({ src, title }: { src: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const code = `<iframe src="${src}" title="${title.replace(/"/g, "&quot;")}" width="360" height="460" style="border:0;border-radius:16px" loading="lazy"></iframe>`;
  return (
    <details className="group rounded-xl border border-stone-200 px-3 py-2 dark:border-stone-700">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold md:min-h-9">
        <span
          aria-hidden
          className="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
        >
          ›
        </span>
        Embed this ride on your site
      </summary>
      <div className="flex flex-col gap-2 pb-1">
        <textarea
          readOnly
          value={code}
          rows={3}
          aria-label="Embed code"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-stone-300 bg-(--surface) p-2 font-mono text-xs dark:border-stone-700"
        />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => setCopied(true));
          }}
          className="text-brand-dark inline-flex min-h-11 items-center self-start text-sm font-bold hover:underline md:min-h-8 dark:text-teal-300"
        >
          {copied ? "Copied" : "Copy the code"}
        </button>
      </div>
    </details>
  );
}
