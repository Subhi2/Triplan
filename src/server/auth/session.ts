import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { COMMUNITY_LOCAL_AUTH, communityEnabled } from "@/lib/community/enabled";

// Who is behind a request (docs/02, "Community (G6)"). Admins sign in with an email link; riders
// get a device account the first time they host, start a club or ask to join: Supabase's
// anonymous sign-in, made in the browser (so Supabase's per-address limit applies to each rider,
// not to our server). Keeping it with an email turns it into an ordinary account.
//
// Only route handlers and server actions read the rider's session: they can save refreshed
// cookies, which server components cannot. Pages render their public parts on the server and
// fetch the viewer's own part from the API.

/** Supabase with this request's session cookies (it may refresh them in actions and routes). */
export async function supabaseForRequest() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A server component cannot set cookies; the next action or route does.
        }
      },
    },
  });
}

export interface Account {
  id: string;
  /** True until the rider keeps the account with an email. */
  isAnonymous: boolean;
}

// Local test accounts (Playwright): an HMAC-signed cookie holding a random id, so tests never
// make Supabase users. Refused in production builds whatever the variable says.
const LOCAL_COOKIE = "triplan-rider-local";
const localAuth = () => COMMUNITY_LOCAL_AUTH && process.env.NODE_ENV !== "production";
const localSign = (id: string) =>
  createHmac("sha256", `community-local:${process.env.WRITE_LIMIT_SALT ?? "test"}`)
    .update(id)
    .digest("base64url");

function localAccountFrom(value: string | undefined): Account | null {
  const [id, mac] = (value ?? "").split(".");
  if (!id || !mac || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const given = Buffer.from(mac);
  const expected = Buffer.from(localSign(id));
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? { id, isAnonymous: true }
    : null;
}

/** The account behind this request, or null (no session, or community is off). */
export async function currentAccount(): Promise<Account | null> {
  if (!communityEnabled) return null;
  if (localAuth()) return localAccountFrom((await cookies()).get(LOCAL_COOKIE)?.value);
  const supabase = await supabaseForRequest();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  return user ? { id: user.id, isAnonymous: user.is_anonymous ?? false } : null;
}

/**
 * The account for a rider picking their nickname: their session's, or with local test accounts a
 * new one. Null with Supabase and no session (the browser signs in first).
 */
export async function accountForNewRider(): Promise<Account | null> {
  const current = await currentAccount();
  if (current || !localAuth()) return current;
  const id = randomUUID();
  (await cookies()).set(LOCAL_COOKIE, `${id}.${localSign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { id, isAnonymous: true };
}

/** Signs this browser out of its account (the account itself stays). */
export async function endSession(): Promise<void> {
  if (localAuth()) {
    (await cookies()).delete(LOCAL_COOKIE);
    return;
  }
  await (await supabaseForRequest())?.auth.signOut();
}

/** Deletes the Supabase account itself (needs SUPABASE_SECRET_KEY). False when it could not. */
export async function deleteAuthAccount(id: string): Promise<boolean> {
  if (localAuth()) return true;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return false;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) console.error("Deleting a rider's account failed", error.message);
  return !error;
}
