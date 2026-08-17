import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import {
  getCurrentUserChatThread,
  sendCurrentUserChatMessage,
} from "@/server/services/chat-service";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { chatId } = await context.params;
    const result = await getCurrentUserChatThread(chatId);

    return NextResponse.json({
      data: result.messages,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as { body?: string };
    const { chatId } = await context.params;
    const message = await sendCurrentUserChatMessage({
      body: body.body ?? "",
      chatId,
    });

    return NextResponse.json(
      {
        data: {
          body: message.body,
          createdAt: message.created_at,
          id: message.id,
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
