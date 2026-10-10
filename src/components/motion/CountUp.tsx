"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COUNT_UP_MS, countAt } from "@/lib/countUp";
import { formatDuration, formatKm, formatMetres } from "@/lib/format";

/** How the number reads: km (the value in km), a ride time in minutes, metres, or a count. */
export type CountUnit = "km" | "duration" | "metres" | "count";

const FORMAT: Record<CountUnit, (n: number) => string> = {
  km: (n) => formatKm(n * 1000),
  duration: formatDuration,
  metres: formatMetres,
  count: (n) => String(Math.round(n)),
};

// useLayoutEffect sets the starting number before the first paint; on the server it does nothing.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface Props {
  value: number;
  /** "337.6 km", "4 h 59 min", "1,662 m" or "24" (a name, so server pages can pass it). */
  unit?: CountUnit;
  /** Wait before counting, ms: numbers in a list count one after another. */
  delayMs?: number;
  /**
   * Rendered on the server (ride pages): only a number the reader has not seen yet counts up,
   * once it scrolls into view. One already on screen when the page loads stays as it is.
   */
  fromServer?: boolean;
  className?: string;
}

/**
 * A number that counts up from 0 when it appears, and on to the new value when it changes
 * (docs/08 "Motion"). Screen readers get the final value only; for "reduce motion" it is shown
 * straight away.
 */
export function CountUp({ value, unit = "count", delayMs = 0, fromServer, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = FORMAT[unit];
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  const started = useRef(false);

  useBrowserLayoutEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = (from: number) => {
      const begin = performance.now();
      const tick = (now: number) => {
        const n = countAt(from, value, now - begin, COUNT_UP_MS);
        current.current = n;
        setShown(n);
        if (n !== value) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    // A change after the first count goes on from the number on screen.
    if (started.current) {
      run(current.current);
      return () => cancelAnimationFrame(frame);
    }
    const onScreen = () => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    };
    if (fromServer && onScreen()) {
      started.current = true;
      return;
    }
    started.current = true;
    current.current = 0;
    setShown(0);
    const start = () => {
      timer = setTimeout(() => run(0), delayMs);
    };
    if (onScreen()) {
      start();
      return () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
      };
    }
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen.disconnect();
        start();
      }
    });
    seen.observe(el);
    return () => {
      seen.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    // Counting restarts only for a new value; the delay and fromServer count for the first only.
  }, [value]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden>{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
