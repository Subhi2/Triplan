import { createHash } from "node:crypto";
import { createChallenge, randomInt, verifySolution, type Challenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";

// Proof of work for riders' posts (docs/02, "Reviews, photos and road reports"): with no sign-in,
// each review, photo or road report costs the browser about a second of work, solved in the
// background with ALTCHA's open-source library (MIT). No key, cookie or outside service. Without
// ALTCHA_HMAC_KEY posting is closed.

export const POW_ALGORITHM = "PBKDF2/SHA-256";
/** PBKDF2 rounds per try, and the range the answer is drawn from: about a second on a phone. */
export const POW_COST = 1_000;
const COUNTER_MIN = 2_000;
const COUNTER_MAX = 6_000;
/** A challenge must be solved and sent within this time. */
export const POW_TTL_S = 15 * 60;

/** The key from the environment, or null when posting is closed. */
export function powKey(): string | null {
  const key = process.env.ALTCHA_HMAC_KEY?.trim();
  return key ? key : null;
}

/** Two secrets from the one key: one signs the challenge, the other the expected answer. */
function secrets(key: string) {
  return {
    hmacSignatureSecret: key,
    hmacKeySignatureSecret: createHash("sha256").update(`altcha-key:${key}`).digest("hex"),
  };
}

/**
 * A new challenge for the browser to solve, signed so it cannot be changed. `cost` is lowered
 * only by tests; it is part of what is signed.
 */
export async function newChallenge(
  key: string,
  now = Date.now(),
  cost = POW_COST,
): Promise<Challenge> {
  return createChallenge({
    algorithm: POW_ALGORITHM,
    cost,
    counter: randomInt(COUNTER_MIN, COUNTER_MAX),
    deriveKey,
    expiresAt: Math.floor(now / 1000) + POW_TTL_S,
    ...secrets(key),
  });
}

/** What the browser sends back with a post: the challenge it was given and its answer. */
export const powPayloadSchema = z.object({
  challenge: z.object({
    parameters: z
      .object({
        algorithm: z.literal(POW_ALGORITHM),
        nonce: z.string().max(200),
        salt: z.string().max(200),
        cost: z.number().int(),
        keyLength: z.number().int(),
        keyPrefix: z.string().max(200),
        keySignature: z.string().max(200).optional(),
        expiresAt: z.number().int().optional(),
      })
      .strict(),
    signature: z.string().min(1).max(200),
  }),
  solution: z.object({
    counter: z.number().int().nonnegative(),
    derivedKey: z.string().max(200),
    time: z.number().optional(),
  }),
});
export type PowPayload = z.infer<typeof powPayloadSchema>;

export type PowCheck = "ok" | "closed" | "invalid" | "expired" | "used";

/**
 * Checks a solved challenge and spends it, so one answer pays for one post. The spent signature
 * is kept until the challenge would have expired anyway (cleaned up by the daily health check).
 */
export async function spendProofOfWork(payload: PowPayload): Promise<PowCheck> {
  const key = powKey();
  if (!key) return "closed";
  const result = await verifySolution({
    challenge: payload.challenge,
    solution: payload.solution,
    deriveKey,
    ...secrets(key),
  });
  if (result.expired) return "expired";
  if (!result.verified) return "invalid";
  const expiresAt = payload.challenge.parameters.expiresAt ?? Math.floor(Date.now() / 1000);
  const rows = await getDb().execute(sql`
    INSERT INTO pow_spent (signature, expires_at)
    VALUES (${payload.challenge.signature}, to_timestamp(${expiresAt}))
    ON CONFLICT (signature) DO NOTHING
    RETURNING 1`);
  return rows.length === 1 ? "ok" : "used";
}
