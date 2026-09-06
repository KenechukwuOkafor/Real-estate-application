import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { saveCurrentAgentAvatar } from "@/server/services/agent-service";

export async function PUT(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      avatarPath?: string | null;
    };

    const result = await saveCurrentAgentAvatar(body.avatarPath ?? null);

    return NextResponse.json({
      data: result,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

/** Clearing a photo is the same write with a null path. */
export async function DELETE() {
  const requestId = await getRequestId();

  try {
    const result = await saveCurrentAgentAvatar(null);

    return NextResponse.json({
      data: result,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
