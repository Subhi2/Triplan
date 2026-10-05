import { describe, expect, it } from "vitest";
import { drawFrame, videoSize, type FrameText } from "@/components/ride/composite";

/** A 2D context that records what is drawn, enough for drawFrame. */
function fakeContext(width: number, height: number) {
  const texts: string[] = [];
  const images: unknown[] = [];
  const noop = () => undefined;
  const ctx = {
    canvas: { width, height },
    font: "",
    fillStyle: "",
    textBaseline: "",
    fillRect: noop,
    drawImage: (img: unknown) => images.push(img),
    roundRect: noop,
    beginPath: noop,
    fill: noop,
    rect: noop,
    clip: noop,
    save: noop,
    restore: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    arc: noop,
    fillText: (t: string) => texts.push(t),
    measureText: (t: string) => ({ width: t.length * 20 }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, images };
}

const TEXT: FrameText = {
  title: "Pollachi → Valparai",
  km: 28,
  totalKm: 64.1,
  height: "394 m",
  chips: ["Ghat", "Climbing 5.3%"],
  place: { name: "Monkey Falls", line: "Attraction · km 28 · On route", color: "#e11d48" },
  share: 0.44,
  profile: [
    [0, 0],
    [0.5, 0.6],
    [1, 1],
  ],
  credits: "© OpenStreetMap contributors · Terrain © USGS, NOAA",
  brand: "Planned on Triplan · triplan-blue.vercel.app",
};
const FONTS = { display: "serif", body: "sans-serif", mono: "monospace" };
const map = { width: 900, height: 1600 } as unknown as HTMLCanvasElement;

describe("drawFrame", () => {
  it("draws the map, the trip, the place being passed, and always the credits", () => {
    const { ctx, texts, images } = fakeContext(1080, 1920);
    drawFrame(ctx, map, TEXT, FONTS);
    expect(images).toEqual([map]);
    expect(texts).toContain("Pollachi → Valparai");
    expect(texts).toContain("km 28.0 of 64 · 394 m");
    expect(texts).toEqual(expect.arrayContaining(["Ghat", "Climbing 5.3%", "Monkey Falls"]));
    expect(texts).toContain(TEXT.brand);
    // The credits come in full (on two lines when long), never cut.
    const all = texts.join(" | ");
    expect(all).toContain("© OpenStreetMap contributors");
    expect(all).toContain("Terrain © USGS, NOAA");
    expect(texts.filter((t) => t.includes("©")).every((t) => !t.endsWith("…"))).toBe(true);
  });

  it("cuts text that would run off the frame", () => {
    const { ctx, texts } = fakeContext(720, 1280);
    drawFrame(ctx, map, { ...TEXT, title: "A".repeat(200), place: null }, FONTS);
    expect(texts[0]!.endsWith("…")).toBe(true);
    expect(texts).not.toContain("Monkey Falls");
  });
});

describe("videoSize", () => {
  it("is full HD portrait, or 720p on low-end phones", () => {
    expect(videoSize(false)).toEqual({ width: 1080, height: 1920 });
    expect(videoSize(true)).toEqual({ width: 720, height: 1280 });
  });
});
