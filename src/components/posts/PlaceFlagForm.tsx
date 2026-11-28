"use client";

import { useRef, useState } from "react";
import {
  PLACE_FLAG_KINDS,
  PLACE_FLAG_LABELS,
  placeFlagInputSchema,
  REPORT_NOTE_MAX,
  type PlaceFlagKind,
} from "@/lib/riderPosts";
import { deviceKey, postError, PostsClosed, solveProofOfWork, type PowPayload } from "./postClient";
import { button, field } from "./ReviewForm";

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Something to fix in the form; the proof of work already solved is kept for the next try. */
class FormProblem extends Error {}

/**
 * "Something wrong here?" (G8): a rider tells us the place is closed, in the wrong spot, the
 * wrong kind of place or listed twice. Goes to an admin only, never shown on the site; the same
 * proof of work and limits as reviews keep it from being spammed.
 */
export function PlaceFlagForm({ slug, placeName }: { slug: string; placeName: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PlaceFlagKind>("closed");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pow = useRef<Promise<PowPayload> | null>(null);

  function start() {
    setOpen(true);
    setStatus({ kind: "idle" });
    pow.current ??= solveProofOfWork();
    pow.current.catch(() => {});
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const parsed = placeFlagInputSchema.safeParse({ kind, note });
      if (!parsed.success) {
        throw new FormProblem(parsed.error.issues[0]?.message ?? "Check what you wrote.");
      }
      const proof = await (pow.current ?? solveProofOfWork());
      pow.current = null;
      const res = await fetch(`/api/places/${slug}/flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag: parsed.data, pow: proof, deviceKey: deviceKey() }),
      });
      if (!res.ok) throw new Error(await postError(res));
      setOpen(false);
      setNote("");
      setStatus({ kind: "sent" });
    } catch (err) {
      if (!(err instanceof FormProblem)) pow.current = null;
      setStatus({
        kind: "error",
        message:
          err instanceof PostsClosed
            ? "This is not open yet."
            : err instanceof Error
              ? err.message
              : "Could not send it.",
      });
    }
  }

  if (status.kind === "sent") {
    return (
      <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
        Thanks. We will check {placeName} and fix it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!open && (
        <button
          type="button"
          onClick={start}
          className="text-brand-dark inline-flex min-h-11 items-center self-start text-sm font-bold hover:underline md:min-h-0 dark:text-teal-300"
        >
          Something wrong here?
        </button>
      )}
      {open && (
        <form
          onSubmit={send}
          noValidate
          aria-label="Something wrong here"
          className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-bold">What is wrong with {placeName}?</legend>
            {PLACE_FLAG_KINDS.map((k) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
                <input
                  type="radio"
                  name="flag-kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                {PLACE_FLAG_LABELS[k]}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-bold">
            {kind === "other" ? "What is wrong" : "Anything to add (optional)"}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={REPORT_NOTE_MAX}
              rows={2}
              placeholder="Where it really is, or what it really is"
              className={`${field} py-2 font-normal`}
            />
          </label>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Only we read this; it is not shown on the site.
          </p>
          {status.kind === "error" && (
            <p role="alert" className="text-sm font-bold text-red-700 dark:text-red-400">
              {status.message}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className={`${button} bg-brand text-white disabled:opacity-60`}
            >
              {status.kind === "sending" ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`${button} border border-stone-300 dark:border-stone-600`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
