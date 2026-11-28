"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteUrl } from "@/lib/site";
import { currentAdmin, isAdminEmail, supabaseForRequest } from "@/server/auth/admin";
import { takeDownClub } from "@/server/services/clubService";
import { takeDownRide } from "@/server/services/groupRideService";
import { moderateFlag, moderatePost, settleTakedown } from "@/server/services/riderPostService";
import { hideRidePhoto } from "@/server/services/ridePhotoAdmin";
import { decidePlace } from "@/server/services/contributeService";
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

const flagSchema = z.object({ id: z.uuid(), action: z.enum(["hide", "done", "dismiss"]) });

/**
 * Acts on a rider's "Something's wrong here" flag: hide the place, say it was fixed, or dismiss
 * the flag; the place's page is rebuilt. Admins only.
 */
export async function decideFlag(form: FormData) {
  if (!(await currentAdmin())) redirect("/admin");
  const parsed = flagSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const slug = await moderateFlag(parsed.data.id, parsed.data.action);
  if (slug) revalidatePath(`/place/${slug}`);
  revalidatePath("/admin");
}

const takedownRequestSchema = z.object({ id: z.uuid(), action: z.enum(["done", "dismiss"]) });

/** Settles a takedown request from /terms once the content is down, or nothing needed doing. */
export async function decideTakedown(form: FormData) {
  if (!(await currentAdmin())) redirect("/admin");
  const parsed = takedownRequestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  await settleTakedown(parsed.data.id, parsed.data.action);
  revalidatePath("/admin");
}

const placeSchema = z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]) });

/** Approves a rider's new place (it shows on routes from now on) or rejects it. Admins only. */
export async function decideNewPlace(form: FormData) {
  if (!(await currentAdmin())) redirect("/admin");
  const parsed = placeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const slug = await decidePlace(parsed.data.id, parsed.data.decision);
  if (slug && parsed.data.decision === "approve") revalidatePath(`/place/${slug}`);
  revalidatePath("/admin");
}

const hidePhotoSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  file: z.string().startsWith("File:").max(300),
});

/** Hides a ride photo that does not show its road; the photo import skips it from then on. */
export async function hidePhoto(form: FormData) {
  if (!(await currentAdmin())) redirect("/admin");
  const parsed = hidePhotoSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  if (await hideRidePhoto(parsed.data.slug, parsed.data.file)) {
    revalidatePath(`/rides/${parsed.data.slug}`);
    revalidatePath("/rides");
    revalidatePath("/bucket-list");
  }
  redirect(`/admin?ride=${parsed.data.slug}#ride-photos`);
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
