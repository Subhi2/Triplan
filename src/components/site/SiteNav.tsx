import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

const LINKS = [
  { href: "/rides", label: "Famous rides" },
  { href: "/nearby", label: "Near me" },
  { href: "/trips", label: "Your trips" },
  { href: "/about", label: "About" },
] as const;

export type SiteSection = (typeof LINKS)[number]["href"];

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
        {LINKS.map((l) => (
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
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
