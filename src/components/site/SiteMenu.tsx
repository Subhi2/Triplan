"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { SITE_LINKS, type SiteLink, type SiteSection } from "./siteLinks";
import { MoonIcon, SunIcon, useTheme } from "./ThemeToggle";

/**
 * The site's screens behind one "Menu" button, for headers with no room for the links (phones,
 * the planner and Near me). Same links and order as the content pages' bar (`siteLinks.ts`).
 * Closes on Escape, on a tap outside or on a link, and gives focus back to the button.
 */
export function SiteMenu({
  className = "",
  current,
  links = SITE_LINKS,
  lead,
}: {
  className?: string;
  current?: SiteSection;
  links?: readonly SiteLink[];
  /** An action listed first, as a full page load (the planner's "New trip"). */
  lead?: { href: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="text-brand-dark inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-bold hover:underline dark:text-teal-300"
      >
        Menu
      </button>
      {open && (
        <ul
          id={id}
          className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl border border-stone-200 bg-(--surface) py-1 text-sm font-bold shadow-lg dark:border-stone-700"
        >
          {lead && (
            <li className="border-b border-stone-200 pb-1 dark:border-stone-700">
              {/* A plain link: a full load starts the planner empty, with no state carried over. */}
              <a
                href={lead.href}
                className="text-brand-dark flex min-h-11 items-center px-4 hover:bg-stone-100 dark:text-teal-300 dark:hover:bg-stone-800"
              >
                {lead.label}
              </a>
            </li>
          )}
          {links.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current === l.href ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-11 items-center px-4 hover:bg-stone-100 dark:hover:bg-stone-800 ${
                  current === l.href ? "text-stone-900 dark:text-stone-100" : ""
                }`}
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li className="border-t border-stone-200 dark:border-stone-700">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex min-h-11 w-full items-center gap-2 px-4 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
