"use client";

import { useRef, useState } from "react";

/** Sheet heights as a fraction of the viewport: peek, half, full. */
export const SHEET_SNAPS = [0.2, 0.5, 0.88] as const;
export type SheetSnap = 0 | 1 | 2;

interface Props {
  label: string;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: React.ReactNode;
}

const MIN_PX = 72;

/**
 * Mobile bottom sheet over the map. Drag the handle to resize (it snaps to the nearest height),
 * or tap / use the arrow keys on it to step between heights.
 */
export function BottomSheet({ label, snap, onSnapChange, children }: Props) {
  const [dragPx, setDragPx] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startPx: number; moved: boolean } | null>(null);

  function nearestSnap(px: number): SheetSnap {
    const fractions = SHEET_SNAPS.map((f) => Math.abs(f * window.innerHeight - px));
    return fractions.indexOf(Math.min(...fractions)) as SheetSnap;
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      startY: e.clientY,
      startPx: SHEET_SNAPS[snap] * window.innerHeight,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      const max = SHEET_SNAPS[2] * window.innerHeight;
      setDragPx(Math.min(max, Math.max(MIN_PX, d.startPx + dy)));
    }
  }

  function onPointerUp() {
    if (drag.current?.moved && dragPx !== null) onSnapChange(nearestSnap(dragPx));
    setDragPx(null);
  }

  function onClick() {
    // A drag ends with a click event too; only a plain tap steps the size.
    if (drag.current?.moved) {
      drag.current = null;
      return;
    }
    drag.current = null;
    onSnapChange(snap === 2 ? 0 : ((snap + 1) as SheetSnap));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowUp" && snap < 2) {
      e.preventDefault();
      onSnapChange((snap + 1) as SheetSnap);
    } else if (e.key === "ArrowDown" && snap > 0) {
      e.preventDefault();
      onSnapChange((snap - 1) as SheetSnap);
    }
  }

  return (
    <section
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-stone-200 bg-(--background) shadow-[0_-4px_16px_rgba(0,0,0,0.12)] dark:border-stone-800"
      style={{
        height: dragPx !== null ? `${dragPx}px` : `${SHEET_SNAPS[snap] * 100}dvh`,
        transition: dragPx !== null ? "none" : "height 200ms ease-out",
      }}
    >
      <button
        type="button"
        aria-label={`Resize ${label.toLowerCase()} (${["small", "half", "full"][snap]})`}
        className="flex shrink-0 touch-none justify-center py-3"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        <span className="h-1.5 w-10 rounded-full bg-stone-300 dark:bg-stone-600" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
    </section>
  );
}
