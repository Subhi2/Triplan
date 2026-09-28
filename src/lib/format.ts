/** Distances are stored in metres and shown as km with one decimal. */
export function formatKm(metres: number): string {
  // Round on whole hundreds of metres: toFixed alone mis-rounds values like 282.65.
  return `${(Math.round(metres / 100) / 10).toFixed(1)} km`;
}
