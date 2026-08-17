import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { approveAgentVerificationAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ submissionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { submissionId } = await context.params;
    const profile = await approveAgentVerificationAsAdmin(submissionId);

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
