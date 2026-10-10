// Numbers that count up when they appear (docs/08 "Motion"): km, ride time, hairpins, climb.

/** How long a number takes to count up, ms. */
export const COUNT_UP_MS = 1200;

/** Fast at first, settling on the value (cubic ease-out). */
export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/**
 * The number to show `elapsedMs` into counting from `from` to `to`. Exactly `to` once done, so
 * the last frame shows the real value whatever the rounding on the way.
 */
export function countAt(from: number, to: number, elapsedMs: number, durationMs = COUNT_UP_MS) {
  if (elapsedMs >= durationMs) return to;
  return from + (to - from) * easeOutCubic(elapsedMs / durationMs);
}
