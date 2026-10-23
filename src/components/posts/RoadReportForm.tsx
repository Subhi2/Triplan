"use client";

import { useRef, useState } from "react";
import { pointAtKm, type LngLat } from "@/lib/geo";
import {
  REPORT_NOTE_MAX,
  ROAD_REPORT_KINDS,
  ROAD_REPORT_LABELS,
  ROAD_REPORT_TTL_H,
  roadReportInputSchema,
  type RoadReportKind,
} from "@/lib/riderPosts";
import type { RouteOption } from "@/lib/trip";
import {
  deviceKey,
  postError,
  PostsClosed,
  saveNickname,
  savedNickname,
  solveProofOfWork,
  type PowPayload,
} from "./postClient";
import { button, field } from "./ReviewForm";

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/** Something to fix in the form; the proof of work already solved is kept for the next try. */
class FormProblem extends Error {}

/** The phone's position, asked for only when the rider picks "Where I am now". */
function currentPosition(): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new FormProblem("This browser cannot tell where you are: give the km instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]),
      () => reject(new FormProblem("Could not get your position: give the km instead.")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

/**
 * "Report the road": a closed or flooded road, a landslide, potholes or a diversion, at the
 * rider's position or a km of the route. Shown to everyone on this road once an admin approves
 * it, for 24 or 72 hours.
 */
export function RoadReportForm({ route }: { route: RouteOption }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<RoadReportKind>("landslide");
  const [where, setWhere] = useState<"here" | "km">("km");
  const [km, setKm] = useState("");
  const [note, setNote] = useState("");
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pow = useRef<Promise<PowPayload> | null>(null);

  function start() {
    setOpen(true);
    setNickname((n) => n || savedNickname());
    pow.current ??= solveProofOfWork();
    pow.current.catch(() => {});
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      let location: LngLat | null;
      if (where === "here") {
        location = await currentPosition();
      } else {
        const n = Number(km);
        if (km.trim() === "" || !Number.isFinite(n) || n < 0 || n > route.distanceKm) {
          throw new FormProblem(`Give a km between 0 and ${Math.floor(route.distanceKm)}.`);
        }
        location = pointAtKm(route.geometry.coordinates as LngLat[], n);
      }
      const parsed = roadReportInputSchema.safeParse({
        kind,
        location,
        note,
        nickname: nickname.trim() || null,
      });
      if (!parsed.success) {
        throw new FormProblem(parsed.error.issues[0]?.message ?? "Check the report.");
      }
      const proof = await (pow.current ?? solveProofOfWork());
      pow.current = null;
      const res = await fetch("/api/road-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: parsed.data, pow: proof, deviceKey: deviceKey() }),
      });
      if (!res.ok) throw new Error(await postError(res));
      if (parsed.data.nickname) saveNickname(parsed.data.nickname);
      setOpen(false);
      setNote("");
      setStatus({ kind: "sent" });
    } catch (err) {
      if (!(err instanceof FormProblem)) pow.current = null;
      setStatus({
        kind: "error",
        message:
          err instanceof PostsClosed
            ? "Road reports are not open yet."
            : err instanceof Error
              ? err.message
              : "Could not send the report.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {!open && (
        <button
          type="button"
          onClick={start}
          className={`${button} self-start border border-stone-300 dark:border-stone-600`}
        >
          Report the road
        </button>
      )}
      {open && (
        <form
          onSubmit={send}
          noValidate
          aria-label="Road report"
          className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
        >
          <label className="flex flex-col gap-1 text-sm font-bold">
            What is wrong
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as RoadReportKind)}
              className={field}
            >
              {ROAD_REPORT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ROAD_REPORT_LABELS[k]} (shown {ROAD_REPORT_TTL_H[k]} hours)
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-bold">Where</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
              <input
                type="radio"
                name="where"
                checked={where === "km"}
                onChange={() => setWhere("km")}
              />
              At km
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={Math.floor(route.distanceKm)}
                value={km}
                onChange={(e) => {
                  setKm(e.target.value);
                  setWhere("km");
                }}
                aria-label="Km along this route"
                className={`${field} w-24`}
              />
              of this route
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
              <input
                type="radio"
                name="where"
                checked={where === "here"}
                onChange={() => setWhere("here")}
              />
              Where I am now (asks for your position once)
            </label>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Note (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={REPORT_NOTE_MAX}
              rows={2}
              placeholder="One lane open, wait about 30 minutes…"
              className={`${field} py-2 font-normal`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Your name (optional)
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              autoComplete="nickname"
              className={field}
            />
          </label>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Checked before it shows to riders on this road. Your position is sent only as the place
            of the report.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className={`${button} bg-brand text-white disabled:opacity-60`}
            >
              {status.kind === "sending" ? "Sending…" : "Send report"}
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
      <p role="status" aria-live="polite" className="text-sm">
        {status.kind === "sent"
          ? "Thanks. Riders on this road see it once it has been checked."
          : status.kind === "error"
            ? status.message
            : null}
      </p>
    </div>
  );
}
