"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GeocodeResult } from "@/lib/trip";

interface Props {
  label: string; // accessible name, e.g. "Start"
  placeholder: string;
  value: string;
  resolved: boolean;
  autoFocus?: boolean;
  onText: (text: string) => void;
  onPick: (result: GeocodeResult) => void;
}

type Status = "idle" | "loading" | "error";

async function searchPlaces(q: string, source: "local" | "osm", signal: AbortSignal) {
  const res = await fetch(`/api/geocode?${new URLSearchParams({ q, source })}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { results: GeocodeResult[] }).results;
}

/**
 * Place search combobox. Suggestions while typing come from our own places and towns; OpenStreetMap
 * (Nominatim) is only queried on Enter or the "Search OpenStreetMap" button, because the public
 * Nominatim usage policy forbids as-you-type autocomplete.
 */
export function StopInput({
  label,
  placeholder,
  value,
  resolved,
  autoFocus,
  onText,
  onPick,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [source, setSource] = useState<"local" | "osm">("local");
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inflight = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => clearTimeout(debounce.current), []);

  function run(q: string, src: "local" | "osm") {
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setStatus("loading");
    setSource(src);
    setOpen(true);
    searchPlaces(q, src, ctrl.signal)
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
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(() => run(text.trim(), "local"), 250);
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

  return (
    <div className="relative flex-1">
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`focus:ring-brand w-full rounded-md border bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:ring-2 dark:bg-stone-900 dark:text-stone-100 ${
          resolved ? "border-brand/60" : "border-stone-300 dark:border-stone-700"
        }`}
      />
      {showPanel && (
        <div
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-stone-200 bg-white text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900"
          // Keep focus in the input so clicks on options register before blur closes the panel.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`}>
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => pick(r)}
                className={`cursor-pointer px-3 py-2 ${i === active ? "bg-brand/10" : "hover:bg-stone-100 dark:hover:bg-stone-800"}`}
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
          <div className="border-t border-stone-200 px-3 py-2 dark:border-stone-700">
            {status === "loading" ? (
              <span className="text-stone-500">Searching…</span>
            ) : status === "error" ? (
              <span className="text-red-700 dark:text-red-400">Search failed. Try again.</span>
            ) : source === "local" ? (
              <button type="button" className="text-brand underline" onClick={() => run(q, "osm")}>
                Search OpenStreetMap for “{q}”
              </button>
            ) : (
              <span className="text-xs text-stone-500">
                Search by Nominatim · © OpenStreetMap contributors
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
