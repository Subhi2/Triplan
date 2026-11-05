"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PowPayload } from "@/components/posts/postClient";
import { formatDuration, formatKm } from "@/lib/format";
import { canClub } from "@/lib/community/roles";
import {
  COMMUNITY_VEHICLE_LABELS,
  COMMUNITY_VEHICLES,
  groupRideInputSchema,
  RIDE_ABOUT_MAX,
  RIDE_JOIN_LABELS,
  RIDE_JOIN_POLICIES,
  RIDE_NEED_LABELS,
  RIDE_NEEDS,
  RIDE_PACE_LABELS,
  RIDE_PACES,
  RIDE_SEATS_MAX,
  RIDE_TITLE_MAX,
  RIDE_VISIBILITIES,
  RIDE_VISIBILITY_LABELS,
  type GroupRideInput,
  type RideNeed,
} from "@/lib/community/schemas";
import type { ClubPublic, ClubView } from "@/lib/community/views";
import type { SavedTrip, TripSummary } from "@/lib/savedTrip";
import { trackEvent } from "@/lib/track";
import { deviceTripIds } from "@/lib/tripTokens";
import { NicknamePrompt, useRider } from "./RiderGate";
import { communityFetch, startProofOfWork } from "./riderSession";
import {
  card,
  chip,
  chipOff,
  chipOn,
  errorText,
  field,
  hint,
  label,
  muted,
  primaryButton,
} from "./ui";

/** "2026-11-15T05:30" for a datetime-local input, in the browser's time. */
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Next Saturday at 5:30 am: when most group rides leave. */
function nextSaturdayMorning(now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(5, 30, 0, 0);
  return d;
}

function Chips<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={`${chip} ${value === o ? chipOn : chipOff}`}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** With no trip in the link: the trips on this device to pick from, or the planner. */
function PickTrip({ club }: { club: ClubPublic | null }) {
  const [trips, setTrips] = useState<TripSummary[] | null>(null);
  useEffect(() => {
    const ids = deviceTripIds();
    if (ids.length === 0) return setTrips([]);
    fetch(`/api/trips?ids=${ids.join(",")}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ trips: TripSummary[] }>) : { trips: [] }))
      .then((d) => setTrips(d.trips))
      .catch(() => setTrips([]));
  }, []);
  const clubParam = club ? `&club=${club.slug}` : "";
  return (
    <section aria-label="Pick a trip" className="flex flex-col gap-3">
      <p>A group ride follows one of your saved trips. Pick the road:</p>
      {trips === null ? (
        <p className={muted}>Loading your trips…</p>
      ) : trips.length === 0 ? (
        <p className={muted}>No saved trips on this device yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trips.map((t) => (
            <li key={t.id}>
              <Link
                href={`/group-rides/new?trip=${t.id}${clubParam}`}
                className={`${card} flex flex-col gap-1 hover:border-stone-400`}
              >
                <span className="font-bold">{t.title}</span>
                <span className={`text-sm ${muted}`}>
                  {t.from} → {t.to}
                  {t.distanceKm !== null && <> · {formatKm(t.distanceKm * 1000)}</>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/" className={`${primaryButton} self-start`}>
        Plan and save a trip
      </Link>
    </section>
  );
}

/**
 * Host a group ride on a saved trip (docs/02, "Community (G6)"). Live at once; the host decides who
 * rides, or lets riders in while seats last. The exact meeting point and the WhatsApp link go only
 * to riders who are in.
 */
export function HostRideForm({ trip, club }: { trip: SavedTrip | null; club: ClubPublic | null }) {
  const router = useRouter();
  const { me, loading } = useRider();
  const start = trip?.stops[0];
  const [title, setTitle] = useState(trip?.title ?? "");
  const [about, setAbout] = useState("");
  const [when, setWhen] = useState("");
  const [meetLabel, setMeetLabel] = useState(start?.label.split(",")[0]?.trim().slice(0, 60) ?? "");
  const [meetNote, setMeetNote] = useState("");
  const [meetAtStart, setMeetAtStart] = useState(true);
  const [seats, setSeats] = useState(8);
  const [vehicle, setVehicle] = useState<GroupRideInput["vehicle"]>(trip?.vehicle ?? "bike");
  const [pace, setPace] = useState<GroupRideInput["pace"]>("steady");
  const [needs, setNeeds] = useState<RideNeed[]>(["own_vehicle", "helmet"]);
  const [visibility, setVisibility] = useState<GroupRideInput["visibility"]>("public");
  const [joinPolicy, setJoinPolicy] = useState<GroupRideInput["joinPolicy"]>("approval");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubOk, setClubOk] = useState<boolean | null>(club ? null : true);
  const pow = useRef<Promise<PowPayload> | null>(null);

  useEffect(() => setWhen(localInput(nextSaturdayMorning())), []);
  useEffect(() => {
    if (me && trip) pow.current ??= startProofOfWork();
  }, [me, trip]);
  // Only a club's owner and admins host its rides.
  useEffect(() => {
    if (!club || !me) return;
    communityFetch<ClubView>(`/api/clubs/${club.slug}`)
      .then((v) => setClubOk(canClub(v.me?.seat ?? null, "host_ride")))
      .catch(() => setClubOk(false));
  }, [club, me]);

  if (loading) return null;
  if (!me) return <NicknamePrompt why="as the ride's host" onReady={() => {}} />;
  if (!trip) return <PickTrip club={club} />;
  if (club && clubOk === false) {
    return (
      <p className={muted}>
        Only the owner and admins of {club.name} host its rides.{" "}
        <Link href="/group-rides/new" className="font-bold underline">
          Host it as your own ride
        </Link>
        .
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const startsAt = when ? new Date(when) : null;
    const parsed = groupRideInputSchema.safeParse({
      tripId: trip!.id,
      clubId: club?.id ?? null,
      title,
      about,
      startsAt: startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toISOString() : "",
      meetLabel,
      meetNote,
      meetPoint: meetAtStart && start ? start.location : null,
      seats,
      vehicle,
      pace,
      needs,
      visibility,
      joinPolicy,
      whatsappUrl: whatsapp,
    });
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path[0];
      setError(
        path === "title"
          ? "Give the ride a name of 3 to 80 characters."
          : path === "startsAt"
            ? "Pick the day and time you leave."
            : path === "meetLabel"
              ? "Say where riders meet (a town or area)."
              : (parsed.error.issues[0]?.message ?? "Check the form."),
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      pow.current ??= startProofOfWork();
      const proof = await pow.current;
      pow.current = null;
      const { id } = await communityFetch<{ id: string }>("/api/group-rides", {
        method: "POST",
        body: { ride: parsed.data, pow: proof },
      });
      trackEvent("ride_hosted");
      router.push(`/group-rides/${id}`);
    } catch (err) {
      pow.current = null;
      setError(err instanceof Error ? err.message : "Could not put the ride up");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" aria-label="Host a group ride">
      <div className={`${card} flex flex-col gap-1`}>
        <span className="text-xs font-bold tracking-wide text-stone-600 uppercase dark:text-stone-400">
          The road
        </span>
        <span className="font-bold">{trip.title}</span>
        <span className={`tabular font-mono text-sm`}>
          {trip.stops[0]?.label} → {trip.stops.at(-1)?.label}
          {trip.distanceKm !== null && <> · {formatKm(trip.distanceKm * 1000)}</>}
          {trip.durationMin !== null && <> · {formatDuration(trip.durationMin)}</>}
        </span>
        {club && <span className={`text-sm ${muted}`}>A ride of {club.name}</span>}
      </div>
      <label className={label}>
        Ride name
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={RIDE_TITLE_MAX}
          required
          className={field}
        />
      </label>
      <label className={label}>
        Leaving
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
          className={field}
        />
      </label>
      <label className={label}>
        Meeting in (everyone sees this)
        <input
          value={meetLabel}
          onChange={(e) => setMeetLabel(e.target.value)}
          maxLength={60}
          required
          className={field}
          placeholder="Bengaluru"
        />
      </label>
      <label className={label}>
        Exact meeting point (only riders who are in see it)
        <input
          value={meetNote}
          onChange={(e) => setMeetNote(e.target.value)}
          maxLength={200}
          className={field}
          placeholder="Shell pump after the Nice Road toll"
        />
      </label>
      <label className="-mt-3 inline-flex min-h-11 items-center gap-2 text-sm md:min-h-0">
        <input
          type="checkbox"
          checked={meetAtStart}
          onChange={(e) => setMeetAtStart(e.target.checked)}
          className="h-5 w-5"
        />
        Pin the meeting point at the trip&apos;s start
      </label>
      <label className={label}>
        Seats for riders (besides you)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={RIDE_SEATS_MAX}
          value={seats}
          onChange={(e) =>
            setSeats(Math.max(1, Math.min(RIDE_SEATS_MAX, Number(e.target.value) || 1)))
          }
          className={`${field} tabular max-w-32 font-mono`}
        />
        <span className={hint}>A rider with a pillion takes two.</span>
      </label>
      <Chips
        legend="Who rides"
        options={COMMUNITY_VEHICLES}
        labels={COMMUNITY_VEHICLE_LABELS}
        value={vehicle}
        onChange={setVehicle}
      />
      <Chips
        legend="Pace"
        options={RIDE_PACES}
        labels={RIDE_PACE_LABELS}
        value={pace}
        onChange={setPace}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-bold">Riders need</legend>
        <div className="flex flex-wrap gap-2">
          {RIDE_NEEDS.map((n) => {
            const on = needs.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setNeeds((list) => (on ? list.filter((x) => x !== n) : [...list, n]))
                }
                className={`${chip} ${on ? chipOn : chipOff}`}
              >
                {RIDE_NEED_LABELS[n]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <Chips
        legend="Who can see it"
        options={club ? RIDE_VISIBILITIES : RIDE_VISIBILITIES.filter((v) => v !== "club")}
        labels={RIDE_VISIBILITY_LABELS}
        value={visibility}
        onChange={setVisibility}
      />
      <Chips
        legend="Joining"
        options={RIDE_JOIN_POLICIES}
        labels={RIDE_JOIN_LABELS}
        value={joinPolicy}
        onChange={setJoinPolicy}
      />
      <label className={label}>
        About the ride (optional)
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          maxLength={RIDE_ABOUT_MAX}
          rows={4}
          className={`${field} py-2`}
          placeholder="Breakfast at Gowdru Hotel, back by dark. Full tank before the ghat."
        />
      </label>
      <label className={label}>
        WhatsApp group link (optional)
        <input
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          inputMode="url"
          placeholder="https://chat.whatsapp.com/…"
          className={field}
        />
        <span className={hint}>Only riders who are in see it.</span>
      </label>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={`${primaryButton} self-start`}>
        {busy ? "Putting it up…" : "Put the ride up"}
      </button>
    </form>
  );
}
