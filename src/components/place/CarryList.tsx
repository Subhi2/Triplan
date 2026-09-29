import { formatMonthRanges } from "@/lib/months";
import { carryBySeason, type CarryEntry } from "@/lib/placeDetail";
import { NotKnown } from "./NotKnown";

interface Props {
  carry: CarryEntry[];
  /** The current month (1–12): items needed now are listed first. */
  month: number;
}

/** Items to carry, the ones needed this month first; seasonal items say when they are needed. */
export function CarryList({ carry, month }: Props) {
  if (carry.length === 0) return <NotKnown />;
  return (
    <ul className="space-y-1 text-sm" aria-label="Items to carry">
      {carryBySeason(carry, month).map((c) => (
        <li key={c.slug} className={c.inSeason ? undefined : "text-stone-500 dark:text-stone-400"}>
          <span className={c.inSeason ? "font-medium" : undefined}>{c.name}</span>
          {c.months.length > 0 && (
            <span className="text-stone-500 dark:text-stone-400">
              {" "}
              · {formatMonthRanges(c.months)}
              {c.inSeason ? "" : " only"}
            </span>
          )}
          {c.reason && <span className="block text-xs">{c.reason}</span>}
        </li>
      ))}
    </ul>
  );
}
