"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { COMMUNITY_LOCAL_AUTH } from "@/lib/community/enabled";
import { NICKNAME_MAX, nicknameSchema } from "@/lib/community/schemas";
import type { MeOverview } from "@/lib/community/views";
import { ClubCard, GroupRideCard } from "./Cards";
import { NicknamePrompt, useRider } from "./RiderGate";
import {
  communityFetch,
  keepWithEmail,
  markUpdatesSeen,
  sendSignInLink,
  signOut,
} from "./riderSession";
import {
  card,
  dangerButton,
  errorText,
  field,
  hint,
  label,
  muted,
  primaryButton,
  secondaryButton,
} from "./ui";

function EmailForm({
  title,
  help,
  button,
  onSend,
}: {
  title: string;
  help: string;
  button: string;
  onSend: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | { error: string }>("idle");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = z.email().safeParse(email.trim());
        if (!parsed.success) return setState({ error: "Type an email address." });
        setState("sending");
        try {
          await onSend(parsed.data);
          setState("sent");
        } catch (err) {
          setState({ error: err instanceof Error ? err.message : "Could not send the link" });
        }
      }}
      className="flex flex-col gap-2"
    >
      <label className={label}>
        {title}
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={field}
        />
        <span className={hint}>{help}</span>
      </label>
      <button
        type="submit"
        disabled={state === "sending"}
        className={`${secondaryButton} self-start`}
      >
        {state === "sending" ? "Sending…" : button}
      </button>
      {state === "sent" && (
        <p role="status" className="text-brand-dark text-sm font-bold dark:text-teal-300">
          Check your email for the link.
        </p>
      )}
      {typeof state === "object" && (
        <p role="alert" className={errorText}>
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * "Me" (docs/02, "Community (G6)"): the rider's nickname, their clubs and rides, keeping the device
 * account with an email (or signing in to a kept one), and deleting it.
 */
export function MePanel({ linkFailed }: { linkFailed: boolean }) {
  const { me, loading, setMe } = useRider();
  const [overview, setOverview] = useState<MeOverview | null>(null);
  const [rename, setRename] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    markUpdatesSeen();
    communityFetch<MeOverview>("/api/me")
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your rides"));
  }, [me]);

  if (loading) return <p className={muted}>Loading…</p>;

  if (!me) {
    return (
      <div className="flex flex-col gap-6">
        {linkFailed && (
          <p role="alert" className={errorText}>
            That email link did not work. It may have expired: ask for a new one.
          </p>
        )}
        <section className={`${card} flex flex-col gap-3`}>
          <h2 className="font-display text-xl font-bold">Ride with others</h2>
          <p className={muted}>
            Pick a nickname to host rides, start a club or ask to join one. Your account lives on
            this device; no email or phone number is needed.
          </p>
          <NicknamePrompt why="" onReady={() => {}} />
        </section>
        {!COMMUNITY_LOCAL_AUTH && (
          <section className={`${card} flex flex-col gap-3`}>
            <EmailForm
              title="Kept your account with an email? Sign in"
              help="We send a link to the email you kept the account with."
              button="Send me a sign-in link"
              onSend={sendSignInLink}
            />
          </section>
        )}
      </div>
    );
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const parsed = nicknameSchema.safeParse(rename);
    if (!parsed.success) return setError("Pick a nickname of 1 to 24 characters.");
    setBusy(true);
    try {
      const { me: next } = await communityFetch<{ me: typeof me }>("/api/me", {
        method: "POST",
        body: { nickname: parsed.data },
      });
      setMe(next);
      setRename("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the nickname");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "Delete your account? Clubs you own and rides you host pass to an admin or co-host, or end.",
      )
    )
      return;
    setBusy(true);
    try {
      await communityFetch("/api/me", { method: "DELETE" });
      await signOut();
      setMe(null);
      setOverview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account");
    } finally {
      setBusy(false);
    }
  }

  const hosting = overview?.rides.filter((r) => r.role !== "rider") ?? [];
  const joined = overview?.rides.filter((r) => r.role === "rider") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Your nickname" className={`${card} flex flex-col gap-3`}>
        <p>
          Riding as <span className="font-display text-xl font-bold">{me.nickname}</span>
        </p>
        <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
          <label className={`${label} min-w-48 flex-1`}>
            New nickname
            <input
              value={rename}
              onChange={(e) => setRename(e.target.value)}
              maxLength={NICKNAME_MAX}
              className={field}
            />
          </label>
          <button type="submit" disabled={busy || !rename.trim()} className={secondaryButton}>
            Change
          </button>
        </form>
      </section>

      <section aria-label="Rides you host" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Rides you host</h2>
          <Link href="/group-rides/new" className={primaryButton}>
            Host a ride
          </Link>
        </div>
        {hosting.length === 0 ? (
          <p className={muted}>None yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {hosting.map((r) => (
              <li key={r.id}>
                <GroupRideCard ride={r} seat={{ role: r.role, status: r.status }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Rides you joined" className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-bold">Rides you joined or asked for</h2>
        {joined.length === 0 ? (
          <p className={muted}>
            None yet.{" "}
            <Link href="/group-rides" className="font-bold underline">
              Find a group ride
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {joined.map((r) => (
              <li key={r.id}>
                <GroupRideCard ride={r} seat={{ role: r.role, status: r.status }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Your clubs" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">Your clubs</h2>
          <Link href="/clubs/new" className={secondaryButton}>
            Start a club
          </Link>
        </div>
        {(overview?.clubs ?? []).length === 0 ? (
          <p className={muted}>
            None yet.{" "}
            <Link href="/clubs" className="font-bold underline">
              Find a club
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {overview!.clubs.map((c) => (
              <li key={c.slug}>
                <ClubCard club={c} seat={{ role: c.role, status: c.status }} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Your account" className={`${card} flex flex-col gap-4`}>
        <h2 className="font-display text-xl font-bold">Your account</h2>
        {me.isAnonymous && !COMMUNITY_LOCAL_AUTH ? (
          <EmailForm
            title="Keep your account with an email"
            help="Then you can sign in on another phone and keep your clubs and rides. Nobody else sees the email."
            button="Send the link"
            onSend={keepWithEmail}
          />
        ) : !me.isAnonymous ? (
          <>
            <p className={muted}>Your account is kept with your email.</p>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                setMe(null);
              }}
              className={`${secondaryButton} self-start`}
            >
              Sign out on this device
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={deleteAccount}
          className={`${dangerButton} self-start`}
        >
          Delete my account
        </button>
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
