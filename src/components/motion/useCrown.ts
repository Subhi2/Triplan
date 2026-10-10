"use client";

import { useEffect, type RefObject } from "react";
import { crownStyle, type CrownConfig } from "@/lib/crown";

const VARS = ["--crown-x", "--crown-y", "--crown-scale", "--crown-glow", "--crown-rail"];

/** A mouse (or trackpad) and motion allowed: never on touch, never for "reduce motion". */
function crownAllowed(): boolean {
  return (
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Pointer proximity for the items (`selector`) inside `container`: as the mouse moves over it,
 * each item within reach gets --crown-x/y/scale/glow/rail, which the `crown`, `crown-glow` and
 * `crown-rail` classes turn into movement (src/app/globals.css). Measures all items, then writes
 * all of them, once per frame.
 */
export function useCrown(
  container: RefObject<HTMLElement | null>,
  selector: string,
  config: CrownConfig,
) {
  const { axis, radius, lift, shift, grow, glow, rail, toward } = config;

  useEffect(() => {
    const root = container.current;
    if (!root || !crownAllowed()) return;
    const cfg: CrownConfig = { axis, radius, lift, shift, grow, glow, rail, toward };
    // The offset each item has now, so its resting place is measured, not where it leans to.
    const moved = new WeakMap<HTMLElement, { x: number; y: number }>();
    let frame = 0;
    let px = 0;
    let py = 0;
    let inside = false;

    const clear = (el: HTMLElement) => {
      for (const v of VARS) el.style.removeProperty(v);
      moved.delete(el);
    };

    const paint = () => {
      frame = 0;
      const items = [...root.querySelectorAll<HTMLElement>(selector)];
      const styles = items.map((el) => {
        const rect = el.getBoundingClientRect();
        const off = moved.get(el) ?? { x: 0, y: 0 };
        return crownStyle(
          {
            left: rect.left - off.x,
            top: rect.top - off.y,
            width: rect.width,
            height: rect.height,
          },
          px,
          py,
          cfg,
        );
      });
      items.forEach((el, i) => {
        const s = styles[i];
        if (!s) {
          if (moved.has(el)) clear(el);
          return;
        }
        el.style.setProperty("--crown-x", `${s.x.toFixed(2)}px`);
        el.style.setProperty("--crown-y", `${s.y.toFixed(2)}px`);
        if (grow) el.style.setProperty("--crown-scale", s.scale.toFixed(3));
        if (glow) el.style.setProperty("--crown-glow", s.glow.toFixed(3));
        if (rail) el.style.setProperty("--crown-rail", `${s.rail.toFixed(2)}px`);
        moved.set(el, { x: s.x, y: s.y });
      });
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      inside = true;
      px = e.clientX;
      py = e.clientY;
      if (frame === 0) frame = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      inside = false;
      cancelAnimationFrame(frame);
      frame = 0;
      root.querySelectorAll<HTMLElement>(selector).forEach(clear);
    };
    // The list scrolls under a still pointer: other items are near it now.
    const onScroll = () => {
      if (inside && frame === 0) frame = requestAnimationFrame(paint);
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll, { capture: true });
      onLeave();
    };
  }, [container, selector, axis, radius, lift, shift, grow, glow, rail, toward]);
}
