const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A "YYYY-MM-DD" day as "14 Jul 2025" for the done-ride share card; null when it is missing, not
 * a real day, or in the future (the address is the rider's to edit, so nothing else gets in).
 */
export function doneCardDate(value: string | null, today = new Date()): string | null {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  if (date.getTime() > today.getTime()) return null;
  return `${d} ${MONTHS[mo - 1]} ${y}`;
}
