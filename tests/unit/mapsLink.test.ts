import { describe, expect, it } from "vitest";
import { firstLink, parseMapsLink, stopsFromShare } from "@/lib/mapsLink";

describe("Share to Triplan: Google Maps links (G12)", () => {
  it("reads a place link's name and point", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/place/Manjarabad+Fort/@12.9173,75.7581,17z/data=!3m1",
      ),
    ).toEqual([{ label: "Manjarabad Fort", location: [75.7581, 12.9173] }]);
  });

  it("reads directions with points and names, in order", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/dir/12.9716,77.5946/Kalasa,+Karnataka/@13.1,76.4,9z/data=!4m2",
      ),
    ).toEqual([
      { label: "Start", location: [77.5946, 12.9716] },
      { label: "Kalasa, Karnataka", location: null },
    ]);
  });

  it("reads api=1 links and q= queries", () => {
    expect(
      parseMapsLink(
        "https://www.google.com/maps/dir/?api=1&origin=Bengaluru&destination=13.234,75.356",
      ),
    ).toEqual([
      { label: "Bengaluru", location: null },
      { label: "Shared place", location: [75.356, 13.234] },
    ]);
    expect(parseMapsLink("https://maps.google.com/?q=12.9173,75.7581")).toEqual([
      { label: "Shared place", location: [75.7581, 12.9173] },
    ]);
  });

  it("never follows a short link or reads another site", () => {
    expect(parseMapsLink("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
    expect(parseMapsLink("https://example.org/maps/place/X/@1,2,3z")).toBeNull();
    expect(parseMapsLink("http://www.google.com/maps/@12.9,77.5,15z")).toBeNull();
  });

  it("takes the place name from Google Maps' shared text when the link is short", () => {
    expect(
      stopsFromShare({
        text: "Manjarabad Fort\nSakleshpur, Karnataka 573134\nhttps://maps.app.goo.gl/AbCdEf123",
      }),
    ).toEqual([{ label: "Manjarabad Fort", location: null }]);
    expect(firstLink("see https://maps.app.goo.gl/x here")).toBe("https://maps.app.goo.gl/x");
    expect(stopsFromShare({})).toEqual([]);
  });
});
