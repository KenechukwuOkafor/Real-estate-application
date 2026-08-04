import { NextResponse } from "next/server";

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
    const message =
      error instanceof Error ? error.message : "Unable to load chat messages.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Chat not found."
          ? 404
          : 500;

    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHENTICATED"
              : status === 404
                ? "NOT_FOUND"
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
    const message = error instanceof Error ? error.message : "Unable to send message.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Chat not found."
          ? 404
          : message.includes("required") || message.includes("2000 characters")
            ? 422
            : 500;

    return NextResponse.json(
      {
        error: {
          code:
            status === 401
              ? "UNAUTHENTICATED"
              : status === 404
                ? "CHAT_ACCESS_DENIED"
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
