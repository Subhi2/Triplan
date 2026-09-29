import { formatMonthRanges, MONTH_SHORT } from "@/lib/months";
import { monthRatings, type MonthRating, type PlaceGuide } from "@/lib/placeDetail";
import { NotKnown } from "./NotKnown";

const RATING_STYLE: Record<NonNullable<MonthRating>, { label: string; cell: string }> = {
  best: { label: "Best", cell: "bg-brand text-white" },
  ok: { label: "OK", cell: "bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50" },
  avoid: { label: "Avoid", cell: "bg-rose-200 text-rose-950 dark:bg-rose-900 dark:text-rose-50" },
};
const UNKNOWN_CELL = "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400";

interface Props {
  guide: Pick<PlaceGuide, "bestMonths" | "okMonths" | "avoidMonths"> | null;
  /** The current month (1–12), outlined. */
  month: number;
}

/** Twelve cells, January to December, marked best / ok / avoid, with the ranges in words. */
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

  return (
    <div className="space-y-1.5">
      <ol className="grid grid-cols-12 gap-0.5" aria-label="Months to visit">
        {ratings.map((r, i) => {
          const name = MONTH_SHORT[i]!;
          const label = r ? RATING_STYLE[r].label : "Not known";
          const current = i + 1 === month;
          return (
            <li
              key={name}
              title={`${name}: ${label}`}
              className={`rounded py-1 text-center text-[11px] leading-tight font-semibold ${
                r ? RATING_STYLE[r].cell : UNKNOWN_CELL
              } ${current ? "ring-2 ring-stone-900 ring-offset-1 dark:ring-stone-100 dark:ring-offset-stone-950" : ""}`}
            >
              <span aria-hidden>{name[0]}</span>
              <span className="sr-only">
                {name}: {label}
                {current ? " (this month)" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-sm">{summary}</p>
    </div>
  );
}
