"use client";

import { icsFile, icsFileName, type CalendarEvent } from "@/lib/ics";

/** Downloads the event as an .ics file, which phones open in their calendar (G10, C1). */
export function AddToCalendar({ event, className }: { event: CalendarEvent; className?: string }) {
  function download() {
    const blob = new Blob([icsFile(event)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFileName(event.title);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return (
    <button type="button" onClick={download} className={className}>
      Add to calendar
    </button>
  );
}
