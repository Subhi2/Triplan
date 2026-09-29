import { formatMonthRanges, MONTH_SHORT } from "@/lib/months";
import { monthRatings, type MonthRating, type PlaceGuide } from "@/lib/placeDetail";
import { NotKnown } from "./NotKnown";

// A bar per month, tallest in the best months, so the good season reads at a glance
// (docs/08-design.md). Colours differ in lightness too, not only in hue.
const RATING_STYLE: Record<
  NonNullable<MonthRating>,
  { label: string; bar: string; now: string }
> = {
  best: { label: "Best", bar: "h-10 bg-brand", now: "Best time: now" },
  ok: { label: "OK", bar: "h-7 bg-brand-soft dark:bg-teal-700", now: "OK now" },
  avoid: { label: "Avoid", bar: "h-3 bg-ghat", now: "Better avoided now" },
};
const UNKNOWN_BAR = "h-2 bg-stone-200 dark:bg-stone-700";

const MONTH_LONG = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString("en-IN", { month: "long" }),
);

interface Props {
  guide: Pick<PlaceGuide, "bestMonths" | "okMonths" | "avoidMonths"> | null;
  /** The current month (1–12), outlined. */
  month: number;
}

/** Twelve bars, January to December, marked best / ok / avoid, with the ranges in words. */
export function MonthStrip({ guide, month }: Props) {
  const ratings = monthRatings(guide);
  if (ratings.every((r) => r === null)) return <NotKnown />;

  const summary = (["best", "ok", "avoid"] as const)
    .map((r) => {
      const months = ratings.flatMap((x, i) => (x === r ? [i + 1] : []));
      return months.length > 0 ? `${RATING_STYLE[r].label} ${formatMonthRanges(months)}` : null;
    })
    .filter(Boolean)
    .join(" · ");
  const nowRating = ratings[month - 1] ?? null;

  return (
    <div className="space-y-2">
      {nowRating && (
        <p
          className={`text-sm font-bold ${
            nowRating === "avoid"
              ? "text-ghat-dark dark:text-orange-300"
              : "text-brand-dark dark:text-teal-300"
          }`}
        >
          {RATING_STYLE[nowRating].now}, in {MONTH_LONG[month - 1]}
        </p>
      )}
      <ol className="grid grid-cols-12 items-end gap-1" aria-label="Months to visit">
        {ratings.map((r, i) => {
          const name = MONTH_SHORT[i]!;
          const label = r ? RATING_STYLE[r].label : "Not known";
          const current = i + 1 === month;
          return (
            <li key={name} title={`${name}: ${label}`} className="flex flex-col items-center gap-1">
              <span
                aria-hidden
                className={`animate-grow-up block w-full origin-bottom rounded-md ${
                  r ? RATING_STYLE[r].bar : UNKNOWN_BAR
                } ${current ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-(--surface) dark:ring-stone-100" : ""}`}
                style={{ animationDelay: `${120 + i * 30}ms` }}
              />
              <span
                aria-hidden
                className={`font-mono text-[11px] ${
                  current ? "font-semibold" : "text-stone-600 dark:text-stone-400"
                }`}
              >
                {name[0]}
              </span>
              <span className="sr-only">
                {name}: {label}
                {current ? " (this month)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-stone-600 dark:text-stone-400">{summary}</p>
    </div>
  );
}
