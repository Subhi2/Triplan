"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef } from "react";
import { useLocate } from "@/components/geo/useLocate";
import { MY_LOCATION } from "@/lib/nearby";
import { CrosshairIcon } from "@/components/geo/CrosshairIcon";
import type { LngLat } from "@/lib/geo";
import { VehicleToggle } from "@/components/ui/VehicleToggle";
import {
  CORRIDOR_KM,
  MAX_VIA_STOPS,
  type CorridorKm,
  type GeocodeResult,
  type Vehicle,
} from "@/lib/trip";
import { StopInput, type MapBias } from "./StopInput";

export interface StopDraft {
  id: string;
  label: string;
  location: LngLat | null;
}

interface Props {
  stops: StopDraft[];
  vehicle: Vehicle;
  corridorKm: CorridorKm;
  focusId: string | null;
  near: MapBias;
  onStopsChange: (stops: StopDraft[]) => void;
  onAddStop: () => void;
  onVehicleChange: (v: Vehicle) => void;
  onCorridorChange: (km: CorridorKm) => void;
}

function roleOf(index: number, count: number) {
  if (index === 0) return { name: "Start", placeholder: "Where from? e.g. Bengaluru" };
  if (index === count - 1) return { name: "Destination", placeholder: "Where to? e.g. Kalasa" };
  return { name: `Stop ${index}`, placeholder: "Via town or place" };
}

function SortableStop(props: {
  stop: StopDraft;
  index: number;
  count: number;
  autoFocus: boolean;
  near: MapBias;
  trailing?: React.ReactNode;
  onText: (text: string) => void;
  onPick: (r: GeocodeResult) => void;
  onRemove: (() => void) | null;
}) {
  const { stop, index, count } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.id,
  });
  const role = roleOf(index, count);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 ${isDragging ? "relative z-10 opacity-80" : ""}`}
    >
      <button
        type="button"
        aria-label={`Reorder ${role.name}`}
        className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-stone-400 hover:text-stone-700 active:cursor-grabbing dark:hover:text-stone-200"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <StopInput
        label={role.name}
        placeholder={role.placeholder}
        value={stop.label}
        resolved={stop.location !== null}
        near={props.near}
        autoFocus={props.autoFocus}
        trailing={props.trailing}
        onText={props.onText}
        onPick={props.onPick}
      />
      {props.onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${role.name}`}
          onClick={props.onRemove}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-stone-400 hover:text-red-700 dark:hover:text-red-400"
        >
          ✕
        </button>
      ) : (
        <span className="w-11 shrink-0" aria-hidden />
      )}
    </li>
  );
}

export function TripForm(props: Props) {
  const { stops, onStopsChange } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(id: string, patch: Partial<StopDraft>) {
    onStopsChange(stops.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  // "Use my location" for the start. The stops may change while the browser looks for the
  // position, so the update applies to the latest ones.
  const { state: locateState, locate } = useLocate();
  const latestStops = useRef(stops);
  useEffect(() => {
    latestStops.current = stops;
  }, [stops]);
  async function locateStart() {
    const at = await locate();
    const start = latestStops.current[0];
    if (!at || !start) return;
    onStopsChange(
      latestStops.current.map((s) =>
        s.id === start.id ? { ...s, label: MY_LOCATION, location: at } : s,
      ),
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = stops.findIndex((s) => s.id === active.id);
    const to = stops.findIndex((s) => s.id === over.id);
    onStopsChange(arrayMove(stops, from, to));
  }

  // Screen reader announcements that name the stop instead of dnd-kit's internal ids.
  const hasMoved = useRef(false);
  const nameOf = (id: UniqueIdentifier) => {
    const i = stops.findIndex((s) => s.id === id);
    return stops[i]?.label || roleOf(i, stops.length).name;
  };
  const positionOf = (id: UniqueIdentifier) => stops.findIndex((s) => s.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      hasMoved.current = false;
      return `Picked up ${nameOf(active.id)}. Use the arrow keys to move it and Space to drop it.`;
    },
    onDragOver: ({ active, over }) => {
      // dnd-kit reports the item over its own slot right after pick-up; announcing that would
      // replace the pick-up instructions in the live region before they are read.
      if (!hasMoved.current && over?.id === active.id) return undefined;
      hasMoved.current = true;
      return over
        ? `${nameOf(active.id)} moved to position ${positionOf(over.id)} of ${stops.length}.`
        : `${nameOf(active.id)} is not over a position.`;
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)} of ${stops.length}.`
        : `${nameOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  };

  const viaCount = stops.length - 2;

  return (
    <form
      className="space-y-3 rounded-2xl border border-stone-200 bg-(--surface) p-3 md:p-4 dark:border-stone-800"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Trip"
    >
      <DndContext
        id="trip-stops"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To reorder stops, press Space to pick one up, use the arrow keys to move it, and press Space again to drop it. Press Escape to cancel.",
          },
        }}
      >
        <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {stops.map((s, i) => (
              <SortableStop
                key={s.id}
                stop={s}
                index={i}
                count={stops.length}
                autoFocus={s.id === props.focusId}
                near={props.near}
                trailing={
                  i === 0 ? (
                    <button
                      type="button"
                      onClick={() => void locateStart()}
                      disabled={locateState.status === "locating"}
                      aria-label="Use my location"
                      title="Use my location"
                      className="text-brand-dark flex h-11 w-11 items-center justify-center rounded-xl hover:bg-stone-100 disabled:opacity-70 dark:text-teal-300 dark:hover:bg-stone-800"
                    >
                      {locateState.status === "locating" ? (
                        <span
                          aria-hidden
                          className="border-brand/30 border-t-brand h-4 w-4 animate-spin rounded-full border-2 motion-reduce:animate-none"
                        />
                      ) : (
                        <CrosshairIcon size={18} />
                      )}
                    </button>
                  ) : undefined
                }
                onText={(label) => update(s.id, { label, location: null })}
                onPick={(r) => update(s.id, { label: r.name, location: r.location })}
                onRemove={
                  stops.length > 2 ? () => onStopsChange(stops.filter((x) => x.id !== s.id)) : null
                }
              />
            ))}
          </ol>
        </SortableContext>
        {locateState.status === "error" && (
          <p role="status" className="text-ghat-dark ml-9 text-sm dark:text-orange-300">
            {locateState.message}
          </p>
        )}
      </DndContext>

      <button
        type="button"
        onClick={props.onAddStop}
        disabled={viaCount >= MAX_VIA_STOPS}
        className="text-brand-dark ml-9 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold hover:underline disabled:text-stone-400 disabled:no-underline dark:text-teal-300"
      >
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add a stop{viaCount >= MAX_VIA_STOPS ? ` (max ${MAX_VIA_STOPS})` : ""}
      </button>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-9 text-sm">
        <VehicleToggle value={props.vehicle} onChange={props.onVehicleChange} />
        <label className="flex items-center gap-2">
          <span>Places within</span>
          <select
            value={props.corridorKm}
            onChange={(e) => props.onCorridorChange(Number(e.target.value) as CorridorKm)}
            className="min-h-10 rounded-lg border border-stone-300 bg-(--surface) px-2 text-base md:text-sm dark:border-stone-700"
          >
            {CORRIDOR_KM.map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
