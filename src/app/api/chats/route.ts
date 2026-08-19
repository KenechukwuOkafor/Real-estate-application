import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { listCurrentUserChats } from "@/server/services/chat-service";

export async function GET() {
  const requestId = await getRequestId();

  try {
    const chats = await listCurrentUserChats();

    return NextResponse.json({
      data: chats,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
