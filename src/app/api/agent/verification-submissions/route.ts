import { NextResponse } from "next/server";

import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";
import { createApiMeta } from "@/lib/api/response";
import { submitCurrentAgentVerification } from "@/server/services/agent-service";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      documents?: Array<{ type?: string; url?: string }>;
      fullLegalName?: string;
      notes?: string;
    };

    const result = await submitCurrentAgentVerification({
      documents: (body.documents ?? []).map((item) => ({
        type: item.type ?? "",
        url: item.url ?? "",
      })),
      fullLegalName: body.fullLegalName ?? "",
      notes: body.notes,
    });

    return NextResponse.json(
      {
        data: {
          status: result.agentProfile.verification_status,
        },
        meta: createApiMeta(requestId),
      },
      { status: 201 },
    );
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}
