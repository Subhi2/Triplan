import { z } from "zod";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import { ProviderError } from "@/server/providers/http";
import { getRouteAskProvider } from "@/server/providers/llm";
import { checkAnswer, routeContext, routeFacts } from "@/server/services/askRouteService";
import { getRouteResult } from "@/server/services/routeService";
import { takeDailyBudget } from "@/server/services/usage";
import { allowRequest } from "@/server/services/writeLimit";

export const maxDuration = 40;

const AI_PER_VISITOR_HOUR = 10;
const AI_PER_DAY = 300;

const bodySchema = z.object({
  routeId: z.string().regex(ROUTE_ID_PATTERN),
  question: z.string().trim().min(3).max(300),
});

const noStore = { "Cache-Control": "no-store" };

/**
 * POST { routeId, question } -> CheckedAnswer | { error }
 * "Ask this route" (G12): answered only from the route's own places, rules and stops; places
 * and rules the model names are checked against them. Off (404) without ANTHROPIC_API_KEY. The
 * question goes to the model and is never stored or logged.
 */
export async function POST(request: Request) {
  const provider = getRouteAskProvider();
  if (!provider) return Response.json({ error: "Not switched on" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json({ error: "Ask a short question (3 to 300 characters)" }, { status: 400 });
  }
  if (!(await allowRequest(request, { scope: "ai", limit: AI_PER_VISITOR_HOUR, windowS: 3600 }))) {
    return Response.json(
      { error: "That's a lot of questions for one hour. Come back soon." },
      { status: 429, headers: noStore },
    );
  }
  const route = await getRouteResult(parsed.data.routeId).catch(() => null);
  if (!route) {
    return Response.json(
      { error: "This route is no longer kept. Plan it again.", code: "ROUTE_NOT_FOUND" },
      { status: 404 },
    );
  }
  if (!(await takeDailyBudget("ai_ask", AI_PER_DAY))) {
    return Response.json(
      { error: "Questions are resting for today." },
      { status: 503, headers: noStore },
    );
  }
  try {
    const facts = await routeFacts(route.geometry, route.distanceM, route.durationS);
    const answer = await provider.answer(routeContext(facts), parsed.data.question);
    if (!answer) {
      return Response.json({ error: "No answer for that one." }, { status: 422, headers: noStore });
    }
    return Response.json(checkAnswer(answer, facts), { headers: noStore });
  } catch (err) {
    // The message only: never the question.
    console.error(
      "POST /api/route/ask failed:",
      err instanceof ProviderError ? err.message : "error",
    );
    return Response.json(
      { error: "Could not answer just now." },
      { status: 502, headers: noStore },
    );
  }
}
