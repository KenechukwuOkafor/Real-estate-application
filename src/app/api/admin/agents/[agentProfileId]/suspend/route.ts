import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { requireUuid } from "@/lib/api/identifiers";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { suspendAgentAsAdmin } from "@/server/services/admin-service";

type RouteContext = {
  params: Promise<{ agentProfileId: string }>;
};

/** Suspend an agent with a reason they will read. ADR-017-A1. */
export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { reason?: string };
    const { agentProfileId } = await context.params;
    requireUuid(agentProfileId, "Agent profile");
    // No fallback reason. A blank one is refused in admin-service and again in
    // suspend_agent, because the agent reads it verbatim.
    const result = await suspendAgentAsAdmin(agentProfileId, body.reason ?? "");

    return NextResponse.json({
      data: { id: result.agent_profile_id, verificationStatus: "suspended" },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
