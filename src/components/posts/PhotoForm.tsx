"use client";

import { useRef, useState } from "react";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/riderPosts";
import { nicknameSchema } from "@/lib/rideRoom";
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

/**
 * "Add a photo" on a place, without sign-in. The server resizes it and removes its metadata (the
 * GPS position, phone and time); it shows, credited to the name given, once an admin approves it.
 */
export function PhotoForm({ slug, placeName }: { slug: string; placeName: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [nickname, setNickname] = useState("");
  const [consent, setConsent] = useState(false);
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
    const name = nicknameSchema.safeParse(nickname);
    const problem = !file
      ? "Choose a photo."
      : !(PHOTO_TYPES as readonly string[]).includes(file.type)
        ? "Use a JPEG, PNG or WebP photo."
        : file.size > PHOTO_MAX_BYTES
          ? "The photo is over 8 MB."
          : !name.success
            ? "Add a name to credit the photo to."
            : !consent
              ? "Tick the box to say you took it."
              : null;
    if (problem || !file || !name.success) {
      setStatus({ kind: "error", message: problem ?? "Check the photo." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      const proof = await (pow.current ?? solveProofOfWork());
      pow.current = null;
      const form = new FormData();
      form.set("photo", file);
      form.set("nickname", name.data);
      form.set("consent", "yes");
      form.set("deviceKey", deviceKey());
      form.set("pow", JSON.stringify(proof));
      const res = await fetch(`/api/places/${encodeURIComponent(slug)}/photos`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(await postError(res));
      saveNickname(name.data);
      setOpen(false);
      setFile(null);
      setStatus({ kind: "sent" });
    } catch (err) {
      pow.current = null;
      setStatus({
        kind: "error",
        message:
          err instanceof PostsClosed
            ? "Photos are not open yet."
            : err instanceof Error
              ? err.message
              : "Could not send the photo.",
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
          Add a photo
        </button>
      )}
      {open && (
        <form
          onSubmit={send}
          aria-label={`Photo of ${placeName}`}
          className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700"
        >
          <label className="flex flex-col gap-1 text-sm font-bold">
            Photo (JPEG, PNG or WebP, up to 8 MB)
            <input
              type="file"
              accept={PHOTO_TYPES.join(",")}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="min-h-11 text-base font-normal md:text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Credit it to
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={24}
              autoComplete="nickname"
              className={field}
            />
          </label>
          <label className="flex min-h-11 items-start gap-2 text-sm md:min-h-0">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 size-4"
            />
            <span>
              I took this photo and let Triplan show it with my name. The location and camera
              details in the file are removed.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={status.kind === "sending"}
              className={`${button} bg-brand text-white disabled:opacity-60`}
            >
              {status.kind === "sending" ? "Sending…" : "Send photo"}
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
          ? "Thanks. Your photo shows here once it has been checked."
          : status.kind === "error"
            ? status.message
            : null}
      </p>
    </div>
  );
}
