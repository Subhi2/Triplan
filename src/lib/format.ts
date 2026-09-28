/** Distances are stored in metres and shown as km with one decimal. */
export function formatKm(metres: number): string {
  // Round on whole hundreds of metres: toFixed alone mis-rounds values like 282.65.
  return `${(Math.round(metres / 100) / 10).toFixed(1)} km`;
}

/** "45 min", "4 h 5 min". */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
