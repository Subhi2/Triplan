// Months are stored as integers 1–12.
export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const name = (m: number) => MONTH_SHORT[m - 1]!;
const next = (m: number) => (m % 12) + 1;
const prev = (m: number) => ((m + 10) % 12) + 1;

/** [10, 11, 12, 1, 2] -> "Oct–Feb"; [1, 3] -> "Jan, Mar"; all twelve -> "All year". */
export function formatMonthRanges(months: number[]): string {
  const set = new Set(months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12));
  if (set.size === 0) return "";
  if (set.size === 12) return "All year";

  const runs: [number, number][] = [];
  for (const start of [...set].sort((a, b) => a - b)) {
    if (set.has(prev(start))) continue; // not the start of a run
    let end = start;
    while (set.has(next(end))) end = next(end);
    runs.push([start, end]);
  }
  return runs.map(([s, e]) => (s === e ? name(s) : `${name(s)}–${name(e)}`)).join(", ");
}

export function bestTimeSummary(bestMonths: number[], estimated = false): string {
  const ranges = formatMonthRanges(bestMonths);
  if (!ranges) return "Best time not known yet";
  return estimated ? `Usually best ${ranges}` : `Best ${ranges}`;
}

/** Whether this month is one of a place's best months (1–12). */
export function isInSeason(bestMonths: number[], month: number): boolean {
  return bestMonths.includes(month);
}

/** The month (1–12) in a time zone, e.g. "Asia/Kolkata" on the server. */
export function monthIn(timeZone: string, date: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-IN", { month: "numeric", timeZone }).format(date));
}
