import { NextResponse } from "next/server";
import { backgroundQueueEnvelopeSchema } from "@/lib/background-jobs";
import { requireAdmin } from "@/lib/server/auth";
import { replayDeadBackgroundJob } from "@/lib/server/background-job-admin";
import { publishBackgroundJob } from "@/lib/server/background-job-service";
import { getSiteUrl } from "@/lib/server/env";
import { getDb } from "@/lib/server/mongodb";
import { enforceMutationRateLimit } from "@/lib/server/rate-limit";
import {
  assertSameOrigin,
  createRequestContext,
  parseBoundedJson,
  withRequestId
} from "@/lib/server/request-security";
import { safeErrorResponse } from "@/lib/server/safe-errors";

export async function POST(request: Request) {
  const context = createRequestContext(request);
  try {
    assertSameOrigin(request, { expectedOrigin: getSiteUrl() });
    const admin = await requireAdmin();
    if (!admin.ok) {
      return withRequestId(
        NextResponse.json({ error: admin.message }, { status: admin.status }),
        context.requestId
      );
    }
    await enforceMutationRateLimit({
      request,
      scope: "background-jobs.replay",
      limit: 10,
      windowMs: 10 * 60 * 1_000,
      userId: admin.user.id
    });
    const body = await parseBoundedJson(request, backgroundQueueEnvelopeSchema, { maxBytes: 256 });
    const job = await replayDeadBackgroundJob(await getDb(), body.jobId);
    if (!job) {
      return withRequestId(
        NextResponse.json({ error: "Dead background job not found." }, { status: 404 }),
        context.requestId
      );
    }
    const publication = await publishBackgroundJob(body.jobId);
    return withRequestId(NextResponse.json({ ok: true, outcome: publication.outcome }), context.requestId);
  } catch (error) {
    return safeErrorResponse(error, { ...context, event: "background-jobs.replay.failed" });
  }
}
