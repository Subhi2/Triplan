"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { DynamicMapLibreView } from "@/components/map/DynamicMapView";
import { useWakeLock } from "@/components/geo/useWakeLock";
import { ShareButtons } from "@/components/site/ShareButtons";
import type { LngLat } from "@/lib/geo";
import {
  newRiderId,
  nicknameSchema,
  positionMessage,
  rideRoomPath,
  ridersView,
  ROOM_MAX_MS,
  SHARE_EVERY_MS,
  type PinMessage,
  type PositionMessage,
  type RiderPresence,
} from "@/lib/rideRoom";
import { trackEvent } from "@/lib/track";
import type { RouteOption } from "@/lib/trip";
import { openRideChannel, type RideChannel } from "./rideChannel";

interface Props {
  room: string;
  routeId: string | null;
  title: string | null;
  /** Family at home: watch the group without sharing a position or being listed. */
  follow: boolean;
}

const NICKNAME_KEY = "ride-nickname";
const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function seenAgo(s: number): string {
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

const button =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold md:min-h-9";

/**
 * A ride-together room (docs/02, "Ride together"): who is in, where each rider is, and a regroup
 * pin. A position is read only after "Share my position", sent every 10 s rounded to about 1 m,
 * and travels only on the room's channel: never stored, logged or sent to our server.
 */
export function RideRoom({ room, routeId, title, follow }: Props) {
  // One id per tab, made once (the server render has none: it is never shown).
  const [meId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : newRiderId(),
  );
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // The form works once the page is running: before that, Join would reload the page instead.
  const [ready, setReady] = useState(false);
  const [presence, setPresence] = useState<RiderPresence[]>([]);
  const [positions, setPositions] = useState<Map<string, PositionMessage>>(() => new Map());
  const [pin, setPin] = useState<PinMessage | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [failed, setFailed] = useState(false);
  const [route, setRoute] = useState<RouteOption | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [sharing, setSharing] = useState(false);
  const [myLocation, setMyLocation] = useState<LngLat | null>(null);
  const [notice, setNotice] = useState("");
  const channel = useRef<RideChannel | null>(null);
  const fix = useRef<{ location: LngLat; heading: number | null } | null>(null);
  const wakeLock = useWakeLock(sharing);

  // The nickname picked before (kept on this phone only).
  useEffect(() => {
    setReady(true);
    try {
      const saved = nicknameSchema.safeParse(localStorage.getItem(NICKNAME_KEY) ?? "");
      // Only into an empty box: never over what the rider has started typing.
      if (saved.success) setDraft((typed) => typed || saved.data);
    } catch {
      // Storage blocked: the rider types it.
    }
  }, []);

  // The trip's route, when the link carries one.
  useEffect(() => {
    if (!routeId) return;
    fetch(`/api/route?id=${routeId}`)
      .then(async (res) => (res.ok ? ((await res.json()) as { route: RouteOption }).route : null))
      .then(setRoute)
      .catch(() => setRoute(null));
  }, [routeId]);

  // Join once there is a name (followers join at once, unlisted).
  const joinAs = follow ? "Family" : name;
  useEffect(() => {
    if (!meId || !joinAs) return;
    const ch = openRideChannel(room, {
      onPosition: (p) => setPositions((all) => new Map(all).set(p.id, p)),
      onGone: (id) =>
        setPositions((all) => {
          const next = new Map(all);
          next.delete(id);
          return next;
        }),
      onPin: setPin,
      onPresence: setPresence,
      onError: () => setFailed(true),
    });
    ch.join({ id: meId, name: joinAs, follow });
    channel.current = ch;
    trackEvent("room_opened");
    return () => {
      ch.leave();
      channel.current = null;
    };
  }, [room, meId, joinAs, follow]);

  // "Seen 2 min ago" stays fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Sharing: watch the position, send it every 10 s, stop by itself after 12 hours.
  useEffect(() => {
    if (!sharing || !meId) return;
    const started = Date.now();
    const send = () => {
      const f = fix.current;
      if (f)
        channel.current?.sendPosition(positionMessage(meId, f.location, f.heading, Date.now()));
    };
    let first = true;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const location: LngLat = [p.coords.longitude, p.coords.latitude];
        fix.current = { location, heading: p.coords.heading };
        setMyLocation(location);
        if (first) {
          first = false;
          send();
        }
      },
      () => {
        setNotice("Your position is not available. Allow location for this site and try again.");
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    const timer = setInterval(() => {
      if (Date.now() - started > ROOM_MAX_MS) {
        setNotice("Sharing stopped after 12 hours. Tap Share my position to start again.");
        setSharing(false);
        return;
      }
      send();
    }, SHARE_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      channel.current?.sendGone(meId);
      fix.current = null;
      setMyLocation(null);
    };
  }, [sharing, meId]);

  const riders = useMemo(
    () => (meId ? ridersView(presence, positions, meId, myLocation, now) : []),
    [presence, positions, meId, myLocation, now],
  );
  const followers = presence.filter((p) => p.follow).length;
  const located = riders.flatMap((r) =>
    r.location ? [{ id: r.id, name: r.name, location: r.location, me: r.me, stale: r.stale }] : [],
  );
  const regroup: LngLat | null = pin ? [pin.lng, pin.lat] : null;
  // Frame the riders and the pin when someone new appears; the route frames itself.
  const framePoints = [...located.map((r) => r.location), ...(regroup ? [regroup] : [])];
  const frameKey = `${located.map((r) => r.id).join(",")}|${pin?.at ?? ""}`;

  function chooseName(e: React.FormEvent) {
    e.preventDefault();
    const n = nicknameSchema.safeParse(draft);
    if (!n.success) return;
    try {
      localStorage.setItem(NICKNAME_KEY, n.data);
    } catch {
      // Not remembered; still used here.
    }
    setName(n.data);
  }

  function dropPin(at: LngLat) {
    if (!pinMode || !joinAs) return;
    setPinMode(false);
    const p: PinMessage = { by: joinAs, lng: at[0], lat: at[1], at: Date.now() };
    setPin(p);
    channel.current?.sendPin(p);
  }

  const groupPath = rideRoomPath(room, { routeId, title });
  const followPath = rideRoomPath(room, { routeId, title, follow: true });

  const panel = (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-brand-dark text-sm font-bold dark:text-teal-300">
          ← Planner
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">Ride together</h1>
        {title && <p className="text-stone-700 dark:text-stone-300">{title}</p>}
      </header>

      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Could not join the room. Check the connection and open the link again.
        </p>
      )}

      {!follow && !name && (
        <form onSubmit={chooseName} data-ready={ready || undefined} className="flex flex-col gap-2">
          <label htmlFor="nickname" className="text-sm font-bold">
            Your name in the group
          </label>
          <div className="flex gap-2">
            <input
              id="nickname"
              value={draft}
              maxLength={24}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-11 flex-1 rounded-md border border-stone-300 bg-white px-2 text-base md:min-h-9 md:text-sm dark:border-stone-700 dark:bg-stone-900"
            />
            <button
              type="submit"
              disabled={!ready}
              className={`${button} bg-brand text-white disabled:opacity-60`}
            >
              Join
            </button>
          </div>
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Only the group sees it. Your position is shared only after you tap Share my position.
          </p>
        </form>
      )}

      {follow && (
        <p className="text-sm text-stone-700 dark:text-stone-300">
          You are following the group. Your position is not shared, and riders do not see you in the
          list.
        </p>
      )}

      {!follow && name && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {sharing ? (
              <button
                type="button"
                onClick={() => setSharing(false)}
                className={`${button} border border-stone-300 dark:border-stone-600`}
              >
                Stop sharing
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNotice("");
                  setSharing(true);
                }}
                className={`${button} bg-brand text-white`}
              >
                Share my position
              </button>
            )}
            <button
              type="button"
              aria-pressed={pinMode}
              onClick={() => setPinMode(!pinMode)}
              className={`${button} border border-stone-300 dark:border-stone-600`}
            >
              {pinMode ? "Tap the map…" : "Drop a regroup pin"}
            </button>
          </div>
          {sharing && (
            <p role="status" className="text-xs text-stone-600 dark:text-stone-400">
              Sharing every 10 seconds with the group only, never stored.{" "}
              {wakeLock === "held"
                ? "The screen stays on."
                : "Keep the screen on: sharing pauses when it locks."}
            </p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm text-stone-700 dark:text-stone-300">
          {notice}
        </p>
      )}

      {pin && (
        <p className="text-sm">
          <span className="font-bold">Regroup</span> pin from {pin.by} at {time.format(pin.at)}.
        </p>
      )}

      <section aria-labelledby="riders-heading" className="flex flex-col gap-1">
        <h2 id="riders-heading" className="font-display text-lg font-bold">
          In the room
        </h2>
        <ul aria-label="Riders" className="divide-y divide-stone-200 dark:divide-stone-800">
          {riders.map((r) => (
            <li key={r.id} className="flex min-h-11 items-center justify-between gap-2 py-1.5">
              <span className="font-bold">
                {r.name}
                {r.me && <span className="font-normal text-stone-600"> (you)</span>}
              </span>
              <span className="text-sm text-stone-600 dark:text-stone-400">
                {r.me
                  ? sharing
                    ? "sharing"
                    : "not sharing"
                  : r.location
                    ? `${r.distanceKm !== null ? `${r.distanceKm.toFixed(1)} km away · ` : ""}${seenAgo(r.seenAgoS ?? 0)}`
                    : "not sharing"}
              </span>
            </li>
          ))}
        </ul>
        {riders.length === 0 && (
          <p className="text-sm text-stone-600 dark:text-stone-400">No riders yet.</p>
        )}
        {followers > 0 && (
          <p className="text-xs text-stone-600 dark:text-stone-400">
            {followers} following from home.
          </p>
        )}
      </section>

      {!follow && (
        <section aria-label="Invite" className="flex flex-col gap-1">
          <p className="text-sm font-bold">Invite the group</p>
          <ShareButtons
            title="Ride together"
            text={title ? `Ride together: ${title}` : "Ride together"}
            path={groupPath}
            linkClassName="text-brand-dark inline-flex min-h-11 items-center text-sm font-bold hover:underline md:min-h-0 dark:text-teal-300"
          />
          <button
            type="button"
            onClick={async () => {
              const href = `${window.location.origin}${followPath}`;
              try {
                await navigator.clipboard.writeText(href);
                setNotice("Family link copied: it shows the group without sharing a position.");
              } catch {
                setNotice(`Family link: ${href}`);
              }
            }}
            className="text-brand-dark inline-flex min-h-11 items-center self-start text-sm font-bold hover:underline md:min-h-0 dark:text-teal-300"
          >
            Copy a follow link for family
          </button>
        </section>
      )}
    </div>
  );

  return (
    <main className="flex h-dvh flex-col md:flex-row">
      <aside className="order-2 overflow-y-auto px-4 py-4 md:order-1 md:w-[24rem] md:shrink-0 md:border-r md:border-stone-200 md:py-6 dark:md:border-stone-800">
        {panel}
      </aside>
      <div className="relative order-1 h-[45dvh] shrink-0 md:order-2 md:h-auto md:flex-1">
        <DynamicMapLibreView
          routes={route ? [route] : []}
          selectedRouteId={route?.id ?? null}
          onSelectRoute={() => {}}
          stops={[]}
          places={[]}
          activePlaceId={null}
          hoverPlaceId={null}
          onSelectPlace={() => {}}
          onHoverPlace={() => {}}
          riders={located}
          regroup={regroup}
          frame={framePoints.length > 0 ? { key: frameKey, points: framePoints } : null}
          onMapClick={dropPin}
        />
      </div>
    </main>
  );
}
