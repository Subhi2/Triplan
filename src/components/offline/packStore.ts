"use client";

import { packCacheName } from "@/lib/offlinePack";
import type { PlaceAlong } from "@/lib/places";
import type { SafetySummary } from "@/lib/safety";
import type { RouteOption, Vehicle } from "@/lib/trip";

// Saved offline packs (docs/02, "Offline trip pack"): the trip as JSON in IndexedDB, written by
// the page; the map tiles in the Cache Storage cache "pack-<route id>". The service worker never
// writes either, so its rule that /api/ answers are never stored still holds.

export interface SavedPack {
  /** The route id. */
  id: string;
  title: string;
  savedAt: string;
  bytes: number;
  tiles: number;
  maxZoom: number;
  vehicle: Vehicle;
  /** The planner's address for the trip, without "pack=". */
  query: string;
  stops: { label: string; location: [number, number] }[];
  route: RouteOption;
  places: PlaceAlong[];
  /** Food, coffee and fuel near the road, for the break planner. */
  breakPlaces: PlaceAlong[] | null;
  safety: SafetySummary | null;
}

const DB_NAME = "triplan-offline";
const STORE = "packs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = work(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
    });
  } finally {
    db.close();
  }
}

/** Every saved pack, newest first. */
export async function listPacks(): Promise<SavedPack[]> {
  const all = await run<SavedPack[]>("readonly", (s) => s.getAll() as IDBRequest<SavedPack[]>);
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function getPack(id: string): Promise<SavedPack | null> {
  return (await run<SavedPack | undefined>("readonly", (s) => s.get(id))) ?? null;
}

export async function putPack(pack: SavedPack): Promise<void> {
  await run("readwrite", (s) => s.put(pack));
}

/** Deletes a pack's trip and its tiles. */
export async function deletePack(id: string): Promise<void> {
  await run("readwrite", (s) => s.delete(id));
  await caches.delete(packCacheName(id));
}
