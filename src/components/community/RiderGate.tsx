"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { savedNickname } from "@/components/posts/postClient";
import { NICKNAME_MAX, nicknameSchema } from "@/lib/community/schemas";
import type { RiderMe } from "@/lib/community/views";
import { ensureRider, fetchMe } from "./riderSession";
import { errorText, field, hint, label, primaryButton, secondaryButton } from "./ui";

// The rider behind this browser, shared by a community page's parts. Loaded after mounting (the
// server does not render it); null until the rider picks a nickname.

interface RiderState {
  me: RiderMe | null;
  loading: boolean;
  setMe: (me: RiderMe | null) => void;
}

const RiderContext = createContext<RiderState>({ me: null, loading: true, setMe: () => {} });

export function RiderProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<RiderMe | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchMe()
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);
  return <RiderContext value={{ me, loading, setMe }}>{children}</RiderContext>;
}

export const useRider = () => useContext(RiderContext);

/**
 * Asks for a nickname before the rider's first community action, then makes their device account.
 * `why` says what it is for ("to ask to join"). Shown in place of the action until done.
 */
export function NicknamePrompt({
  why,
  onReady,
  onCancel,
}: {
  why: string;
  onReady: (me: RiderMe) => void;
  onCancel?: () => void;
}) {
  const { setMe } = useRider();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setName((n) => n || savedNickname()), []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = nicknameSchema.safeParse(name);
      if (!parsed.success) {
        setError("Pick a nickname of 1 to 24 characters.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const me = await ensureRider(parsed.data);
        setMe(me);
        onReady(me);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your nickname");
      } finally {
        setBusy(false);
      }
    },
    [name, onReady, setMe],
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Pick a nickname">
      <label className={label}>
        Your nickname {why}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NICKNAME_MAX}
          autoComplete="nickname"
          required
          autoFocus
          className={field}
        />
        <span className={hint}>
          Other riders see only this name. No email or phone number is needed; your account lives on
          this device until you keep it with an email.
        </span>
      </label>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Saving…" : "Continue"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
