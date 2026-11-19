import Link from "next/link";
import { UpdatesBadge } from "@/components/community/UpdatesBadge";
import { SITE_NAME } from "@/lib/site";
import { SiteMenu } from "./SiteMenu";
import { ThemeToggle } from "./ThemeToggle";
import { SITE_LINKS, type SiteSection } from "./siteLinks";

export { SITE_LINKS, type SiteSection } from "./siteLinks";

/**
 * The top bar of the content pages (rides, places, trips, about): the name and the site's links.
 * Phones keep Plan a ride and Near me in view and put the rest behind "Menu".
 */
export function SiteNav({ current }: { current?: SiteSection }) {
  return (
    <nav aria-label="Main" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex items-center gap-x-1">
        <Link
          href="/"
          className="font-display inline-flex min-h-11 items-center text-xl font-extrabold tracking-tight"
        >
          {SITE_NAME}
        </Link>
        {/* Phones have it in the Menu. */}
        <ThemeToggle className="hidden md:inline-flex" />
      </div>
      <div className="flex items-center gap-x-1">
        <ul className="flex flex-wrap items-center gap-x-1 text-sm font-bold">
          {SITE_LINKS.map((l) => (
            <li key={l.href} className={l.primary ? "" : "hidden md:block"}>
              <Link
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 hover:underline ${
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
        <SiteMenu
          className="md:hidden"
          current={current}
          links={SITE_LINKS.filter((l) => !l.primary)}
        />
      </div>
    </nav>
  );
}
