"use client";

import { solveChallenge, type Challenge, type Solution } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/pbkdf2";

// The browser's side of riders' posts (docs/02, "Reviews, photos and road reports"): this device's
// key, the proof of work solved in the background, and the places it has reviewed. localStorage
// can be missing or throw (private windows): then the key lives for this page only.

const DEVICE_KEY = "triplan.device.v1";
const REVIEWED_KEY = "triplan.reviewed.v1";
/** Shared with ride rooms, so a rider types their name once. */
export const NICKNAME_KEY = "ride-nickname";

let pageKey: string | null = null;

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** This device's key (256 random bits): it lets the device change or delete its own posts. */
export function deviceKey(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved && /^[A-Za-z0-9_-]{43}$/.test(saved)) return saved;
    const key = newKey();
    localStorage.setItem(DEVICE_KEY, key);
    return key;
  } catch {
    pageKey ??= newKey();
    return pageKey;
  }
}

export function savedNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY)?.slice(0, 24) ?? "";
  } catch {
    return "";
  }
}

export function saveNickname(name: string) {
  try {
    localStorage.setItem(NICKNAME_KEY, name);
  } catch {
    // Not remembered; the post still goes.
  }
}

function reviewed(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(REVIEWED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** Whether this device has a review of the place (so it can offer to delete it). */
export function hasReviewed(slug: string): boolean {
  return reviewed().includes(slug);
}

export function markReviewed(slug: string, on: boolean) {
  try {
    const rest = reviewed().filter((s) => s !== slug);
    localStorage.setItem(REVIEWED_KEY, JSON.stringify(on ? [slug, ...rest].slice(0, 500) : rest));
  } catch {
    // Not remembered: the review stays, only the delete button is not offered later.
  }
}

export interface PowPayload {
  challenge: Challenge;
  solution: Solution;
}

export class PostsClosed extends Error {}

/**
 * Fetches a challenge and solves it (about a second of work). Start it when a form opens, so the
 * answer is ready by the time the rider presses Send. One answer pays for one post.
 */
export async function solveProofOfWork(signal?: AbortSignal): Promise<PowPayload> {
  const res = await fetch("/api/pow", { cache: "no-store", signal });
  if (res.status === 503) throw new PostsClosed("Posting is not open yet");
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  const challenge = (await res.json()) as Challenge;
  const controller = new AbortController();
  signal?.addEventListener("abort", () => controller.abort());
  const solution = await solveChallenge({ challenge, deriveKey, controller });
  if (!solution) throw new Error("The anti-spam check did not finish");
  return { challenge, solution };
}

/** The error message of a failed post. */
export async function postError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Could not send (HTTP ${res.status})`;
}
