"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { UpdatesCount, useUpdatesCount } from "@/components/community/UpdatesBadge";
import { SITE_LINKS, type SiteLink, type SiteSection } from "./siteLinks";
import { MoonIcon, SunIcon, useTheme } from "./ThemeToggle";
import { useLang, useT } from "@/components/i18n/LangProvider";
import { DRAFT_LANGS, LANG_COOKIE, LANG_NAMES, LANGS, type Lang } from "@/lib/i18n";

/** Keeps the chosen language for a year and shows the page in it (G12). */
function chooseLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
  window.location.reload();
}

/**
 * The site's screens behind one "Menu" button, for headers with no room for the links (phones,
 * the planner and Near me). Same links and order as the content pages' bar (`siteLinks.ts`).
 *
 * The list is a native popover: it opens in the browser's top layer, above the phone sheet and
 * the map whatever their z-index, and is never clipped by a scrolling panel. The browser closes
 * it on Escape or a tap outside and gives focus back to the button; it also closes on a link,
 * and when the page scrolls or resizes (it is placed under the button once, as it opens).
 */
export function SiteMenu({
  className = "",
  current,
  links = SITE_LINKS,
  leads = [],
  showTheme = true,
}: {
  className?: string;
  current?: SiteSection;
  links?: readonly SiteLink[];
  /** Actions listed first, as full page loads (the planner's "New trip", its "Near me"). */
  leads?: readonly { href: string; label: string }[];
  /** The light/dark entry at the end of the list; off where a toggle button is in view. */
  showTheme?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const lang = useLang();
  const t = useT();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  // With "Me" in the list, its count shows on the button too: a rider on a phone sees a host's
  // decision without opening the Menu.
  const updates = useUpdatesCount(links.some((l) => l.href === "/me"));

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      // Only a scroll that moves the button (the page, or a panel holding it) leaves the list
      // adrift. Others keep it open: the list's own scrolling on a short screen, and boxes
      // elsewhere that scroll by themselves (Near me's list as it loads closed it at once).
      if (e.type === "scroll") {
        const moved =
          e.target === document || (e.target instanceof Node && e.target.contains(button.current));
        if (!moved) return;
      }
      menu.current?.hidePopover();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, { capture: true });
    };
  }, [open]);

  /** Right-aligned under the button, and no taller than the screen below it. */
  function placeUnderButton(list: HTMLElement) {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const top = r.bottom + 4;
    list.style.top = `${top}px`;
    list.style.right = `${Math.max(8, document.documentElement.clientWidth - r.right)}px`;
    list.style.maxHeight = `calc(100dvh - ${top + 8}px)`;
  }

  const close = () => menu.current?.hidePopover();

  return (
    <div className={className}>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        className="text-brand-dark inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-bold hover:underline dark:text-teal-300"
      >
        Menu
        <UpdatesCount count={updates} />
      </button>
      <ul
        ref={menu}
        id={id}
        popover="auto"
        // Placed before it shows, so it never flashes at the browser's default spot (centre).
        onBeforeToggle={(e) => {
          if (e.newState === "open") placeUnderButton(e.currentTarget);
        }}
        onToggle={(e) => setOpen(e.newState === "open")}
        // The browser's popover style centres it with a border; this replaces it.
        className="fixed inset-auto m-0 min-w-44 overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-(--surface) py-1 text-sm font-bold text-(--foreground) shadow-lg dark:border-stone-700"
      >
        {leads.map((l, i) => (
          <li
            key={l.href}
            className={
              i === leads.length - 1
                ? "mb-1 border-b border-stone-200 pb-1 dark:border-stone-700"
                : ""
            }
          >
            {/* A plain link: a full load starts the planner empty, with no state carried over. */}
            <a
              href={l.href}
              className="text-brand-dark flex min-h-11 items-center px-4 hover:bg-stone-100 dark:text-teal-300 dark:hover:bg-stone-800"
            >
              {l.label}
            </a>
          </li>
        ))}
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              onClick={close}
              className={`flex min-h-11 items-center px-4 hover:bg-stone-100 dark:hover:bg-stone-800 ${
                current === l.href ? "text-stone-900 dark:text-stone-100" : ""
              }`}
            >
              {l.label}
              {l.href === "/me" && <UpdatesCount count={updates} />}
            </Link>
          </li>
        ))}
        {showTheme && (
          <li className="border-t border-stone-200 dark:border-stone-700">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex min-h-11 w-full items-center gap-2 px-4 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              {theme === "dark" ? t("menu.lightMode") : t("menu.darkMode")}
            </button>
          </li>
        )}
        <li className="border-t border-stone-200 px-4 pt-2 pb-1 dark:border-stone-700">
          <p className="text-xs font-bold text-stone-600 dark:text-stone-400">
            {t("menu.language")}
          </p>
          <ul className="flex flex-wrap gap-1 py-1" aria-label={t("menu.language")}>
            {LANGS.map((l) => (
              <li key={l}>
                <button
                  type="button"
                  lang={l}
                  aria-pressed={l === lang}
                  onClick={() => chooseLang(l)}
                  className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm md:min-h-8 ${
                    l === lang
                      ? "bg-stone-900 font-bold text-white dark:bg-stone-100 dark:text-stone-900"
                      : "hover:bg-stone-100 dark:hover:bg-stone-800"
                  }`}
                >
                  {LANG_NAMES[l]}
                </button>
              </li>
            ))}
          </ul>
          {DRAFT_LANGS.has(lang) && (
            <p className="pb-1 text-xs text-stone-600 dark:text-stone-400">{t("menu.draft")}</p>
          )}
        </li>
      </ul>
    </div>
  );
}
