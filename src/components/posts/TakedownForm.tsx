"use client";

import { useEffect, useRef, useState } from "react";
import {
  CONTENT_NOTE_MAX,
  CONTENT_REPORT_KINDS,
  CONTENT_REPORT_LABELS,
  contentReportInputSchema,
  ownPath,
  type ContentReportKind,
} from "@/lib/riderPosts";
import { deviceKey, postError, PostsClosed, solveProofOfWork, type PowPayload } from "./postClient";
import { button, field } from "./ReviewForm";

type Status =
  { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

class FormProblem extends Error {}

/**
 * Ask for something to be taken down (G9). The page link comes prefilled from ?url= (the
 * "Report this page" links); only links to this site are accepted. Goes to an admin only.
 */
export function TakedownForm({ open: postsOpen }: { open: boolean }) {
  const [page, setPage] = useState("");
  const [kind, setKind] = useState<ContentReportKind>("copyright");
  const [note, setNote] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pow = useRef<Promise<PowPayload> | null>(null);

  useEffect(() => {
    const from = new URLSearchParams(window.location.search).get("url");
    const path = from ? ownPath(from, window.location.origin) : null;
    if (path) setPage(path);
  }, []);

  function warm() {
    pow.current ??= solveProofOfWork();
    pow.current.catch(() => {});
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });
    try {
      const path = ownPath(page, window.location.origin);
      if (!path) throw new FormProblem("Paste the link to the page on this site.");
      const parsed = contentReportInputSchema.safeParse({ path, kind, note, contact });
      if (!parsed.success) {
        throw new FormProblem(parsed.error.issues[0]?.message ?? "Check what you wrote.");
      }
      const proof = await (pow.current ?? solveProofOfWork());
      pow.current = null;
      const res = await fetch("/api/takedown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: parsed.data, pow: proof, deviceKey: deviceKey() }),
      });
      if (!res.ok) throw new Error(await postError(res));
      setStatus({ kind: "sent" });
    } catch (err) {
      if (!(err instanceof FormProblem)) pow.current = null;
      setStatus({
        kind: "error",
        message:
          err instanceof PostsClosed
            ? "The form is not open yet."
            : err instanceof Error
              ? err.message
              : "Could not send it.",
      });
    }
  }

  if (!postsOpen) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-400">
        The form is not open yet on this copy of the site.
      </p>
    );
  }

  if (status.kind === "sent") {
    return (
      <p role="status" className="font-bold">
        Thanks. We read every request and take down what should not be here.
      </p>
    );
  }

  return (
    <form
      onSubmit={send}
      onFocus={warm}
      noValidate
      aria-label="Ask for a takedown"
      className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-(--surface) p-4 dark:border-stone-700"
    >
      <label className="flex flex-col gap-1 text-sm font-bold">
        Link to the page
        <input
          type="url"
          inputMode="url"
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="The page's link on this site"
          className={`${field} font-normal`}
        />
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-bold">What is wrong?</legend>
        {CONTENT_REPORT_KINDS.map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-2 text-sm md:min-h-8">
            <input
              type="radio"
              name="takedown-kind"
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {CONTENT_REPORT_LABELS[k]}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-bold">
        What should come down, and why
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={CONTENT_NOTE_MAX}
          rows={4}
          placeholder="Which photo, review or text, and what makes it wrong to show"
          className={`${field} py-2 font-normal`}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">
        How to answer you (optional)
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
          autoComplete="email"
          placeholder="An email or phone, if you want a reply"
          className={`${field} font-normal`}
        />
      </label>
      <p className="text-xs text-stone-600 dark:text-stone-400">
        Only we read this. The contact is kept only to answer you and deleted 90 days after we
        settle the request.
      </p>
      {status.kind === "error" && (
        <p role="alert" className="text-sm font-bold text-red-700 dark:text-red-400">
          {status.message}
        </p>
      )}
      <button
        type="submit"
        disabled={status.kind === "sending"}
        className={`${button} bg-brand self-start text-white disabled:opacity-60`}
      >
        {status.kind === "sending" ? "Sending…" : "Send the request"}
      </button>
    </form>
  );
}
