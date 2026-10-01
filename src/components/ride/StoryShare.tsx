"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** The poster's address (/og/story?…). */
  storyUrl: string;
  /** "Bengaluru → Kalasa via Sakleshpur" */
  title: string;
  /** The trip's own link, shared with the image. */
  link: string;
}

type Poster =
  { status: "loading" } | { status: "ok"; file: File; objectUrl: string } | { status: "error" };

/** "story-bengaluru-kalasa.png" */
export function storyFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/→/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `story-${slug || "trip"}.png`;
}

/** Whether this browser can hand an image file to the phone's share sheet. */
function canShareFile(file: File): boolean {
  return typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
}

/**
 * "Share ride story": opens the trip's story poster, then shares it as an image (Instagram
 * stories, WhatsApp status) through the share sheet, or downloads it. Two taps on purpose: iOS
 * only opens the share sheet straight from a tap, not after the poster has loaded.
 */
export function StoryShare({ storyUrl, title, link }: Props) {
  const [open, setOpen] = useState(false);
  const [poster, setPoster] = useState<Poster>({ status: "loading" });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    setPoster({ status: "loading" });
    fetch(storyUrl, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        setPoster({
          status: "ok",
          file: new File([blob], storyFileName(title), { type: "image/png" }),
          objectUrl,
        });
      })
      .catch(() => !ctrl.signal.aborted && setPoster({ status: "error" }));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      ctrl.abort();
      window.removeEventListener("keydown", onKey);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, storyUrl, title]);

  async function share(file: File) {
    try {
      await navigator.share({
        files: [file],
        title,
        text: `${title}, planned on Triplan: ${link}`,
      });
    } catch {
      // Cancelled, or the target refused the file: nothing to do.
    }
  }

  function download(p: Extract<Poster, { status: "ok" }>) {
    const a = document.createElement("a");
    a.href = p.objectUrl;
    a.download = p.file.name;
    document.body.append(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-(--surface) px-4 text-sm font-bold active:scale-[0.97] md:min-h-11 dark:border-stone-600"
      >
        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor">
          <rect x="5" y="2" width="10" height="16" rx="2" strokeWidth="1.6" />
          <path d="M8 13l2-3 2 2 1-1" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
        Ride story
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ride story"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="flex max-h-full w-full max-w-sm flex-col gap-3 rounded-2xl bg-(--surface) p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Ride story</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full text-xl hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                ×
              </button>
            </div>
            <div className="flex min-h-0 justify-center">
              {poster.status === "loading" && (
                <div
                  aria-hidden
                  className="shimmer aspect-[9/16] h-[60vh] max-h-[560px] rounded-xl"
                />
              )}
              {poster.status === "error" && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                  The poster could not be made. Try again in a moment.
                </p>
              )}
              {poster.status === "ok" && (
                // eslint-disable-next-line @next/next/no-img-element -- a blob URL of our own poster
                <img
                  src={poster.objectUrl}
                  alt={`Ride story poster: ${title}`}
                  className="aspect-[9/16] h-[60vh] max-h-[560px] rounded-xl border border-stone-200 object-contain dark:border-stone-700"
                />
              )}
            </div>
            <div className="flex gap-2">
              {poster.status === "ok" && canShareFile(poster.file) && (
                <button
                  type="button"
                  onClick={() => void share(poster.file)}
                  className="bg-brand min-h-12 flex-1 rounded-xl px-4 font-bold text-white"
                >
                  Share
                </button>
              )}
              <button
                type="button"
                disabled={poster.status !== "ok"}
                onClick={() => poster.status === "ok" && download(poster)}
                className="min-h-12 flex-1 rounded-xl border border-stone-300 px-4 font-bold disabled:opacity-50 dark:border-stone-600"
              >
                Download
              </button>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              For Instagram stories and WhatsApp status. 1080 × 1920.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
