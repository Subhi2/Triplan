import { createHash } from "node:crypto";

/** Stable short hash of a JSON-serialisable value. */
export function hashKey(prefix: string, value: unknown): string {
  return `${prefix}:${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32)}`;
}
