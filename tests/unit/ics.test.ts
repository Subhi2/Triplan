import { describe, expect, it } from "vitest";
import { foldLine, icsFile, icsFileName, icsText, icsTime } from "@/lib/ics";

describe("Add to calendar (G10)", () => {
  const start = new Date("2026-12-05T00:30:00Z"); // 6 am in India
  it("writes times in UTC whatever the phone's zone", () => {
    expect(icsTime(start)).toBe("20261205T003000Z");
  });

  it("escapes text and folds long lines", () => {
    expect(icsText("Meet at Cafe; gate 2, then\nleft")).toBe(
      "Meet at Cafe\\; gate 2\\, then\\nleft",
    );
    const long = `DESCRIPTION:${"ಕ".repeat(40)}`;
    const folded = foldLine(long);
    for (const line of folded.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("makes one event with a two-hour default", () => {
    const ics = icsFile(
      {
        uid: "ride-1@example.org",
        title: "Sunday ride to Kalasa",
        start,
        location: "Hebbal flyover",
        url: "https://example.org/group-rides/1",
      },
      new Date("2026-11-28T10:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261205T003000Z\r\n");
    expect(ics).toContain("DTEND:20261205T023000Z\r\n");
    expect(ics).toContain("LOCATION:Hebbal flyover\r\n");
    expect(ics).not.toContain("DESCRIPTION");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(icsFileName("Sunday ride to Kalasa!")).toBe("sunday-ride-to-kalasa.ics");
  });
});
