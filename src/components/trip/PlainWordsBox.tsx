"use client";

import { useState, type FormEvent } from "react";
import type { LngLat } from "@/lib/geo";

const EXAMPLES = [
  "Monsoon waterfalls from Pune, under 120 km",
  "Weekend ride from Bengaluru to the coffee hills",
  "Chennai to Puducherry by the coast, by car",
];

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "done"; summary: string; picked: string | null }
  | { status: "error"; message: string };

/**
 * "Plan in plain words": a sentence becomes a trip in the planner. Shown only when the AI key is
 * set; the text goes to the AI provider to be read and is not stored.
 */
export function PlainWordsBox({ near }: { near: LngLat }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function plan(e?: FormEvent, words = text) {
    e?.preventDefault();
    if (words.trim().length < 3 || state.status === "busy") return;
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/trip-from-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: words, near }),
      });
      const data = (await res.json()) as {
        query?: string;
        summary?: string;
        picked?: string | null;
        error?: string;
      };
      if (!res.ok || !data.query) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState({ status: "done", summary: data.summary ?? "", picked: data.picked ?? null });
      // A full page load: the planner reads its trip from the address once.
      window.location.assign(`/?${data.query}`);
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Couldn't plan that",
      });
    }
  }

  return (
    <section
      aria-labelledby="plain-words"
      className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-(--surface) p-3 dark:border-stone-700"
    >
      <h2 id="plain-words" className="font-display text-[17px] font-bold tracking-tight">
        Or say it in plain words
      </h2>
      <form onSubmit={(e) => void plan(e)} className="flex gap-2">
        <label htmlFor="plain-words-text" className="sr-only">
          Describe your ride
        </label>
        <input
          id="plain-words-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="2-day monsoon ride from Pune with waterfalls"
          className="field-glow min-h-12 min-w-0 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 text-base md:min-h-11 dark:border-stone-600 dark:bg-stone-800"
        />
        <button
          type="submit"
          disabled={state.status === "busy" || text.trim().length < 3}
          className="lift bg-brand min-h-12 shrink-0 rounded-xl px-4 font-bold text-white disabled:opacity-50 md:min-h-11"
        >
          {state.status === "busy" ? "Planning…" : "Plan it"}
        </button>
      </form>
      {state.status === "idle" && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Examples">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => {
                  setText(ex);
                  void plan(undefined, ex);
                }}
                className="min-h-11 rounded-full bg-stone-100 px-3 text-left text-xs md:min-h-9 dark:bg-stone-800"
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p aria-live="polite" className="text-sm">
        {state.status === "done" && (
          <span className="text-brand-dark dark:text-teal-300">
            {state.summary}
            {state.picked && ` · we picked ${state.picked}`}
          </span>
        )}
        {state.status === "error" && (
          <span role="alert" className="text-red-700 dark:text-red-400">
            {state.message}
          </span>
        )}
      </p>
      <p className="text-xs text-stone-600 dark:text-stone-400">
        Read by Claude (AI); what you type is not stored.
      </p>
    </section>
  );
}
