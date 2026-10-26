import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PhotoRejected, processPhoto } from "@/server/services/photoService";

/** A JPEG as a phone writes it: big, turned by EXIF, with GPS and camera details inside. */
async function phonePhoto(width = 3000, height = 2000) {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 80 } } })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: { Make: "PhoneCo", Model: "Rider X" },
          IFD3: { GPSLatitudeRef: "N", GPSLatitude: "12/1 56/1 0/1" },
        },
      })
      .toBuffer(),
  );
}

describe("processPhoto", () => {
  it("turns the photo upright, resizes it and drops every bit of metadata", async () => {
    const input = await phonePhoto();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processPhoto(input);
    // Orientation 6 is a quarter turn: the 3000 × 2000 photo is 2000 wide and 3000 tall.
    expect([out.width, out.height]).toEqual([1067, 1600]);
    const full = await sharp(out.full).metadata();
    expect(full.format).toBe("webp");
    expect(full.exif).toBeUndefined();
    expect(full.orientation).toBeUndefined();
    const thumb = await sharp(out.thumb).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(400);
    expect(thumb.exif).toBeUndefined();
  });

  it("does not enlarge a small photo, and refuses tiny ones and other files", async () => {
    const out = await processPhoto(await phonePhoto(900, 600));
    expect(Math.max(out.width, out.height)).toBe(900);
    await expect(processPhoto(await phonePhoto(300, 200))).rejects.toBeInstanceOf(PhotoRejected);
    await expect(processPhoto(new TextEncoder().encode("<svg/>"))).rejects.toBeInstanceOf(
      PhotoRejected,
    );
  });
});
