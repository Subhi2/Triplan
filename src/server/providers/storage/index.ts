import { createClient } from "@supabase/supabase-js";

// Where riders' photos are kept (docs/02, "Reviews, photos and road reports"): Supabase Storage's
// public bucket "rider-photos", written only by the server with the secret key. PHOTO_STORE=memory
// keeps them in this process instead, for tests, so they never reach the real bucket.

export const PHOTO_BUCKET = "rider-photos";

export interface PhotoStore {
  /** Saves a file and returns its public URL. */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  remove(paths: string[]): Promise<void>;
}

const memory = new Map<string, { bytes: Uint8Array; contentType: string }>();

/** The test store's files, by path (for tests to look at). */
export function memoryPhotos(): ReadonlyMap<string, { bytes: Uint8Array; contentType: string }> {
  return memory;
}

function memoryStore(): PhotoStore {
  return {
    async put(path, bytes, contentType) {
      memory.set(path, { bytes, contentType });
      return `https://photos.test/${path}`;
    },
    async remove(paths) {
      for (const p of paths) memory.delete(p);
    },
  };
}

function supabaseStore(url: string, secretKey: string): PhotoStore {
  const client = createClient(url, secretKey, { auth: { persistSession: false } });
  const bucket = client.storage.from(PHOTO_BUCKET);
  let ensured = false;
  // The bucket is made on first use: public read, images only, at most 8 MB a file.
  async function ensureBucket() {
    if (ensured) return;
    const { error } = await client.storage.getBucket(PHOTO_BUCKET);
    if (error) {
      const made = await client.storage.createBucket(PHOTO_BUCKET, {
        public: true,
        fileSizeLimit: 8 * 1024 * 1024,
        allowedMimeTypes: ["image/jpeg", "image/webp"],
      });
      if (made.error && !/already exists/i.test(made.error.message)) throw made.error;
    }
    ensured = true;
  }
  return {
    async put(path, bytes, contentType) {
      await ensureBucket();
      const { error } = await bucket.upload(path, bytes, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw error;
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket.remove(paths);
      if (error) throw error;
    },
  };
}

/** The photo store, or null when Supabase's URL or secret key is missing. */
export function getPhotoStore(): PhotoStore | null {
  if (process.env.PHOTO_STORE === "memory") return memoryStore();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  return url && key ? supabaseStore(url, key) : null;
}
