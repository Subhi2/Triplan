"use client";

import { useState } from "react";
import { isSavedPlan, type SavedTrip, type TripPlan } from "@/lib/savedTrip";

interface Props {
  /** The saved trip open in the planner, if any. */
  saved: SavedTrip | null;
  /** The trip as the planner shows it now; null until a route is shown. */
  plan: TripPlan | null;
  defaultTitle: string;
  onSaved: (trip: SavedTrip) => void;
}

type Mode = "idle" | "naming" | "renaming";

async function send(url: string, method: "POST" | "PATCH", body: object): Promise<SavedTrip> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { trip?: SavedTrip; error?: string };
  if (!res.ok || !data.trip) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.trip;
}

const primary =
  "bg-brand hover:bg-brand-dark inline-flex min-h-11 shrink-0 items-center rounded-md px-3 font-medium whitespace-nowrap md:min-h-0 md:py-1 text-white disabled:cursor-not-allowed disabled:opacity-50";
const link =
  "text-brand inline-flex min-h-11 items-center font-medium hover:underline md:min-h-0 disabled:text-stone-400 disabled:no-underline";

/**
 * Save the trip, rename it, save changes to it or save it as a new trip, and copy its link.
 * Saved trips are open: no sign-in, and everyone sees them in the saved trips list.
 */
export function TripSaveBar({ saved, plan, defaultTitle, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const changed = saved !== null && plan !== null && !isSavedPlan(saved, plan);

  async function run(action: () => Promise<SavedTrip>, done: string) {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      onSaved(await action());
      setMode("idle");
      setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the trip");
    } finally {
      setBusy(false);
    }
  }

  function startNaming(next: Mode, initial: string) {
    setTitle(initial);
    setError(null);
    setNotice("");
    setMode(next);
  }

  function submitTitle(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    if (mode === "renaming" && saved) {
      void run(() => send(`/api/trips/${saved.id}`, "PATCH", { title: t }), "Renamed.");
    } else if (plan) {
      void run(
        () => send("/api/trips", "POST", { title: t, ...plan }),
        "Saved. Anyone with the link can open this trip.",
      );
    }
  }

  async function copyLink() {
    if (!saved) return;
    const url = `${window.location.origin}/trips/${saved.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch {
      setNotice(`Share this link: ${url}`);
    }
  }

  return (
    <section
      aria-label="Saved trip"
      className="space-y-2 rounded-lg border border-stone-200 p-3 text-sm dark:border-stone-700"
    >
      {mode !== "idle" ? (
        <form onSubmit={submitTitle} className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Trip name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            autoFocus
            className="min-h-11 min-w-40 flex-1 rounded-md border border-stone-300 bg-white px-2 text-base md:min-h-0 md:py-1 md:text-sm dark:border-stone-700 dark:bg-stone-900"
          />
          <button type="submit" disabled={busy || !title.trim()} className={primary}>
            {busy ? "Saving…" : mode === "renaming" ? "Rename" : "Save"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className={link}>
            Cancel
          </button>
          {mode === "naming" && (
            <p className="w-full text-xs text-stone-600 dark:text-stone-400">
              Saved trips are open to everyone: they are listed under Saved trips.
            </p>
          )}
        </form>
      ) : saved ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="min-w-0">
              <span className="text-stone-600 dark:text-stone-400">Saved trip: </span>
              <span className="font-semibold">{saved.title}</span>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => startNaming("renaming", saved.title)}
                className={link}
              >
                Rename
              </button>
              <button type="button" onClick={copyLink} className={link}>
                Copy link
              </button>
            </div>
          </div>
          {changed && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-amber-800 dark:text-amber-400">Changes not saved.</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => send(`/api/trips/${saved.id}`, "PATCH", { plan }),
                    "Changes saved.",
                  )
                }
                className={primary}
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={() => startNaming("naming", saved.title)}
                className={link}
              >
                Save as new trip
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-stone-600 dark:text-stone-400">
            Keep this trip to reopen or share.
          </span>
          <button
            type="button"
            disabled={!plan}
            onClick={() => startNaming("naming", defaultTitle)}
            className={primary}
          >
            Save trip
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {/* Always rendered: a live region added at the same time as its text is often not read. */}
      <p role="status" className="text-brand">
        {notice}
      </p>
    </section>
  );
}
