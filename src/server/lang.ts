import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang, type Lang } from "@/lib/i18n";

/** The rider's language from the `lang` cookie (G12); only for pages that render per request. */
export async function langFromCookie(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}
