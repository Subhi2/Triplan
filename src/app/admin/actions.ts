"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/site";
import { currentAdmin, isAdminEmail, supabaseForRequest } from "@/server/auth/admin";
import { takeDownClub } from "@/server/services/clubService";
import { takeDownRide } from "@/server/services/groupRideService";
import { moderatePost } from "@/server/services/riderPostService";
import { allowRequestOrOpen } from "@/server/services/writeLimit";

const SIGN_IN_LIMIT = { scope: "admin-link", limit: 5, windowS: 3600 };

/**
 * Where the email link returns to: the public address. Only in development the request's own host
 * (any local port): in production a forged Host header must never get into an admin's email.
 */
function linkOrigin(h: Headers): string {
  const host = h.get("host");
  if (process.env.NODE_ENV === "development" && host && /^localhost(:\d+)?$/.test(host)) {
    return `http://${host}`;
  }
  return siteUrl();
}

/**
 * Sends an email sign-in link, only to an address in ADMIN_EMAILS. The page says the same either
 * way, so it does not tell who is an admin.
 */
export async function sendSignInLink(form: FormData) {
  const email = z.email().safeParse(String(form.get("email") ?? "").trim());
  const h = await headers();
  // Server actions have no Request: rebuild enough of one for the per-visitor limit.
  const request = new Request(siteUrl(), {
    headers: { "x-forwarded-for": h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "" },
  });
  if (
    email.success &&
    isAdminEmail(email.data) &&
    (await allowRequestOrOpen(request, SIGN_IN_LIMIT))
  ) {
    const supabase = await supabaseForRequest();
    const { error } =
      (await supabase?.auth.signInWithOtp({
        email: email.data,
        // No query string: Supabase matches it against its Redirect URLs exactly, and falls
        // back to the Site URL otherwise. The callback goes on to /admin by default.
        options: { emailRedirectTo: `${linkOrigin(h)}/auth/callback` },
      })) ?? {};
    if (error) console.error("Admin sign-in link failed", error.message);
  }
  redirect("/admin?sent=1");
}

const moderateSchema = z.object({
  kind: z.enum(["review", "photo", "report"]),
  id: z.uuid(),
  decision: z.enum(["verified", "rejected"]),
});

/** Approves or rejects one waiting post, and rebuilds the place's page. Admins only. */
export async function moderate(form: FormData) {
  if (!(await currentAdmin())) redirect("/admin");
  const parsed = moderateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { kind, id, decision } = parsed.data;
  const slug = await moderatePost(kind, id, decision);
  if (slug) revalidatePath(`/place/${slug}`);
  revalidatePath("/admin");
}

/**
 * Removes a club or group ride by its link, for a legal takedown (docs/02, "Community (G6)").
 * Clubs and rides are not checked before they go up; this is the only thing admins do to them.
 */
export async function takeDown(form: FormData) {
  if (!(await currentAdmin())) redirect("/admin");
  const raw = String(form.get("link") ?? "").trim();
  let path = raw;
  try {
    path = new URL(raw, siteUrl()).pathname;
  } catch {
    // Not a link: tried as a path below.
  }
  const club = /^\/clubs\/([a-z0-9][a-z0-9-]{1,70})\/?$/.exec(path);
  const ride = /^\/group-rides\/([0-9a-f-]{36})\/?$/.exec(path);
  const done = club
    ? await takeDownClub(club[1]!)
    : ride && z.uuid().safeParse(ride[1]).success
      ? await takeDownRide(ride[1]!)
      : false;
  redirect(`/admin?takedown=${done ? "done" : "none"}`);
}

export async function signOut() {
  const supabase = await supabaseForRequest();
  await supabase?.auth.signOut();
  redirect("/admin");
}
