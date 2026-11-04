import Link from "next/link";
import { UpdatesBadge } from "@/components/community/UpdatesBadge";
import { communityEnabled } from "@/lib/community/enabled";
import { SITE_NAME } from "@/lib/site";

const LINKS = [
  { href: "/rides", label: "Famous rides" },
  { href: "/group-rides", label: "Group rides", community: true },
  { href: "/clubs", label: "Clubs", community: true },
  { href: "/nearby", label: "Near me" },
  { href: "/trips", label: "Your trips" },
  { href: "/about", label: "About" },
  { href: "/me", label: "Me", community: true },
] as const;

export type SiteSection = (typeof LINKS)[number]["href"];

/** The site's links, without clubs, group rides and Me when community is off. */
export const SITE_LINKS = LINKS.filter((l) => communityEnabled || !("community" in l));

/** The top bar of the content pages (rides, places, trips, about): the name and the main links. */
export function SiteNav({ current }: { current?: SiteSection }) {
  return (
    <nav aria-label="Main" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <Link
        href="/"
        className="font-display inline-flex min-h-11 items-center text-xl font-extrabold tracking-tight"
      >
        {SITE_NAME}
      </Link>
      <ul className="flex flex-wrap items-center gap-x-1 text-sm font-bold">
        {SITE_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg px-2 hover:underline ${
                current === l.href
                  ? "text-stone-900 dark:text-stone-100"
                  : "text-brand-dark dark:text-teal-300"
              }`}
            >
              {l.label}
              {l.href === "/me" && <UpdatesBadge />}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
