import { describe, expect, it } from "vitest";
import { userAgentFromString } from "next/server";
import {
  guessViewport,
  parseViewportHint,
  serializeViewportHint,
  VIEWPORT_QUERIES,
  viewportKey,
} from "@/lib/viewport";

const PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const LAPTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

describe("viewport hint", () => {
  it("guesses the layout from the device type on a first visit", () => {
    const guess = (ua: string) => guessViewport(userAgentFromString(ua).device.type);
    expect(guess(PHONE)).toEqual({ md: false, lg: false, coarse: true });
    expect(guess(IPAD)).toEqual({ md: true, lg: false, coarse: true });
    expect(guess(LAPTOP)).toEqual({ md: true, lg: true, coarse: false });
  });

  it("round-trips through the cookie, and ignores cookies that are not ours", () => {
    for (const hint of [
      { md: true, lg: true, coarse: false },
      { md: false, lg: false, coarse: true },
      { md: false, lg: false, coarse: false },
    ]) {
      expect(parseViewportHint(serializeViewportHint(hint))).toEqual(hint);
    }
    expect(serializeViewportHint({ md: false, lg: false, coarse: false })).toBe("none");
    expect(parseViewportHint(undefined)).toBeNull();
    expect(parseViewportHint("md.huge")).toBeNull();
  });

  it("knows the layout's media queries, and only those", () => {
    expect(viewportKey(VIEWPORT_QUERIES.lg)).toBe("lg");
    expect(viewportKey("(prefers-reduced-motion: reduce)")).toBeUndefined();
  });
});
