// "Add to calendar" (G10, C1): one event as an iCalendar file (RFC 5545), built in the browser
// from what the page already shows, so a group ride's exact meeting point is in it only for
// riders the host let in (the page has it only for them).

export interface CalendarEvent {
  /** Stable id, so adding it again updates the same event ("ride-<id>@<host>"). */
  uid: string;
  title: string;
  start: Date;
  /** Defaults to two hours after the start. */
  end?: Date;
  location?: string;
  description?: string;
  url?: string;
}

/** UTC in iCalendar's basic form: 20261128T103500Z. */
export function icsTime(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Escapes text values (backslash, semicolon, comma and newlines). */
export function icsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a content line to 75 octets, continuation lines starting with a space. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // a continuation line spends one on its space
    if (bytes.encode(current + ch).length > limit) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

/** The whole .ics file for one event, lines ending in CRLF. */
export function icsFile(event: CalendarEvent, now = new Date()): string {
  const end = event.end ?? new Date(event.start.getTime() + 2 * 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Triplan//Rides//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(event.start)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** A file name from the title: "bengaluru-to-kalasa.ics". */
export function icsFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${slug || "ride"}.ics`;
}
