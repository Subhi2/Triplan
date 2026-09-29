"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LngLat } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/trip";

/** Suggestions are fetched this long after the rider stops typing. */
export const SUGGEST_DEBOUNCE_MS = 300;
const MIN_PANEL_PX = 160;
const PANEL_MARGIN_PX = 12;

/** Where the map is looking; suggestions near it rank higher. */
export interface MapBias {
  center: LngLat;
  zoom: number;
}

interface Props {
  label: string; // accessible name, e.g. "Start"
  placeholder: string;
  value: string;
  resolved: boolean;
  near: MapBias;
  autoFocus?: boolean;
  onText: (text: string) => void;
  onPick: (result: GeocodeResult) => void;
}

type Status = "idle" | "loading" | "error";
type Mode = "suggest" | "osm";

async function searchPlaces(q: string, source: Mode, near: MapBias, signal: AbortSignal) {
  const params = new URLSearchParams({
    q,
    source,
    lat: near.center[1].toFixed(3),
    lon: near.center[0].toFixed(3),
    zoom: String(Math.max(0, Math.round(near.zoom))),
  });
  const res = await fetch(`/api/geocode?${params}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { results: GeocodeResult[] }).results;
}

/**
 * Place search combobox. While typing (after a 300 ms pause) it suggests our own places first, then
 * Photon results near the map centre. Pressing Enter without picking a suggestion searches
 * Nominatim instead, as a fallback: its public server forbids search-as-you-type.
 */
export function StopInput({
  label,
  placeholder,
  value,
  resolved,
  near,
  autoFocus,
  onText,
  onPick,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [mode, setMode] = useState<Mode>("suggest");
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<AbortController | undefined>(undefined);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => clearTimeout(debounce.current), []);

  function run(q: string, m: Mode) {
    clearTimeout(debounce.current);
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setStatus("loading");
    setMode(m);
    setOpen(true);
    searchPlaces(q, m, near, ctrl.signal)
      .then((r) => {
        setResults(r);
        setActive(-1);
        setStatus("idle");
        setOpen(true);
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) {
          console.error(err);
          setStatus("error");
        }
      });
  }

  function handleChange(text: string) {
    onText(text);
    clearTimeout(debounce.current);
    if (text.trim().length < 2) {
      inflight.current?.abort();
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(() => run(text.trim(), "suggest"), SUGGEST_DEBOUNCE_MS);
  }

  function pick(r: GeocodeResult) {
    onPick(r);
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[active];
      if (open && chosen) pick(chosen);
      else if (value.trim().length >= 2) run(value.trim(), "osm");
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const q = value.trim();
  const showPanel = open && q.length >= 2 && !resolved;

  // The panel fits above the on-screen keyboard and scrolls, so every suggestion can be reached:
  // the visual viewport shrinks when the keyboard opens, and the form itself does not scroll.
  const [panelMaxPx, setPanelMaxPx] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!showPanel) return;
    const vv = window.visualViewport;
    const fit = () => {
      const inputBottom = input.current?.getBoundingClientRect().bottom ?? 0;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      setPanelMaxPx(Math.max(MIN_PANEL_PX, visibleBottom - inputBottom - PANEL_MARGIN_PX));
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
    };
  }, [showPanel]);
  const fromPhoton = results.some((r) => r.source === "photon");

  return (
    <div className="relative flex-1">
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`focus:ring-brand w-full rounded-xl border bg-stone-50 px-3 py-2.5 text-base text-stone-900 outline-none focus:bg-(--surface) focus:ring-2 md:py-2 dark:bg-stone-950 dark:text-stone-100 ${
          resolved ? "border-brand/50" : "border-stone-200 dark:border-stone-700"
        }`}
      />
      {showPanel && (
        <div
          style={{ maxHeight: panelMaxPx }}
          className="animate-rise absolute z-20 mt-1.5 flex w-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-(--surface) text-sm shadow-xl dark:border-stone-700"
          // Keep focus in the input so clicks on options register before blur closes the panel.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => {
                  pick(r);
                  // A tapped pick is done: close the phone keyboard. Keyboard users keep focus.
                  if (window.matchMedia("(pointer: coarse)").matches) input.current?.blur();
                }}
                className={`cursor-pointer px-3 py-2.5 ${i === active ? "bg-brand-tint dark:bg-teal-950" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}
              >
                <div className="font-medium">{r.name}</div>
                {r.label !== r.name && (
                  <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                    {r.label}
                  </div>
                )}
              </li>
            ))}
            {status === "idle" && results.length === 0 && (
              <li className="px-3 py-2 text-stone-500">No matches</li>
            )}
          </ul>
          <div className="shrink-0 space-y-0.5 border-t border-stone-200 px-3 py-2 text-xs text-stone-500 dark:border-stone-700">
            {status === "loading" ? (
              <p>Searching…</p>
            ) : status === "error" ? (
              <p className="text-red-700 dark:text-red-400">Search failed. Try again.</p>
            ) : mode === "suggest" ? (
              <>
                <p>Not listed? Press Enter to search OpenStreetMap more widely.</p>
                {fromPhoton && <p>Suggestions by Photon · © OpenStreetMap contributors</p>}
              </>
            ) : (
              <p>Search by Nominatim · © OpenStreetMap contributors</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
