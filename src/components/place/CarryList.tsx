import { formatMonthRanges } from "@/lib/months";
import { carryBySeason, type CarryEntry } from "@/lib/placeDetail";
import { NotKnown } from "./NotKnown";

interface Props {
  carry: CarryEntry[];
  /** The current month (1–12): items needed now are listed first. */
  month: number;
}

/**
 * Items to carry as chips, the ones needed this month first and highlighted; seasonal items say
 * when they are needed.
 */
export function CarryList({ carry, month }: Props) {
  if (carry.length === 0) return <NotKnown />;
  return (
    <ul className="flex flex-wrap gap-2 text-sm" aria-label="Items to carry">
      {carryBySeason(carry, month).map((c) => {
        const seasonal = c.months.length > 0;
        return (
          <li
            key={c.slug}
            title={c.reason ?? undefined}
            className={`rounded-full px-3 py-1.5 ${
              c.inSeason && seasonal
                ? "bg-marigold-tint text-ghat-dark font-bold dark:bg-orange-950 dark:text-orange-200"
                : c.inSeason
                  ? "border border-stone-200 bg-(--surface) dark:border-stone-700"
                  : "border border-stone-200 bg-(--surface) text-stone-600 dark:border-stone-700 dark:text-stone-400"
            }`}
          >
            {c.name}
            {seasonal && (
              <span className={c.inSeason ? "font-normal" : undefined}>
                {" "}
                · {c.inSeason ? "needed now" : `${formatMonthRanges(c.months)} only`}
              </span>
            )}
            {c.reason && <span className="sr-only">. {c.reason}</span>}
          </li>
        );
      })}
    </ul>
  );
}
