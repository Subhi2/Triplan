"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const LINKS = [
  { href: "/rides", label: "Famous rides" },
  { href: "/trips", label: "Your trips" },
  { href: "/about", label: "About" },
] as const;

/**
 * The site's other screens behind one "More" button, for headers with no room for the links
 * (phones, and the planner once a trip is loaded). Closes on Escape, on a tap outside or on a link,
 * and gives focus back to the button.
 */
export function SiteMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
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
        More
      </button>
      {open && (
        <ul
          id={id}
          className="absolute right-0 z-30 mt-1 min-w-44 rounded-xl border border-stone-200 bg-(--surface) py-1 text-sm font-bold shadow-lg dark:border-stone-700"
        >
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center px-4 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
