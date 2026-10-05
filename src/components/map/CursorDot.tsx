/**
 * Where the elevation chart's scrubber is on the route: an ink dot with a white ring. Used by both
 * maps; it never takes taps, so the map underneath stays usable.
 */
export function CursorDot() {
  return (
    <div className="pointer-events-none" aria-hidden>
      <span className="block h-4 w-4 rounded-full border-[3px] border-white bg-stone-900 shadow-md dark:bg-stone-100" />
    </div>
  );
}
