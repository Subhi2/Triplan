// Pointer proximity ("crown", docs/08 "Motion"): items near the mouse lean towards or away from it
// with a smooth fall-off, so a list ripples as the pointer moves along it. Pure maths; the hook
// that measures the items and writes the CSS variables is src/components/motion/useCrown.ts.

export interface CrownConfig {
  /** "y": rows in a column; "x": cards in a row; "xy": cards in a grid. */
  axis: "x" | "y" | "xy";
  /** The pointer's reach in px: items further away are left alone. */
  radius: number;
  /** Most movement along the list's axis, px (rows nearest the pointer part for it). */
  lift?: number;
  /** Most movement across it, px (rows nudge sideways; grid cards lean). */
  shift?: number;
  /** Most growth, as a fraction (0.04 = 4 % bigger right under the pointer). */
  grow?: number;
  /** Most glow, 0–1 (the ring's opacity right under the pointer). */
  glow?: number;
  /** The rail's widest, px (place rows). */
  rail?: number;
  /** Grid cards lean towards the pointer instead of away from it. */
  toward?: boolean;
}

export interface CrownRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CrownStyle {
  x: number;
  y: number;
  scale: number;
  glow: number;
  rail: number;
}

/** 0 at the edge of the reach, 1 under the pointer, with an S-curve between (smoothstep). */
function smooth(influence: number): number {
  return influence * influence * (3 - 2 * influence);
}

/**
 * How an item at `rect` moves with the pointer at (`px`, `py`); null when out of reach.
 * In a column, rows above and below the pointer part a little (lift) and the nearest slide
 * sideways (shift); in a row the same across; in a grid, cards lean along the line to the pointer.
 */
export function crownStyle(
  rect: CrownRect,
  px: number,
  py: number,
  config: CrownConfig,
): CrownStyle | null {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let x = 0;
  let y = 0;
  let eased: number;

  if (config.axis === "xy") {
    const dx = cx - px;
    const dy = cy - py;
    const distance = Math.hypot(dx, dy);
    if (distance >= config.radius) return null;
    eased = smooth(1 - distance / config.radius);
    const unit = distance === 0 ? 0 : eased / distance;
    const lean = config.toward ? -1 : 1;
    x = dx * unit * (config.shift ?? 0) * lean;
    y = dy * unit * (config.lift ?? 0) * lean;
  } else {
    const delta = config.axis === "x" ? cx - px : cy - py;
    const distance = delta / config.radius;
    if (Math.abs(distance) >= 1) return null;
    const influence = 1 - Math.abs(distance);
    eased = smooth(influence);
    const along = distance * influence * (config.lift ?? 0);
    const across = eased * (config.shift ?? 0);
    if (config.axis === "x") {
      x = distance * influence * (config.shift ?? 0);
      y = -eased * (config.lift ?? 0);
    } else {
      x = across;
      y = along;
    }
  }

  return {
    x,
    y,
    scale: 1 + eased * (config.grow ?? 0),
    glow: eased * (config.glow ?? 0),
    rail: eased * (config.rail ?? 0),
  };
}
