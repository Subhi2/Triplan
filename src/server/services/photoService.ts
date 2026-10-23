import sharp from "sharp";

// Riders' photos (docs/02, "Reviews, photos and road reports"): turned upright, resized to 1600 px
// and a 400 px thumbnail, and saved as WebP. sharp writes no metadata unless asked, so the EXIF
// (GPS position, phone model, time) never leaves this function.

export const PHOTO_SIZES = { full: 1600, thumb: 400 } as const;
/** Smaller than this on the long side is not worth showing. */
export const PHOTO_MIN_SIDE = 400;

export interface ProcessedPhoto {
  full: Uint8Array;
  thumb: Uint8Array;
  width: number;
  height: number;
}

export class PhotoRejected extends Error {}

export async function processPhoto(input: Uint8Array): Promise<ProcessedPhoto> {
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new PhotoRejected("Not a photo we can read");
  }
  if (!meta.format || !["jpeg", "png", "webp", "heif"].includes(meta.format)) {
    throw new PhotoRejected("Use a JPEG, PNG or WebP photo");
  }
  if (Math.max(meta.width ?? 0, meta.height ?? 0) < PHOTO_MIN_SIDE) {
    throw new PhotoRejected(`The photo is too small: at least ${PHOTO_MIN_SIDE} px`);
  }
  const resize = (side: number) =>
    sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(side, side, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 });
  const { data: full, info } = await resize(PHOTO_SIZES.full).toBuffer({ resolveWithObject: true });
  const thumb = await resize(PHOTO_SIZES.thumb).toBuffer();
  return {
    full: new Uint8Array(full),
    thumb: new Uint8Array(thumb),
    width: info.width,
    height: info.height,
  };
}
