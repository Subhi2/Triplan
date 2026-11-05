import { finishEmailLink } from "@/server/auth/emailLink";

/**
 * The end of a rider's email link (keeping a device account, or signing in to a kept one on
 * another device), then on to /me. Its address must be in Supabase's Redirect URLs (README).
 */
export async function GET(request: Request) {
  return finishEmailLink(request, "/me");
}
