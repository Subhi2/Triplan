"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, LineString, Point } from "geojson";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { categoryStyle } from "@/lib/categories";
import { climbAt, elevationAt, type ElevationProfile } from "@/lib/elevation";
import {
  buildFlyPath,
  FLY_PITCH,
  flySeconds,
  kmAtTime,
  lookBearing,
  pointAt,
  smoothAngle,
  targetAt,
  timeAtKm,
  zoomAt,
} from "@/lib/flyover";
import { formatMetres } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { detourLabel, type PlaceAlong } from "@/lib/places";
import { TERRAIN_CREDIT_SHORT, terrainTilesUrl } from "@/lib/terrain";

const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty";
const SPEEDS = [0.5, 1, 2, 4] as const;
/** A place's card shows while the camera is this close to it along the road. */
const CARD_WITHIN_KM = 0.8;
/** Camera turns follow the road with this time constant (seconds). */
const TURN_TAU_S = 0.8;
/** Frames slower than this on average (ms) make the preview drop detail. */
const SLOW_FRAME_MS = 50;

export type PreviewPlace = Pick<
  PlaceAlong,
  "id" | "name" | "category" | "location" | "kmFromStart" | "detourKm" | "thumbUrl"
>;

export interface RidePreviewProps {
  title: string;
  geometry: LineString;
  ghats: [number, number][];
  hairpinKm: number[];
  profile: ElevationProfile | null;
  places: PreviewPlace[];
  onClose: () => void;
}

interface Hud {
  km: number;
  t: number;
}

const point = (at: LngLat): Feature<Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: at },
  properties: {},
});

/** The road done in teal, the road ahead in white. */
function progressGradient(share: number) {
  return [
    "step",
    ["line-progress"],
    "#0f766e",
    Math.min(0.999999, Math.max(1e-6, share)),
    "#ffffff",
  ];
}

/** Keeps the rider low on the screen, above the controls, with the road ahead in view. */
function chasePadding(map: MapLibreMap) {
  const h = map.getContainer().clientHeight;
  return { top: Math.round(h * 0.42), bottom: Math.round(h * 0.14), left: 0, right: 0 };
}

function firstSymbolLayer(map: MapLibreMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

function lowEndDevice(): boolean {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return (navigator.hardwareConcurrency ?? 8) <= 4 || memory <= 4;
}

/**
 * The 3D ride preview: a full-screen MapLibre map with 3D terrain whose camera rides the route,
 * slower through ghats, past hairpins and places. MapLibre only (no Google content), loaded on
 * demand. Under reduced motion it opens on an overview and moves only when asked.
 */
export default function RidePreview(props: RidePreviewProps) {
  const { geometry, ghats, hairpinKm, profile, places, onClose } = props;
  const coords = geometry.coordinates as LngLat[];
  const path = useMemo(
    () => buildFlyPath(coords, ghats, [...hairpinKm, ...places.map((p) => p.kmFromStart)]),
    // The route and its stops do not change while the preview is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const duration = flySeconds(path.totalKm);
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const box = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tRef = useRef(0);
  const dirty = useRef(true);
  const [playing, setPlaying] = useState(!reduced);
  const playingRef = useRef(playing);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const speedRef = useRef(speed);
  const [hud, setHud] = useState<Hud>({ km: 0, t: 0 });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [simplified, setSimplified] = useState(false);
  playingRef.current = playing;
  speedRef.current = speed;

  // The map, its layers and the animation loop: set up once.
  useEffect(() => {
    const container = box.current;
    if (!container) return;
    const lowEnd = lowEndDevice();
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container,
        style: MAP_STYLE,
        center: targetAt(path, 0),
        zoom: zoomAt(path, 0),
        pitch: reduced ? 45 : FLY_PITCH,
        bearing: lookBearing(path, 0),
        maxPitch: 75,
        interactive: false,
        attributionControl: false,
        pixelRatio: Math.min(window.devicePixelRatio || 1, lowEnd ? 1 : 1.5),
      });
    } catch (err) {
      console.warn("3D preview could not start", err);
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: TERRAIN_CREDIT_SHORT,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      const dem = {
        type: "raster-dem" as const,
        tiles: [terrainTilesUrl()],
        tileSize: 256,
        encoding: "terrarium" as const,
        maxzoom: 13,
      };
      map.addSource("terrain-dem", dem);
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.4 });
      if (!lowEnd) {
        map.addSource("hillshade-dem", dem);
        map.addLayer(
          {
            id: "hillshade",
            type: "hillshade",
            source: "hillshade-dem",
            paint: { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#3f3a2e" },
          },
          firstSymbolLayer(map),
        );
      }
      map.addSource("route", {
        type: "geojson",
        lineMetrics: true,
        data: { type: "Feature", geometry, properties: {} },
      });
      const round = { "line-cap": "round", "line-join": "round" } as const;
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: round,
        paint: { "line-color": "#1b1a17", "line-width": 9, "line-opacity": 0.35 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: round,
        paint: { "line-width": 5, "line-gradient": progressGradient(0) as never },
      });
      map.addSource("places", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: places.map((p) => ({
            ...point(p.location),
            properties: { color: categoryStyle(p.category).color },
          })),
        },
      });
      map.addLayer({
        id: "places",
        type: "circle",
        source: "places",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addSource("rider", { type: "geojson", data: point(pointAt(path, 0)) });
      map.addLayer({
        id: "rider-halo",
        type: "circle",
        source: "rider",
        paint: { "circle-radius": 16, "circle-color": "#0f766e", "circle-opacity": 0.25 },
      });
      map.addLayer({
        id: "rider",
        type: "circle",
        source: "rider",
        paint: {
          "circle-radius": 7,
          "circle-color": "#0f766e",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 3,
        },
      });
      if (reduced) {
        const lngs = coords.map((c) => c[0]);
        const lats = coords.map((c) => c[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 60, pitch: 45, duration: 0 },
        );
      }
      setReady(true);
    });

    let frame = 0;
    let last = performance.now();
    let bearing = lookBearing(path, 0);
    let lastHud = 0;
    let lastShare = -1;
    let slowSince = 0;
    let slowFrames = 0;
    let degrade = 0;
    // Under reduced motion the camera stays on the overview until the rider plays or scrubs.
    let following = !reduced;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (map.isStyleLoaded() && map.getLayer("rider")) {
        if (playingRef.current) {
          following = true;
          tRef.current = Math.min(1, tRef.current + (dt * speedRef.current) / duration);
          if (tRef.current >= 1) setPlaying(false);
          dirty.current = true;

          // Drop detail if frames are slow: first sharpness, then the 3D terrain.
          if (dt * 1000 > SLOW_FRAME_MS) slowFrames++;
          if (now - slowSince > 2000) {
            if (slowFrames > 60 && degrade < 2) {
              degrade++;
              if (degrade === 1) map.setPixelRatio(1);
              else {
                map.setTerrain(null);
                if (map.getLayer("hillshade")) map.removeLayer("hillshade");
              }
              setSimplified(true);
            }
            slowSince = now;
            slowFrames = 0;
          }
        }
        if (dirty.current) {
          const km = kmAtTime(path, tRef.current);
          const target = lookBearing(path, km);
          bearing = playingRef.current ? smoothAngle(bearing, target, dt, TURN_TAU_S) : target;
          if (following) {
            map.jumpTo({
              center: targetAt(path, km),
              bearing,
              pitch: FLY_PITCH,
              zoom: zoomAt(path, km),
              padding: chasePadding(map),
            });
          }
          (map.getSource("rider") as GeoJSONSource | undefined)?.setData(point(pointAt(path, km)));
          const share = km / path.totalKm;
          if (Math.abs(share - lastShare) > 0.0005) {
            map.setPaintProperty("route-line", "line-gradient", progressGradient(share) as never);
            lastShare = share;
          }
          // The turn has not settled until the camera faces the road.
          dirty.current = playingRef.current || Math.abs(target - bearing) > 0.5;
          if (now - lastHud > 100) {
            setHud({ km, t: tRef.current });
            lastHud = now;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const onScrub = () => {
      following = true;
    };
    container.addEventListener("ride-scrub", onScrub);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("ride-scrub", onScrub);
      map.remove();
      mapRef.current = null;
    };
    // Set up once per open preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes; the page behind does not scroll; focus starts on Close and returns on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);

  function scrubTo(km: number) {
    tRef.current = timeAtKm(path, km);
    dirty.current = true;
    box.current?.dispatchEvent(new Event("ride-scrub"));
    setHud({ km, t: tRef.current });
  }

  function togglePlay() {
    if (!playing && tRef.current >= 1) tRef.current = 0; // play again from the start
    dirty.current = true;
    setPlaying(!playing);
  }

  const km = hud.km;
  const height = profile ? elevationAt(profile, km) : null;
  const climb = profile ? climbAt(profile, km) : null;
  const inGhat = ghats.some(([a, b]) => km >= a * path.totalKm && km <= b * path.totalKm);
  const card = places
    .filter((p) => Math.abs(p.kmFromStart - km) <= CARD_WITHIN_KM)
    .sort((a, b) => Math.abs(a.kmFromStart - km) - Math.abs(b.kmFromStart - km))[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`3D ride preview: ${props.title}`}
      className="fixed inset-0 z-50 bg-stone-900 text-stone-900"
    >
      {/* MapLibre makes its container position: relative, so it fills an absolute box. */}
      <div className="absolute inset-0">
        <div ref={box} className="h-full w-full" />
      </div>

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-100 p-6 text-center">
          <p className="max-w-sm text-base">
            The 3D preview needs WebGL, which this browser or device does not offer. The elevation
            profile under the route cards shows the same ups and downs.
          </p>
        </div>
      )}
      {!ready && !failed && (
        <p className="absolute inset-x-0 top-1/2 text-center text-sm text-stone-100">
          Loading the terrain…
        </p>
      )}

      {/* Heads-up display */}
      <div className="pointer-events-none absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 flex max-w-[calc(100%-6rem)] flex-col gap-1.5">
        <div className="rounded-2xl bg-white/90 px-3.5 py-2.5 shadow-sm backdrop-blur-md">
          <p className="font-display truncate text-base leading-tight font-bold">{props.title}</p>
          <p className="mt-0.5 text-sm text-stone-600">
            km{" "}
            <span className="tabular font-mono font-semibold text-stone-900" data-hud-km>
              {km.toFixed(1)}
            </span>{" "}
            of <span className="tabular font-mono">{path.totalKm.toFixed(0)}</span>
            {height !== null && (
              <>
                {" · "}
                <span className="tabular font-mono font-semibold text-stone-900">
                  {formatMetres(height)}
                </span>
              </>
            )}
          </p>
        </div>
        {(inGhat || climb) && (
          <p className="flex gap-1.5">
            {inGhat && (
              <span className="bg-ghat rounded-full px-2.5 py-1 text-xs font-bold text-white">
                Ghat
              </span>
            )}
            {climb && (
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold shadow-sm">
                {climb.dir === "up" ? "Climbing" : "Descending"} {climb.gradePct}%
              </span>
            )}
          </p>
        )}
      </div>

      <button
        ref={closeButton}
        type="button"
        onClick={onClose}
        aria-label="Close the preview"
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-xl font-bold shadow-sm backdrop-blur-md"
      >
        ×
      </button>

      {/* The place the camera is passing */}
      {card && (
        <div
          key={card.id}
          className="animate-rise pointer-events-none absolute bottom-[calc(10.5rem+env(safe-area-inset-bottom))] left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl bg-white/95 p-2.5 pr-4 shadow-md sm:bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
          data-card={card.name}
        >
          {card.thumbUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- remote photo, already sized
            <img
              src={card.thumbUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
            />
          )}
          <span className="min-w-0">
            <span className="block truncate font-bold">{card.name}</span>
            <span className="flex items-center gap-1.5 text-sm text-stone-600">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: categoryStyle(card.category).color }}
              />
              {categoryStyle(card.category).name} · km {Math.round(card.kmFromStart)} ·{" "}
              {detourLabel(card.detourKm)}
            </span>
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-[calc(2.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl bg-white/92 p-3 shadow-md backdrop-blur-md">
          <ScrubTrack
            profile={profile}
            totalKm={path.totalKm}
            km={km}
            onScrub={(k) => {
              if (playing) setPlaying(false);
              scrubTo(k);
            }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              className="bg-brand inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold text-white"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
              {playing ? "Pause" : hud.t >= 1 ? "Play again" : "Play"}
            </button>
            <div role="group" aria-label="Speed" className="flex rounded-xl bg-stone-100 p-1">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                  className={`tabular min-h-9 min-w-10 rounded-lg px-2 font-mono text-sm ${
                    speed === s ? "bg-stone-900 font-bold text-white" : ""
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            {simplified && (
              <span className="ml-auto hidden text-xs text-stone-600 sm:inline">
                Simplified for this device
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The scrubber: a range input over a small elevation profile that fills as the ride goes on. */
function ScrubTrack({
  profile,
  totalKm,
  km,
  onScrub,
}: {
  profile: ElevationProfile | null;
  totalKm: number;
  km: number;
  onScrub: (km: number) => void;
}) {
  const share = totalKm > 0 ? km / totalKm : 0;
  let area: string | null = null;
  if (profile) {
    const lo = profile.lowest.m;
    const range = Math.max(200, profile.highest.m - lo);
    const pts = profile.points.map(
      ([k, m]) =>
        `${((k / totalKm) * 100).toFixed(2)},${(40 - ((m - lo) / range) * 34).toFixed(2)}`,
    );
    area = `M0,40L${pts.join("L")}L100,40Z`;
  }
  return (
    <div className="relative h-10">
      {area && (
        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <clipPath id="ride-done">
              <rect x={0} y={0} width={share * 100} height={40} />
            </clipPath>
          </defs>
          <path d={area} fill="#cfc8ba" />
          <path d={area} fill="#0f766e" clipPath="url(#ride-done)" />
        </svg>
      )}
      {!area && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-stone-300"
        >
          <div className="bg-brand h-full rounded-full" style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <input
        type="range"
        min={0}
        max={Math.round(totalKm * 10)}
        value={Math.round(km * 10)}
        onChange={(e) => onScrub(Number(e.target.value) / 10)}
        aria-label="Position along the route"
        aria-valuetext={`km ${km.toFixed(1)} of ${totalKm.toFixed(0)}`}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-stone-900"
        style={{ left: `${share * 100}%` }}
      />
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden fill="currentColor">
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden fill="currentColor">
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
    </svg>
  );
}
