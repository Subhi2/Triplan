import { finishEmailLink } from "@/server/auth/emailLink";

/** The end of an admin's email link, then on to /admin (src/server/auth/emailLink.ts). */
export async function GET(request: Request) {
  return finishEmailLink(request, "/admin");
}
