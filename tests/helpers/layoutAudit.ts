import type { Page } from "@playwright/test";

/**
 * Layout faults on the page as it stands, found in the browser (docs/08-design.md, "Layers and
 * panels"). Each entry names the element and what is wrong; an empty list is a clean page.
 *
 * - `overflowX`: the page scrolls sideways.
 * - `wide`: an element sticks out past the screen's sides, with no scrolling box around it.
 * - `covered`: a control in view whose centre another element would take the tap from. Meant
 *   are an open menu or dialog over the page, and a sticky or fixed bar over content that can be
 *   scrolled clear of it (rows under the Google Maps bar, the page under the phone action bar).
 *   Anything else is a fault: the Menu once opened under the phone sheet, for good.
 * - `cut`: a control in view whose box runs past the bottom of a box that clips it without
 *   scrolling (the Google Maps bar once hung below the laptop's places column).
 * - `small`: on phones (below 768 px), a control smaller than 40 px either way. Links inside a
 *   sentence are left out: they are text, and the line around them is the target.
 *
 * The map's own controls and markers are left to the map libraries.
 */
export interface LayoutFaults {
  overflowX: number;
  wide: string[];
  covered: string[];
  cut: string[];
  small: string[];
}

export async function layoutFaults(page: Page): Promise<LayoutFaults> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const name = (el: Element) => {
      const text = (
        el.getAttribute("aria-label") ??
        (el as HTMLElement).innerText ??
        el.getAttribute("placeholder") ??
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      return `<${el.tagName.toLowerCase()}> "${text}"`;
    };
    const shown = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") return false;
      // Visually hidden for screen readers only (dnd-kit's live region, .sr-only).
      if (s.clip === "rect(0px, 0px, 0px, 0px)" || s.clipPath === "inset(50%)") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const skipped = (el: Element) =>
      !!el.closest(
        ".maplibregl-map, .gm-style, canvas, nextjs-portal, .sr-only, [inert], [aria-hidden=true]",
      );
    const scroller = (el: Element): Element | null => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
      }
      return null;
    };
    /** The sticky or fixed bar an element belongs to, if any. */
    const bar = (el: Element): Element | null => {
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        if (/^(sticky|fixed)$/.test(getComputedStyle(p).position)) return p;
      }
      return null;
    };
    /**
     * Whether the rider can scroll `el` clear of `over` (a bar at the top or the foot of the
     * screen or panel): the page leaves room for that. Without room, the bar hides it for good.
     */
    const canScrollClear = (el: Element, over: Element) => {
      const box = scroller(el) ?? document.scrollingElement!;
      const r = el.getBoundingClientRect();
      const b = over.getBoundingClientRect();
      const atFoot = b.top > r.top;
      const room = atFoot ? box.scrollHeight - box.scrollTop - box.clientHeight : box.scrollTop;
      const overlap = atFoot ? r.bottom - b.top : b.bottom - r.top;
      return room >= overlap;
    };
    const topLayer = "dialog:modal, :popover-open";
    const controls = "a[href], button, input, select, textarea, summary, [role=button]";
    const out = {
      overflowX: document.documentElement.scrollWidth - vw,
      wide: [] as string[],
      covered: [] as string[],
      cut: [] as string[],
      small: [] as string[],
    };

    for (const el of document.body.querySelectorAll("*")) {
      if (!shown(el) || skipped(el)) continue;
      const r = el.getBoundingClientRect();

      if (r.right > vw + 0.5 || r.left < -0.5) {
        let held = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== "visible") {
            held = true;
            break;
          }
        }
        if (!held) out.wide.push(`${name(el)} spans ${Math.round(r.left)}–${Math.round(r.right)}`);
      }

      if (!el.matches(controls)) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const inView = x > 0 && x < vw && y > 0 && y < vh;

      if (inView) {
        const top = document.elementFromPoint(x, y);
        if (top && !el.contains(top) && !top.contains(el) && !top.closest("nextjs-portal")) {
          // An open menu or dialog covers the page under it on purpose.
          const underOpenLayer = !!top.closest(topLayer) && !el.closest(topLayer);
          // Rows scroll under a sticky or fixed bar, as long as they can be scrolled clear.
          const over = bar(top);
          const meant =
            underOpenLayer || (!!over && !over.contains(el) && canScrollClear(el, over));
          const label = top.closest("label");
          if (!meant && !(label && label.contains(el)))
            out.covered.push(`${name(el)} under ${name(top)}`);
        }
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (/(auto|scroll)/.test(s.overflowY)) break;
          if (s.overflowY === "hidden" || s.overflowY === "clip") {
            const box = p.getBoundingClientRect();
            if (r.bottom > box.bottom + 1 && r.top < box.bottom)
              out.cut.push(
                `${name(el)} ends ${Math.round(r.bottom - box.bottom)} px below its box`,
              );
            break;
          }
        }
      }

      const inSentence = el.tagName === "A" && !!el.closest("p, li > span, figcaption");
      if (vw < 768 && !inSentence && el.tagName !== "INPUT" && (r.width < 40 || r.height < 40))
        out.small.push(`${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }

    const unique = (list: string[]) => [...new Set(list)];
    return {
      overflowX: out.overflowX,
      wide: unique(out.wide),
      covered: unique(out.covered),
      cut: unique(out.cut),
      small: unique(out.small),
    };
  });
}
