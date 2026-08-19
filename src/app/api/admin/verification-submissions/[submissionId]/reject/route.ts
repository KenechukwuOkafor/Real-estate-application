import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { rejectAgentVerificationAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ submissionId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { reason?: string };
    const { submissionId } = await context.params;
    requireUuid(submissionId, "Verification submission");
    const profile = await rejectAgentVerificationAsAdmin(
      submissionId,
      body.reason ?? "Verification evidence was insufficient.",
    );

    return NextResponse.json({
      data: {
        id: profile.id,
        status: profile.verification_status,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
