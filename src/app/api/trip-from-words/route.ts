import { z } from "zod";
import { lngLatSchema } from "@/lib/trip";
import { serializeTripUrl } from "@/lib/tripUrl";
import { ProviderError } from "@/server/providers/http";
import { getTripIntentProvider } from "@/server/providers/llm";
import { defaultWordsDeps, tripFromWords } from "@/server/services/tripFromWordsService";
import { countLater, takeDailyBudget } from "@/server/services/usage";
import { allowRequest } from "@/server/services/writeLimit";

// One model call (15 s timeout, one retry) and a few place searches.
export const maxDuration = 40;

/** Requests per visitor per hour, and in all per UTC day (about US$0.002 each). */
export const AI_PER_VISITOR_HOUR = 6;
export const AI_PER_DAY = 200;

const bodySchema = z.object({
  text: z.string().trim().min(3).max(300),
  /** The map's centre, so "the coast" or a common town name resolves near the rider. */
  near: lngLatSchema.optional(),
});

const noStore = { "Cache-Control": "no-store" };

/**
 * POST { text, near? } -> { trip, query, summary, picked } | { error }
 * Reads a sentence ("2-day monsoon ride from Pune with waterfalls") into a planner trip. Off (404)
 * without ANTHROPIC_API_KEY. The text is sent to the model and never stored or logged.
 */
export async function POST(request: Request) {
  const provider = getTripIntentProvider();
  if (!provider) {
    return Response.json({ error: "Planning in plain words is not switched on" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json(
      { error: "Write a short sentence (3 to 300 characters)" },
      { status: 400 },
    );
  }
  if (!(await allowRequest(request, { scope: "ai", limit: AI_PER_VISITOR_HOUR, windowS: 3600 }))) {
    return Response.json(
      { error: "That's a lot of plans for one hour. Try the trip form, or come back soon." },
      { status: 429, headers: noStore },
    );
  }
  if (!(await takeDailyBudget("ai_trip", AI_PER_DAY))) {
    return Response.json(
      { error: "Planning in plain words is resting for today. The trip form still works." },
      { status: 503, headers: noStore },
    );
  }

  try {
    const outcome = await tripFromWords(
      parsed.data.text,
      parsed.data.near,
      defaultWordsDeps(provider),
    );
    if (!outcome.ok) {
      return Response.json(
        { error: outcome.message, reason: outcome.reason },
        { status: 422, headers: noStore },
      );
    }
    countLater("ai_tokens_in", outcome.usage.tokensIn);
    countLater("ai_tokens_out", outcome.usage.tokensOut);
    return Response.json(
      {
        trip: outcome.trip,
        query: serializeTripUrl(outcome.trip),
        summary: outcome.summary,
        picked: outcome.picked,
      },
      { headers: noStore },
    );
  } catch (err) {
    // Never log the rider's text.
    console.error(
      "POST /api/trip-from-words failed",
      err instanceof ProviderError ? err.message : err,
    );
    return Response.json(
      { error: "Couldn't reach the AI service. Try again, or use the trip form." },
      { status: 502, headers: noStore },
    );
  }
}
