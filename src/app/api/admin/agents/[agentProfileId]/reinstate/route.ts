import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { reinstateAgentAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ agentProfileId: string }>;
};

/** Lift a suspension: back to verified, reason cleared. ADR-017-A1. */
export async function POST(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { agentProfileId } = await context.params;
    requireUuid(agentProfileId, "Agent profile");
    const result = await reinstateAgentAsAdmin(agentProfileId);

    return NextResponse.json({
      data: { id: result.agent_profile_id, verificationStatus: "verified" },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
