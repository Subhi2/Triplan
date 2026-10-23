"use client";

import { useEffect, useRef, useState } from "react";
import { MONTH_SHORT } from "@/lib/months";
import { VEHICLE_LABELS } from "@/lib/placeDetail";
import { REVIEW_BODY_MAX, REVIEW_VEHICLES, reviewInputSchema } from "@/lib/riderPosts";
import {
  deviceKey,
  hasReviewed,
  markReviewed,
  postError,
  PostsClosed,
  saveNickname,
  savedNickname,
  solveProofOfWork,
  type PowPayload,
} from "./postClient";

export const button =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold md:min-h-9";
export const field =
  "min-h-11 rounded-md border border-stone-300 bg-white px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700 dark:bg-stone-900";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "deleted" }
  | { kind: "error"; message: string };

/**
 * "Write a review" on a place, without sign-in (docs/02, "Reviews, photos and road reports"). The
 * proof of work starts when the form opens; the review shows once an admin approves it. The device
 * that wrote it can delete it.
 */
export function ReviewForm({ slug, placeName }: { slug: string; placeName: string }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pow = useRef<Promise<PowPayload> | null>(null);

  useEffect(() => setMine(hasReviewed(slug)), [slug]);

  function start() {
    setOpen(true);
    setNickname((n) => n || savedNickname());
    pow.current ??= solveProofOfWork();
    // A failure shows when the rider presses Send, not before.
    pow.current.catch(() => {});
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const parsed = reviewInputSchema.safeParse({
      rating,
      body,
      nickname,
      visitedMonth: month ? Number(month) : null,
      visitedYear: year ? Number(year) : null,
      vehicleUsed: vehicle || null,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path[0];
      setStatus({
        kind: "error",
        message:
          path === "rating"
            ? "Pick 1 to 5 stars."
            : path === "nickname"
              ? "Add a name to show with your review."
              : path === "visitedMonth"
                ? "Pick the month too, or leave the year empty."
                : (issue?.message ?? "Check the review."),
      });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const proof = await (pow.current ?? solveProofOfWork());
      pow.current = null; // one answer pays for one post
      const res = await fetch(`/api/places/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: parsed.data, pow: proof, deviceKey: deviceKey() }),
      });
      if (!res.ok) throw new Error(await postError(res));
      saveNickname(parsed.data.nickname);
      markReviewed(slug, true);
      setMine(true);
      setOpen(false);
      setStatus({ kind: "sent" });
    } catch (err) {
      pow.current = null;
      setStatus({
        kind: "error",
        message:
          err instanceof PostsClosed
            ? "Reviews are not open yet."
            : err instanceof Error
              ? err.message
              : "Could not send the review.",
      });
    }
  }

  async function remove() {
    setStatus({ kind: "sending" });
    const res = await fetch(`/api/places/${encodeURIComponent(slug)}/reviews`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceKey: deviceKey() }),
    }).catch(() => null);
    if (res && (res.ok || res.status === 404)) {
      markReviewed(slug, false);
      setMine(false);
      setStatus({ kind: "deleted" });
    } else {
      setStatus({ kind: "error", message: res ? await postError(res) : "No connection." });
    }
  }

  const thisYear = new Date().getFullYear();
  const message =
    status.kind === "sent"
      ? "Thanks. Your review shows here once it has been checked, usually within a day."
      : status.kind === "deleted"
        ? "Your review is deleted."
        : status.kind === "error"
          ? status.message
          : null;

  return (
    <div className="flex flex-col gap-2">
      {!open && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={start}
            className={`${button} border border-stone-300 dark:border-stone-600`}
          >
            {mine ? "Change my review" : "Write a review"}
          </button>
          {mine && (
            <button
              type="button"
              onClick={remove}
              disabled={status.kind === "sending"}
              className={`${button} text-stone-700 underline dark:text-stone-300`}
            >
              Delete my review
            </button>
          )}
        </div>
      )}

      {open && (
        <form
          onSubmit={send}
          aria-label={`Review of ${placeName}`}
          className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-bold">Your rating</legend>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-2xl md:min-h-9 md:min-w-9"
                >
                  <input
                    type="radio"
                    name="rating"
                    value={n}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={`peer-focus-visible:outline-2 ${
                      n <= rating
                        ? "text-marigold dark:text-amber-400"
                        : "text-stone-300 dark:text-stone-600"
                    }`}
                  >
                    ★
                  </span>
                  <span className="sr-only">
                    {n} star{n === 1 ? "" : "s"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm font-bold">
            What should riders know?
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={REVIEW_BODY_MAX}
              rows={4}
              className={`${field} py-2 font-normal`}
              placeholder="The road in, parking, crowds, the best time…"
            />
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm font-bold">
              Visited in
              <select value={month} onChange={(e) => setMonth(e.target.value)} className={field}>
                <option value="">Month</option>
                {MONTH_SHORT.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Year
              <select value={year} onChange={(e) => setYear(e.target.value)} className={field}>
                <option value="">Year</option>
                {[0, 1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={thisYear - d}>
                    {thisYear - d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Came by
              <select
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className={field}
              >
                <option value="">—</option>
                {REVIEW_VEHICLES.map((v) => (
                  <option key={v} value={v}>
                    {VEHICLE_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-bold">
            Your name
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              autoComplete="nickname"
              className={field}
            />
          </label>

          <p className="text-xs text-stone-600 dark:text-stone-400">
            No sign-in. Your review is checked before it shows, and only this phone can change or
            delete it.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className={`${button} bg-brand text-white disabled:opacity-60`}
            >
              {status.kind === "sending" ? "Sending…" : "Send review"}
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

      <p role="status" className="text-sm" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
