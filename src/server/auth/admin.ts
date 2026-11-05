import { supabaseForRequest } from "./session";

export { supabaseForRequest };

// Admins (docs/02, "Reviews, photos and road reports") sign in with a Supabase Auth email link
// (riders' device accounts are in session.ts). Who is an admin comes from ADMIN_EMAILS (comma-separated), set in the
// deployment, never in the code.

/** The admin addresses, lower case. Empty when ADMIN_EMAILS is not set: nobody is an admin. */
export function adminEmails(env = process.env.ADMIN_EMAILS): string[] {
  return (env ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isAdminEmail(email: string | null | undefined, env?: string): boolean {
  return Boolean(email) && adminEmails(env).includes(email!.trim().toLowerCase());
}

/** The signed-in admin's email, or null (not signed in, not confirmed, or not an admin). */
export async function currentAdmin(): Promise<string | null> {
  const supabase = await supabaseForRequest();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email || !user.email_confirmed_at) return null;
  return isAdminEmail(user.email) ? user.email.toLowerCase() : null;
}
