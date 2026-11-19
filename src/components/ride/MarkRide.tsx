"use client";

import Link from "next/link";
import { useState } from "react";
import { NicknamePrompt, RiderProvider } from "@/components/community/RiderGate";
import { useRideMarks } from "@/components/community/useRideMarks";
import {
  card,
  errorText,
  field,
  label,
  muted,
  primaryButton,
  secondaryButton,
  softButton,
} from "@/components/community/ui";
import { RIDE_MARK_NOTE_MAX } from "@/lib/community/schemas";

/**
 * "Want to ride" and "I've ridden it" on a famous ride: the rider's own bucket list. Needs a rider
 * account (a nickname on this device); the first tap asks for the nickname.
 */
export function MarkRide({ rideSlug }: { rideSlug: string }) {
  return (
    <RiderProvider>
      <MarkRideBody rideSlug={rideSlug} />
    </RiderProvider>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function MarkRideBody({ rideSlug }: { rideSlug: string }) {
  const { me, marks, loading, save, remove } = useRideMarks();
  const mark = marks[rideSlug];
  const [asking, setAsking] = useState<null | "pending" | "done">(null);
  const [editing, setEditing] = useState(false);
  const [doneOn, setDoneOn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(job: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await job();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const choose = (status: "pending" | "done") => {
    if (!me) return setAsking(status);
    if (status === "pending") return void run(() => save({ rideSlug, status }));
    setDoneOn(today());
    setNote("");
    setEditing(true);
  };

  if (asking && !me) {
    return (
      <section aria-label="Your bucket list" className={`${card} flex flex-col gap-2`}>
        <NicknamePrompt
          why="to keep your bucket list"
          onCancel={() => setAsking(null)}
          onReady={() => {
            // The rider exists now; carry on with what they tapped.
            const status = asking;
            setAsking(null);
            if (status === "pending") void run(() => save({ rideSlug, status }));
            else {
              setDoneOn(today());
              setNote("");
              setEditing(true);
            }
          }}
        />
      </section>
    );
  }

  if (editing) {
    return (
      <form
        aria-label="Mark this ride done"
        className={`${card} flex flex-col gap-3`}
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => save({ rideSlug, status: "done", doneOn: doneOn || null, note }));
        }}
      >
        <label className={label}>
          When did you ride it?
          <input
            type="date"
            value={doneOn}
            max={today()}
            onChange={(e) => setDoneOn(e.target.value)}
            className={field}
          />
        </label>
        <label className={label}>
          A note, only for you (optional)
          <textarea
            value={note}
            maxLength={RIDE_MARK_NOTE_MAX}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
            className={`${field} py-2`}
          />
        </label>
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy ? "Saving…" : "Save as done"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <section aria-label="Your bucket list" className={`${card} flex flex-col gap-3`}>
      {loading ? (
        <p className={muted}>Loading your bucket list…</p>
      ) : mark?.status === "done" ? (
        <>
          <p className="font-bold">
            <span aria-hidden>✓ </span>You rode this
            {mark.doneOn && <span className="tabular font-mono"> · {mark.doneOn}</span>}
          </p>
          {mark.note && <p className="text-sm">{mark.note}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDoneOn(mark.doneOn ?? today());
                setNote(mark.note);
                setEditing(true);
              }}
              className={secondaryButton}
            >
              Edit
            </button>
            <a
              href={`/og/done?ride=${rideSlug}${mark.doneOn ? `&on=${mark.doneOn}` : ""}`}
              target="_blank"
              rel="noopener"
              className={secondaryButton}
            >
              Share card
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => remove(rideSlug))}
              className={secondaryButton}
            >
              Remove from my list
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="font-bold">
            {mark?.status === "pending" ? "On your bucket list" : "A ride to remember?"}
          </p>
          <div className="flex flex-wrap gap-2">
            {mark?.status !== "pending" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => choose("pending")}
                className={softButton}
              >
                Want to ride
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => choose("done")}
              className={primaryButton}
            >
              I&apos;ve ridden it
            </button>
            {mark?.status === "pending" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => remove(rideSlug))}
                className={secondaryButton}
              >
                Remove
              </button>
            )}
          </div>
        </>
      )}
      {error && !editing && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      {me && (
        <Link href="/me" className={`${muted} text-xs underline`}>
          Your rides
        </Link>
      )}
    </section>
  );
}
