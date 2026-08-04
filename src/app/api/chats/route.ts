import { NextResponse } from "next/server";

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
    const message = error instanceof Error ? error.message : "Unable to load chats.";
    const status = message === "Unauthenticated request." ? 401 : 500;

    return NextResponse.json(
      {
        error: {
          code: status === 401 ? "UNAUTHENTICATED" : "INTERNAL_ERROR",
          details: null,
          message,
        },
        meta: createApiMeta(requestId),
      },
      { status },
    );
  }
}
