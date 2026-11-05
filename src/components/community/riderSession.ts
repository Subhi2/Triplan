"use client";

import { createBrowserClient } from "@supabase/ssr";
import { COMMUNITY_LOCAL_AUTH } from "@/lib/community/enabled";
import type { RiderMe } from "@/lib/community/views";
import {
  postError,
  saveNickname,
  solveProofOfWork,
  type PowPayload,
} from "@/components/posts/postClient";

// The browser's side of riders' device accounts (docs/02, "Community (G6)"). Nothing signs in on
// page load: the first tap on Host, Start a club or Ask to join makes the account (Supabase's
// anonymous sign-in, from the rider's own address), then the nickname is saved on our server.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

let client: ReturnType<typeof createBrowserClient> | null = null;
function supabase() {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}

export class CommunityRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A JSON call to the community API; throws the server's message when it fails. */
export async function communityFetch<T>(url: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) throw new CommunityRequestError(await postError(res), res.status);
  return (await res.json()) as T;
}

/** This browser's rider, or null before they picked a nickname. */
export async function fetchMe(): Promise<RiderMe | null> {
  const data = await communityFetch<{ me: RiderMe | null }>("/api/me");
  return data.me;
}

/** Makes the device account if there is none yet, and saves the nickname. */
export async function ensureRider(nickname: string): Promise<RiderMe> {
  if (!COMMUNITY_LOCAL_AUTH) {
    const { data } = await supabase().auth.getSession();
    if (!data.session) {
      const { error } = await supabase().auth.signInAnonymously();
      if (error)
        throw new CommunityRequestError(`Could not start your account: ${error.message}`, 503);
    }
  }
  const { me } = await communityFetch<{ me: RiderMe }>("/api/me", {
    method: "POST",
    body: { nickname },
  });
  saveNickname(nickname);
  return me;
}

/**
 * Keeps the device account with an email: Supabase sends a link, and once it is opened the same
 * account works on any device where the rider signs in with that email.
 */
export async function keepWithEmail(email: string): Promise<void> {
  if (COMMUNITY_LOCAL_AUTH) return;
  const { error } = await supabase().auth.updateUser(
    { email },
    { emailRedirectTo: `${window.location.origin}/auth/rider` },
  );
  if (error) throw new CommunityRequestError(error.message, 400);
}

/** Sends a sign-in link to a kept account's email (never makes a new account). */
export async function sendSignInLink(email: string): Promise<void> {
  if (COMMUNITY_LOCAL_AUTH) return;
  const { error } = await supabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/rider` },
  });
  if (error) throw new CommunityRequestError(error.message, 400);
}

/** Signs this browser out (a kept account stays and can sign in again). */
export async function signOut(): Promise<void> {
  if (COMMUNITY_LOCAL_AUTH) {
    await fetch("/api/me?session=only", { method: "DELETE" }).catch(() => {});
    return;
  }
  await supabase().auth.signOut();
}

/** A proof of work for the next post, started early so it is ready by the time of the tap. */
export function startProofOfWork(): Promise<PowPayload> {
  const p = solveProofOfWork();
  // A failure shows when the rider sends, not before.
  p.catch(() => {});
  return p;
}

// When the rider last looked at their updates, for the badge on "Me".
const SEEN_KEY = "triplan.community.seen.v1";

export function lastSeenUpdates(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

export function markUpdatesSeen(now = new Date()) {
  try {
    localStorage.setItem(SEEN_KEY, now.toISOString());
  } catch {
    // The badge may show the same decisions again; nothing else depends on it.
  }
}
