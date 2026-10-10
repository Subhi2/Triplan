/**
 * A short side-to-side shake: the field's way of saying "nothing found" (docs/08 "Motion").
 * Web Animations, so it replays on every call; nothing for "reduce motion".
 */
export function nudge(el: HTMLElement | null) {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { translate: "0 0" },
      { translate: "-5px 0", offset: 0.18 },
      { translate: "5px 0", offset: 0.36 },
      { translate: "-3px 0", offset: 0.54 },
      { translate: "3px 0", offset: 0.72 },
      { translate: "0 0" },
    ],
    { duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
  );
}
