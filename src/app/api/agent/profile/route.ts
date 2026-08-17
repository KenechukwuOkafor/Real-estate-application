import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import {
  getAgentOnboardingContext,
  saveCurrentAgentProfile,
} from "@/server/services/agent-service";

export async function GET() {
  const requestId = await getRequestId();

  try {
    const context = await getAgentOnboardingContext();

    return NextResponse.json({
      data: {
        agentProfile: context.agentProfile
          ? {
              bio: context.agentProfile.bio,
              displayName: context.agentProfile.display_name,
              id: context.agentProfile.id,
              verificationStatus: context.agentProfile.verification_status,
            }
          : null,
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

export async function PUT(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      bio?: string;
      displayName?: string;
    };

    const result = await saveCurrentAgentProfile({
      bio: body.bio,
      displayName: body.displayName ?? "",
    });

    return NextResponse.json({
      data: {
        agentProfile: {
          bio: result.agentProfile.bio,
          displayName: result.agentProfile.display_name,
          id: result.agentProfile.id,
          verificationStatus: result.agentProfile.verification_status,
        },
      },
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
