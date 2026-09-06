import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { createCurrentAgentAvatarUploadTarget } from "@/server/services/agent-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      contentType?: string;
      fileName?: string;
    };

    const upload = await createCurrentAgentAvatarUploadTarget({
      contentType: body.contentType ?? "",
      fileName: body.fileName ?? "avatar.webp",
    });

    return NextResponse.json({
      data: upload,
      meta: createApiMeta(requestId),
    });
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
