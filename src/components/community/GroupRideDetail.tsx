"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PowPayload } from "@/components/posts/postClient";
import { ShareButtons } from "@/components/site/ShareButtons";
import {
  canActOnRideMember,
  canRide,
  RIDE_ROLE_LABELS,
  type RideSeat,
} from "@/lib/community/roles";
import {
  JOIN_NOTE_MAX,
  RIDE_JOIN_LABELS,
  RIDE_JOIN_POLICIES,
  RIDE_SEATS_MAX,
  type RideMemberAction,
} from "@/lib/community/schemas";
import { rideApprovedText, rideInviteText, rideJoinedText } from "@/lib/community/shareText";
import type { GroupRidePublic, GroupRideView, RideMemberRow } from "@/lib/community/views";
import { whatsAppUrl } from "@/lib/site";
import { trackEvent } from "@/lib/track";
import { RidePublicInfo } from "./RidePublicInfo";
import { NicknamePrompt, useRider } from "./RiderGate";
import { communityFetch, startProofOfWork } from "./riderSession";
import {
  card,
  chip,
  chipOff,
  chipOn,
  dangerButton,
  errorText,
  field,
  label,
  linkButton,
  muted,
  primaryButton,
  secondaryButton,
  softButton,
} from "./ui";

const ACTION_LABELS: Record<RideMemberAction, string> = {
  approve: "Let in",
  waitlist: "Waitlist",
  decline: "Decline",
  remove: "Remove",
  make_cohost: "Make co-host",
  make_rider: "Make rider",
};

const STATUS_LABELS: Record<RideMemberRow["status"], string> = {
  pending: "Asking",
  approved: "In",
  waitlist: "Waitlist",
  declined: "Declined",
  left: "Left",
  removed: "Removed",
};

/** The buttons a host or co-host gets on one rider or request. */
function riderActions(me: RideSeat | null, m: RideMemberRow, self: boolean): RideMemberAction[] {
  if (!canActOnRideMember(me, m, self)) return [];
  if (m.status === "pending") return ["approve", "waitlist", "decline"];
  if (m.status === "waitlist") return ["approve", "decline"];
  const roles: RideMemberAction[] = canRide(me, "set_cohosts")
    ? [m.role === "cohost" ? "make_rider" : "make_cohost"]
    : [];
  return [...roles, "remove"];
}

function RiderList({
  title,
  rows,
  seat,
  myId,
  busy,
  onAct,
  ride,
}: {
  title: string;
  rows: RideMemberRow[];
  seat: RideSeat | null;
  myId: string | null;
  busy: boolean;
  onAct: (m: RideMemberRow, a: RideMemberAction) => void;
  ride: GroupRidePublic;
}) {
  if (rows.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-bold">
        {title} <span className="tabular font-mono text-sm font-normal">{rows.length}</span>
      </h2>
      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-700">
        {rows.map((m) => {
          const actions = riderActions(seat, m, m.riderId === myId);
          return (
            <li
              key={m.riderId}
              data-rider={m.nickname}
              data-status={m.status}
              className="flex flex-col gap-2 py-2"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold">{m.nickname}</span>
                {m.role !== "rider" && (
                  <span className="text-brand-dark text-xs font-bold uppercase dark:text-teal-300">
                    {RIDE_ROLE_LABELS[m.role]}
                  </span>
                )}
                {m.pillion && <span className={`text-xs ${muted}`}>+ pillion</span>}
                {m.status !== "approved" && (
                  <span className={`text-xs ${muted}`}>{STATUS_LABELS[m.status]}</span>
                )}
                {m.riderId === myId && <span className={`text-xs ${muted}`}>(you)</span>}
              </div>
              {m.note && <p className={`text-sm ${muted}`}>“{m.note}”</p>}
              {actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={busy}
                      onClick={() => onAct(m, a)}
                      className={
                        a === "approve"
                          ? softButton
                          : a === "remove" || a === "decline"
                            ? dangerButton
                            : secondaryButton
                      }
                    >
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                  {m.status === "approved" && m.role === "rider" && (
                    <a
                      href={whatsAppUrl(rideApprovedText(ride, m.nickname), window.location.href)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkButton}
                    >
                      Tell them on WhatsApp
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The host's changes: seats, joining, time and the ride being called off. */
function HostSettings({
  ride,
  canCancel,
  busy,
  onSave,
}: {
  ride: GroupRidePublic;
  canCancel: boolean;
  busy: boolean;
  onSave: (update: Record<string, unknown>) => void;
}) {
  const [seats, setSeats] = useState(ride.seats);
  const [joinPolicy, setJoinPolicy] = useState(ride.joinPolicy);
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold">Seats and joining</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          Seats
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={RIDE_SEATS_MAX}
            value={seats}
            onChange={(e) =>
              setSeats(Math.max(1, Math.min(RIDE_SEATS_MAX, Number(e.target.value) || 1)))
            }
            className={`${field} tabular w-28 font-mono`}
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Joining">
          {RIDE_JOIN_POLICIES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={joinPolicy === p}
              onClick={() => setJoinPolicy(p)}
              className={`${chip} ${joinPolicy === p ? chipOn : chipOff}`}
            >
              {RIDE_JOIN_LABELS[p]}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={busy || (seats === ride.seats && joinPolicy === ride.joinPolicy)}
          onClick={() => onSave({ seats, joinPolicy })}
          className={secondaryButton}
        >
          Save
        </button>
      </div>
      {canCancel && ride.state !== "past" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const off = ride.state !== "cancelled";
            if (!off || window.confirm("Call the ride off? Riders see it on the page."))
              onSave({ cancelled: off });
          }}
          className={`${ride.state === "cancelled" ? secondaryButton : dangerButton} self-start`}
        >
          {ride.state === "cancelled" ? "Put the ride back on" : "Call the ride off"}
        </button>
      )}
    </div>
  );
}

/**
 * A group ride's page for this viewer (docs/02, "Community (G6)"): ask to join, the meeting point,
 * WhatsApp group and ride-together room once in, and for the host and co-hosts the requests and
 * riders. `initial` is the public part the server rendered (null for a members-only ride).
 */
export function GroupRideDetail({ id, initial }: { id: string; initial: GroupRidePublic | null }) {
  const { me, loading } = useRider();
  const [view, setView] = useState<GroupRideView | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [pillion, setPillion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const pow = useRef<Promise<PowPayload> | null>(null);

  const reload = useCallback(async () => {
    try {
      setView(await communityFetch<GroupRideView>(`/api/group-rides/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the ride");
    }
  }, [id]);

  useEffect(() => {
    if (!loading) void reload();
  }, [loading, me, reload]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      pow.current = null;
      setError(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  const ride = view?.ride ?? initial;
  const seat = view?.me?.seat ?? null;
  const live = seat && ["pending", "approved", "waitlist"].includes(seat.status) ? seat : null;
  const isHost = canRide(seat, "manage_riders");

  if (!ride) {
    // A members-only ride, before or without membership.
    return (
      <section className={`${card} flex flex-col gap-2`}>
        <h1 className="font-display text-2xl font-bold">A members-only ride</h1>
        {loading || !view ? (
          <p className={muted}>Loading…</p>
        ) : (
          <p className={muted}>
            This ride is for the members of{" "}
            {view.club ? (
              <Link href={`/clubs/${view.club.slug}`} className="font-bold underline">
                {view.club.name}
              </Link>
            ) : (
              "its club"
            )}
            . Join the club to see it.
          </p>
        )}
      </section>
    );
  }

  const send = () =>
    run(async () => {
      pow.current ??= startProofOfWork();
      const proof = await pow.current;
      pow.current = null;
      const { status } = await communityFetch<{ status: string }>(
        `/api/group-rides/${id}/requests`,
        {
          method: "POST",
          body: { request: { note, pillion }, pow: proof },
        },
      );
      trackEvent("ride_requested");
      setAsking(false);
      setNotice(
        status === "approved"
          ? "You're in. The meeting point is below."
          : status === "waitlist"
            ? "The ride is full: you're on the waitlist."
            : "Request sent. The host will decide.",
      );
    });

  const act = (m: RideMemberRow, action: RideMemberAction) => {
    if (action === "remove" && !window.confirm(`Remove ${m.nickname} from the ride?`)) return;
    void run(() =>
      communityFetch(`/api/group-rides/${id}/requests/${m.riderId}`, {
        method: "POST",
        body: { action },
      }),
    );
  };

  const open = ride.state === "open" || ride.state === "full";
  const priv = view?.private;

  return (
    <div className="flex flex-col gap-6">
      <RidePublicInfo ride={ride} />

      <section aria-label="Your place on the ride" className={`${card} flex flex-col gap-3`}>
        {loading || !view ? (
          <p className={muted}>Loading…</p>
        ) : seat?.role === "host" ? (
          <p className="font-bold">You&apos;re hosting this ride.</p>
        ) : seat?.status === "removed" ? (
          <p className={muted}>The host took you off this ride.</p>
        ) : live ? (
          <>
            <p className="font-bold">
              {live.status === "approved"
                ? live.role === "cohost"
                  ? "You're in, as a co-host."
                  : "You're in."
                : live.status === "waitlist"
                  ? "You're on the waitlist. You get in if a seat frees up."
                  : "You asked to join. The host will decide."}
            </p>
            {open && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      live.status === "approved" ? "Leave the ride?" : "Take back your request?",
                    )
                  ) {
                    void run(() =>
                      communityFetch(`/api/group-rides/${id}/requests`, { method: "DELETE" }),
                    );
                  }
                }}
                className={`${secondaryButton} self-start`}
              >
                {live.status === "approved" ? "Leave the ride" : "Take back my request"}
              </button>
            )}
          </>
        ) : !open ? (
          <p className={muted}>
            {ride.state === "cancelled"
              ? "The host called this ride off."
              : "This ride has started."}
          </p>
        ) : !asking ? (
          <>
            {seat?.status === "declined" && (
              <p className={muted}>The host said no last time. You can ask again.</p>
            )}
            <button
              type="button"
              onClick={() => {
                setAsking(true);
                if (me) pow.current ??= startProofOfWork();
              }}
              className={`${primaryButton} self-start`}
            >
              {ride.joinPolicy === "open" && ride.state === "open"
                ? "Join the ride"
                : ride.state === "full"
                  ? "Join the waitlist"
                  : "Ask to join"}
            </button>
          </>
        ) : !me ? (
          <NicknamePrompt
            why="for the ride"
            onReady={() => (pow.current ??= startProofOfWork())}
            onCancel={() => setAsking(false)}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex flex-col gap-3"
          >
            <label className={label}>
              A note for the host (optional)
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={JOIN_NOTE_MAX}
                rows={2}
                className={`${field} py-2`}
                placeholder="Classic 350, done Charmadi twice."
              />
            </label>
            {ride.needs.includes("pillion_ok") && (
              <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pillion}
                  onChange={(e) => setPillion(e.target.checked)}
                  className="h-5 w-5"
                />
                I&apos;m bringing a pillion (takes two seats)
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "Sending…" : "Send"}
              </button>
              <button type="button" onClick={() => setAsking(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {notice && (
          <p role="status" className="text-brand-dark text-sm font-bold dark:text-teal-300">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
      </section>

      {priv && (
        <section aria-label="For riders on this ride" className={`${card} flex flex-col gap-3`}>
          <h2 className="font-display text-xl font-bold">For riders on this ride</h2>
          <p>
            <span className="font-bold">Meeting point:</span> {priv.meetNote || ride.meetLabel}
            {priv.meetPoint && (
              <>
                {" · "}
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${priv.meetPoint[1]},${priv.meetPoint[0]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkButton}
                >
                  Open the pin in Google Maps
                </a>
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {priv.whatsappUrl && (
              <a
                href={priv.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={softButton}
              >
                Open the ride&apos;s WhatsApp group
              </a>
            )}
            <a href={priv.roomPath} target="_blank" rel="noopener" className={secondaryButton}>
              Ride together on the day
            </a>
            {seat?.role !== "host" && (
              <a
                href={whatsAppUrl(rideJoinedText(ride), window.location.href)}
                target="_blank"
                rel="noopener noreferrer"
                className={linkButton}
              >
                Tell family on WhatsApp
              </a>
            )}
          </div>
          <p className={`text-xs ${muted}`}>
            Ride together shows the group on the map while riding. Positions are shared only after a
            tap and never stored.
          </p>
          <RiderList
            title="Riding"
            rows={priv.riders}
            seat={seat}
            myId={me?.id ?? null}
            busy={busy}
            onAct={act}
            ride={ride}
          />
        </section>
      )}

      {isHost && view && (
        <section aria-label="Run the ride" className={`${card} flex flex-col gap-4`}>
          <h2 className="font-display text-xl font-bold">Run the ride</h2>
          <div className="flex flex-col gap-1">
            <p className="text-sm">Invite riders: anyone with the link can ask to join.</p>
            <ShareButtons
              title={ride.title}
              text={rideInviteText(ride)}
              path={`/group-rides/${id}`}
              linkClassName={linkButton}
              onNotice={setNotice}
            />
          </div>
          <RiderList
            title="Asking to join"
            rows={(view.requests ?? []).filter((r) => r.status === "pending")}
            seat={seat}
            myId={me?.id ?? null}
            busy={busy}
            onAct={act}
            ride={ride}
          />
          <RiderList
            title="Waitlist"
            rows={(view.requests ?? []).filter((r) => r.status === "waitlist")}
            seat={seat}
            myId={me?.id ?? null}
            busy={busy}
            onAct={act}
            ride={ride}
          />
          {(view.requests ?? []).length === 0 && (
            <p className={`text-sm ${muted}`}>No requests waiting.</p>
          )}
          <HostSettings
            key={`${ride.seats}-${ride.joinPolicy}`}
            ride={ride}
            canCancel={canRide(seat, "cancel")}
            busy={busy}
            onSave={(update) =>
              void run(() =>
                communityFetch(`/api/group-rides/${id}`, { method: "PATCH", body: { update } }),
              )
            }
          />
        </section>
      )}
    </div>
  );
}
