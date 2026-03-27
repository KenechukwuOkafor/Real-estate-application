import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import {
  getCurrentAgentContext,
  saveCurrentAgentProfile,
} from "@/server/services/agent-service";

export async function GET() {
  const requestId = await getRequestId();

  try {
    const context = await getCurrentAgentContext();

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
    const message = error instanceof Error ? error.message : "Unable to load agent profile.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : 500;

    return NextResponse.json(
      {
        error: {
          code: status === 401 ? "UNAUTHENTICATED" : status === 403 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
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
    const message = error instanceof Error ? error.message : "Unable to save agent profile.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : message.includes("required")
            ? 422
            : 500;

    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHENTICATED"
              : status === 403
                ? "UNAUTHORIZED"
                : status === 422
                  ? "VALIDATION_ERROR"
                  : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
  }
}
