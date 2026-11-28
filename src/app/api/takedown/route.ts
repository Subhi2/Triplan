import { z } from "zod";
import { contentReportInputSchema, deviceKeySchema } from "@/lib/riderPosts";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";
import { saveContentReport } from "@/server/services/riderPostService";

const postSchema = z.object({
  report: contentReportInputSchema,
  pow: powPayloadSchema,
  deviceKey: deviceKeySchema,
});

/**
 * POST { report, pow, deviceKey } -> 201 { status: "received" }
 * A takedown request from /terms (G9): a page of ours, what is wrong and, if given, how to answer.
 * The same proof of work and limits as riders' posts; read only by an admin, who takes the
 * content down by its link.
 */
export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    await saveContentReport(parsed.data.report, parsed.data.deviceKey);
    return Response.json({ status: "received" }, { status: 201 });
  } catch (err) {
    console.error("POST /api/takedown failed", err);
    return Response.json({ error: "Could not send it" }, { status: 500 });
  }
}
