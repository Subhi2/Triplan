import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/server/auth/admin";

// A new admin's first link is a sign-up confirmation; later ones are magic links.
const OTP_TYPES = new Set<EmailOtpType>(["magiclink", "email", "signup"]);

/**
 * The end of an admin's email link, then on to `next` (only paths on this site):
 * - ?code=…: Supabase's default link, opened in the browser that asked for it;
 * - ?token_hash=…&type=magiclink: works on any device, with the email template set to
 *   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink` (README).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/admin";
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  const supabase = await supabaseForRequest();
  if (supabase) {
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : tokenHash && type && OTP_TYPES.has(type)
        ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        : { error: new Error("No code") };
    if (!error) return NextResponse.redirect(new URL(target, url.origin));
  }
  return NextResponse.redirect(new URL("/admin?link=failed", url.origin));
}
