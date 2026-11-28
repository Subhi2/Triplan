"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocate } from "@/components/geo/useLocate";
import { DynamicMapLibreView } from "@/components/map/DynamicMapView";
import { INDIA_BOUNDS } from "@/components/map/types";
import { CATEGORIES, PLACE_LIST_CATEGORIES, type CategorySlug } from "@/lib/categories";
import { NEW_PLACE_NOTE_MAX, newPlaceSchema, type SimilarPlace } from "@/lib/contribute";
import type { LngLat } from "@/lib/geo";
import { MONTH_SHORT } from "@/lib/months";
import { deviceKey, postError, PostsClosed, solveProofOfWork, type PowPayload } from "./postClient";
import { button, field } from "./ReviewForm";

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

class FormProblem extends Error {}

const noop = () => {};

/**
 * "Add a place" (G11, A9): a pin on the map, a name and a kind, and if the rider likes the best
 * months, a note and a YouTube or Instagram link (kept as a plain link). It waits for an admin;
 * places we may have already are shown first.
 */
export function ContributeForm({ open }: { open: boolean }) {
  const [pin, setPin] = useState<LngLat | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategorySlug>("viewpoint");
  const [months, setMonths] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [similar, setSimilar] = useState<SimilarPlace[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pow = useRef<Promise<PowPayload> | null>(null);
  const { state: locateState, locate } = useLocate();

  // Places we may have already, once there is a pin and a name.
  useEffect(() => {
    if (!pin || name.trim().length < 2) {
      setSimilar([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const q = new URLSearchParams({
        name: name.trim(),
        lng: String(pin[0]),
        lat: String(pin[1]),
      });
      fetch(`/api/places/contribute?${q}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ similar?: SimilarPlace[] }>)
        .then((b) => setSimilar(b.similar ?? []))
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [pin, name]);

  function warm() {
    pow.current ??= solveProofOfWork();
    pow.current.catch(() => {});
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      if (!pin) throw new FormProblem("Tap the map where the place is.");
      const parsed = newPlaceSchema.safeParse({
        name,
        category,
        location: pin,
        bestMonths: months,
        note,
        link,
      });
      if (!parsed.success) {
        throw new FormProblem(parsed.error.issues[0]?.message ?? "Check what you wrote.");
      }
      const proof = await (pow.current ?? solveProofOfWork());
      pow.current = null;
      const res = await fetch("/api/places/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place: parsed.data, pow: proof, deviceKey: deviceKey() }),
      });
      if (!res.ok) throw new Error(await postError(res));
      setStatus({ kind: "sent" });
    } catch (err) {
      if (!(err instanceof FormProblem)) pow.current = null;
      setStatus({
        kind: "error",
        message:
          err instanceof PostsClosed
            ? "Adding places is not open yet."
            : err instanceof Error
              ? err.message
              : "Could not send it.",
      });
    }
  }

  if (!open) {
    return <p className="text-stone-600 dark:text-stone-400">Adding places is not open yet.</p>;
  }
  if (status.kind === "sent") {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="font-bold">Thanks. {name} shows on routes once we have checked it.</p>
        <Link href="/" className="text-brand-dark font-bold underline dark:text-teal-300">
          Back to planning
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={send}
      onFocus={warm}
      noValidate
      aria-label="Add a place"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold">Where is it? Tap the map.</p>
        <div className="h-72 overflow-hidden rounded-2xl border border-stone-200 md:h-96 dark:border-stone-700">
          <DynamicMapLibreView
            routes={[]}
            selectedRouteId={null}
            onSelectRoute={noop}
            stops={
              pin ? [{ id: "pin", label: name || "New place", location: pin, role: "end" }] : []
            }
            places={[]}
            activePlaceId={null}
            hoverPlaceId={null}
            onSelectPlace={noop}
            onHoverPlace={noop}
            frame={{
              key: pin ? "pin" : "india",
              points: pin ? [pin] : [INDIA_BOUNDS[0], INDIA_BOUNDS[1]],
            }}
            onMapClick={(at) => setPin([Number(at[0].toFixed(6)), Number(at[1].toFixed(6))])}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={async () => {
              const at = await locate();
              if (at) setPin(at);
            }}
            disabled={locateState.status === "locating"}
            className={`${button} border border-stone-300 dark:border-stone-600`}
          >
            {locateState.status === "locating" ? "Finding you…" : "I am there now"}
          </button>
          {pin && (
            <span className="tabular font-mono text-xs">
              {pin[1].toFixed(5)}, {pin[0].toFixed(5)}
            </span>
          )}
        </div>
        {locateState.status === "error" && (
          <p role="status" className="text-ghat-dark text-sm dark:text-orange-300">
            {locateState.message}
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder="What people there call it"
          className={`${field} font-normal`}
        />
      </label>

      {similar.length > 0 && (
        <div
          role="status"
          className="bg-marigold-tint flex flex-col gap-1 rounded-xl px-3 py-2 text-sm dark:bg-amber-950"
        >
          <p className="font-bold">Is it one of these? We may have it already.</p>
          <ul className="flex flex-col">
            {similar.map((s) => (
              <li key={s.slug}>
                <Link href={`/place/${s.slug}`} className="underline" target="_blank">
                  {s.name}
                </Link>{" "}
                · {CATEGORIES[s.category as CategorySlug]?.name ?? s.category} · {s.distanceM} m
                away
              </li>
            ))}
          </ul>
          <p className="text-xs">If it is a different place, send it anyway.</p>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-bold">
        What kind of place
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategorySlug)}
          className={`${field} font-normal`}
        >
          {PLACE_LIST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORIES[c].name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-bold">Best months (optional)</legend>
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
          {MONTH_SHORT.map((m, i) => (
            <label key={m} className="flex min-h-11 items-center gap-1 text-sm md:min-h-8">
              <input
                type="checkbox"
                checked={months.includes(i + 1)}
                onChange={(e) =>
                  setMonths((prev) =>
                    e.target.checked ? [...prev, i + 1] : prev.filter((x) => x !== i + 1),
                  )
                }
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-bold">
        What riders should know (optional)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NEW_PLACE_NOTE_MAX}
          rows={3}
          placeholder="How to reach it, the last stretch of road, timings"
          className={`${field} py-2 font-normal`}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        A YouTube or Instagram link (optional)
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="A video or post that shows it"
          className={`${field} font-normal`}
        />
      </label>

      <p className="text-xs text-stone-600 dark:text-stone-400">
        We check every new place before it shows on routes. Add photos on its page once it is up.
      </p>
      {status.kind === "error" && (
        <p role="alert" className="text-sm font-bold text-red-700 dark:text-red-400">
          {status.message}
        </p>
      )}
      <button
        type="submit"
        disabled={status.kind === "sending"}
        className={`${button} bg-brand self-start text-white disabled:opacity-60`}
      >
        {status.kind === "sending" ? "Sending…" : "Send the place"}
      </button>
    </form>
  );
}
