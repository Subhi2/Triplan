/**
 * A streak of light running along the bottom edge of its parent while something loads, like a
 * stretch of road lighting up end to end (docs/08 "Motion"). The parent must be `relative`.
 * Decoration only: the loading sections say "Finding routes…" and set aria-busy. Hidden for
 * "reduce motion" (src/app/globals.css).
 */
export function LoadStreak({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      aria-hidden
      data-load-streak
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
    >
      <span
        className="animate-streak block h-full w-[28%] rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--color-brand), var(--color-ghat), transparent)",
          boxShadow: "0 0 12px color-mix(in oklab, var(--color-brand) 60%, transparent)",
        }}
      />
    </span>
  );
}
