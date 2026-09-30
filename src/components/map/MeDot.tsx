/**
 * "You are here": a teal dot with a white ring, and a soft wedge pointing the way the rider is
 * moving when that is known. Used by both maps. The wedge turns without animation under reduced
 * motion.
 */
export function MeDot({ headingDeg }: { headingDeg: number | null }) {
  return (
    <div className="pointer-events-none relative h-12 w-12" title="You are here">
      {headingDeg !== null && (
        <svg
          viewBox="0 0 48 48"
          aria-hidden
          className="absolute inset-0 h-full w-full motion-safe:transition-transform motion-safe:duration-300"
          style={{ transform: `rotate(${Math.round(headingDeg)}deg)` }}
        >
          {/* A 70° fan from the centre towards the top (north before rotation). */}
          <path d="M24 24 L10.2 4.3 A24 24 0 0 1 37.8 4.3 Z" fill="#0f766e" fillOpacity="0.3" />
        </svg>
      )}
      <span className="bg-brand/20 absolute inset-2.5 rounded-full" />
      <span className="bg-brand absolute inset-[17px] rounded-full border-[3px] border-white shadow" />
      <span className="sr-only">You are here</span>
    </div>
  );
}
