import { z } from "zod";
import { deviceKeySchema, roadReportInputSchema } from "@/lib/riderPosts";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";
import { saveRoadReport } from "@/server/services/riderPostService";

const postSchema = z.object({
  report: roadReportInputSchema,
  pow: powPayloadSchema,
  deviceKey: deviceKeySchema,
});

/**
 * POST { report, pow, deviceKey } -> 201 { status: "pending" }
 * A rider's road report (closed, landslide, flooded, potholes, diversion): a point and a note,
 * pre-screened, shown on routes once an admin approves it, until it expires (24 or 72 hours).
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
    await saveRoadReport(parsed.data.report, parsed.data.deviceKey);
    return Response.json({ status: "pending" }, { status: 201 });
  } catch (err) {
    console.error("POST /api/road-reports failed", err);
    return Response.json({ error: "Could not save the report" }, { status: 500 });
  }
}
