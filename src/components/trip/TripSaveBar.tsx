"use client";

import { useEffect, useState } from "react";
import { isSavedPlan, type CreatedTrip, type SavedTrip, type TripPlan } from "@/lib/savedTrip";
import { tripHeadline, whatsAppUrl } from "@/lib/site";
import { rememberTrip, tripToken } from "@/lib/tripTokens";

interface Props {
  /** The saved trip open in the planner, if any. */
  saved: SavedTrip | null;
  /** The trip as the planner shows it now; null until a route is shown. */
  plan: TripPlan | null;
  defaultTitle: string;
  onSaved: (trip: SavedTrip) => void;
}

type Mode = "idle" | "naming" | "renaming";

class NotYoursError extends Error {}

async function send(
  url: string,
  method: "POST" | "PATCH",
  body: object,
  token?: string | null,
): Promise<Partial<CreatedTrip> & { trip: SavedTrip }> {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<CreatedTrip> & { error?: string };
  const message = data.error ?? `HTTP ${res.status}`;
  if (res.status === 401 || res.status === 403) throw new NotYoursError(message);
  if (!res.ok || !data.trip) throw new Error(message);
  return { ...data, trip: data.trip };
}

const primary =
  "bg-brand hover:bg-brand-dark inline-flex min-h-11 shrink-0 items-center rounded-md px-3 font-medium whitespace-nowrap md:min-h-0 md:py-1 text-white disabled:cursor-not-allowed disabled:opacity-50";
const link =
  "text-brand inline-flex min-h-11 items-center font-medium hover:underline md:min-h-0 disabled:text-stone-400 disabled:no-underline";

/**
 * Save the trip, rename it, save changes to it or save it as a new trip, and share its link:
 * the phone's share sheet on phones, WhatsApp and "Copy link" elsewhere. An unsaved trip shares
 * the planner link, which holds the whole trip in its query string.
 * No sign-in: the device that saved a trip keeps its edit token and may change it; anyone else
 * with the link can open it and save a copy. Every trip opened here joins this device's list.
 */
export function TripSaveBar({ saved, plan, defaultTitle, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const changed = saved !== null && plan !== null && !isSavedPlan(saved, plan);

  // Whether this device saved the trip (holds its edit token). Read after mounting: the server
  // does not know the browser's storage.
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    if (!saved) return;
    rememberTrip(saved.id);
    setCanEdit(tripToken(saved.id) !== null);
  }, [saved]);

  // The share sheet on touch screens; desktop share sheets rarely include WhatsApp. Null until
  // mounted: the links need window.location, which the server does not have.
  const [shareWith, setShareWith] = useState<"sheet" | "links" | null>(null);
  useEffect(() => {
    setShareWith(
      typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches
        ? "sheet"
        : "links",
    );
  }, []);

  const shareText = () =>
    `${tripHeadline((plan?.stops ?? saved?.stops ?? []).map((s) => s.label))} · places along the route`;
  const shareUrl = () =>
    saved && !changed ? `${window.location.origin}/trips/${saved.id}` : window.location.href;

  async function run(action: () => ReturnType<typeof send>, done: string) {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const { trip, editToken } = await action();
      if (editToken) {
        rememberTrip(trip.id, editToken);
        setCanEdit(true);
      }
      onSaved(trip);
      setMode("idle");
      setNotice(done);
    } catch (err) {
      if (err instanceof NotYoursError) setCanEdit(false);
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
      void run(
        () => send(`/api/trips/${saved.id}`, "PATCH", { title: t }, tripToken(saved.id)),
        "Renamed.",
      );
    } else if (plan) {
      void run(
        () => send("/api/trips", "POST", { title: t, ...plan }),
        "Saved. Anyone with the link can open this trip; only this device can change it.",
      );
    }
  }

  async function copyLink() {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied.");
    } catch {
      setNotice(`Share this link: ${url}`);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: saved?.title ?? defaultTitle,
        text: shareText(),
        url: shareUrl(),
      });
    } catch (err) {
      // AbortError: the rider closed the share sheet.
      if (!(err instanceof DOMException && err.name === "AbortError")) await copyLink();
    }
  }

  const shareButtons = !shareWith ? null : shareWith === "sheet" ? (
    <button type="button" onClick={share} className={link}>
      Share
    </button>
  ) : (
    <>
      <a
        href={whatsAppUrl(shareText(), shareUrl())}
        target="_blank"
        rel="noopener noreferrer"
        className={link}
      >
        WhatsApp
      </a>
      <button type="button" onClick={copyLink} className={link}>
        Copy link
      </button>
    </>
  );

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
              Anyone with the link can open it. Only this device can rename or change it.
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
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => startNaming("renaming", saved.title)}
                  className={link}
                >
                  Rename
                </button>
              ) : (
                !changed && (
                  <button
                    type="button"
                    onClick={() => startNaming("naming", saved.title)}
                    className={link}
                  >
                    Save a copy
                  </button>
                )
              )}
              {shareButtons}
            </div>
          </div>
          {changed && !canEdit && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-amber-800 dark:text-amber-400">
                Changed. This trip was saved on another device.
              </span>
              <button
                type="button"
                onClick={() => startNaming("naming", saved.title)}
                className={primary}
              >
                Save as my trip
              </button>
            </div>
          )}
          {changed && canEdit && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-amber-800 dark:text-amber-400">Changes not saved.</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => send(`/api/trips/${saved.id}`, "PATCH", { plan }, tripToken(saved.id)),
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
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-stone-600 dark:text-stone-400">
            Keep this trip to reopen or share.
          </span>
          <div className="flex items-center gap-3">
            {plan && shareButtons}
            <button
              type="button"
              disabled={!plan}
              onClick={() => startNaming("naming", defaultTitle)}
              className={primary}
            >
              Save trip
            </button>
          </div>
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
