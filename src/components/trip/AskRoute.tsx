"use client";

import Link from "next/link";
import { useState } from "react";

interface Answer {
  answer: string;
  places: { slug: string; name: string; kmFromStart: number }[];
  rules: { slug: string; title: string; link: string }[];
}

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "done"; question: string; answer: Answer }
  | { status: "error"; message: string };

/**
 * "Ask this route" (G12, C10): a question about the picked route, answered only from its own
 * places, road rules and stops, with links to the places and rules the answer uses. The question
 * is not kept.
 */
export function AskRoute({ routeId }: { routeId: string }) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (q.length < 3) return;
    setState({ status: "busy" });
    try {
      const res = await fetch("/api/route/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId, question: q }),
      });
      const body = (await res.json().catch(() => ({}))) as Answer & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not answer just now.");
      setState({ status: "done", question: q, answer: body });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Could not answer just now.",
      });
    }
  }

  return (
    <section
      aria-labelledby="ask-route"
      className="flex flex-col gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
    >
      <h3 id="ask-route" className="font-display text-[17px] font-bold tracking-tight">
        Ask this route
      </h3>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          aria-label="Your question about this route"
          placeholder="Where can I stop for lunch after the ghat?"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-stone-300 bg-(--surface) px-3 text-base md:min-h-10 md:text-sm dark:border-stone-700"
        />
        <button
          type="submit"
          disabled={state.status === "busy" || question.trim().length < 3}
          className="bg-brand hover:bg-brand-dark inline-flex min-h-11 items-center rounded-xl px-4 font-bold text-white disabled:opacity-60 md:min-h-10"
        >
          {state.status === "busy" ? "…" : "Ask"}
        </button>
      </form>
      <div aria-live="polite" className="flex flex-col gap-1 text-sm">
        {state.status === "done" && (
          <>
            <p>{state.answer.answer}</p>
            {state.answer.places.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {state.answer.places.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/place/${p.slug}`}
                      className="text-brand-dark font-bold underline dark:text-teal-300"
                    >
                      {p.name}
                    </Link>{" "}
                    <span className="tabular font-mono text-xs">km {p.kmFromStart}</span>
                  </li>
                ))}
              </ul>
            )}
            {state.answer.rules.map((r) => (
              <a
                key={r.slug}
                href={r.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                {r.title}: the official page
              </a>
            ))}
          </>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-ghat-dark dark:text-orange-300">
            {state.message}
          </p>
        )}
      </div>
      <p className="text-xs text-stone-600 dark:text-stone-400">
        Answered by AI from this route&apos;s places, road rules and stops only. Your question is
        not kept.
      </p>
    </section>
  );
}
