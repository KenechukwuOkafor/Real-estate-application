import { NextResponse } from "next/server";

import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { createCurrentAgentListingImageUploadTargets } from "@/server/services/agent-service";

type RouteContext = {
  params: Promise<{ listingId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = await getRequestId();

  try {
    const { listingId } = await context.params;
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      files?: Array<{
        contentType?: string;
        fileName?: string;
      }>;
    };

    const result = await createCurrentAgentListingImageUploadTargets({
      files: (body.files ?? []).map((file) => ({
        contentType: file.contentType ?? "",
        fileName: file.fileName ?? "image.webp",
      })),
      listingId,
    });

    return NextResponse.json({
      data: result,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create image upload URLs.";
    const status =
      message === "Unauthenticated request."
        ? 401
        : message === "Agent role is required."
          ? 403
          : message.includes("cannot") || message.includes("not found") || message.includes("before")
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
