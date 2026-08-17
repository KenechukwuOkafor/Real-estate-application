import { NextResponse } from "next/server";

import { DEV_AUTH_COOKIE_NAME, isDevAuthEnabled } from "@/lib/auth/dev-auth";
import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";

export async function POST() {
  const requestId = await getRequestId();

  try {
    return await handleDevAuthLogout();
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

async function handleDevAuthLogout() {
  if (!isDevAuthEnabled()) {
    return NextResponse.json(
      {
        error: {
          message: "Development auth is disabled.",
        },
      },
      { status: 404 },
    );
  }

  const response = NextResponse.json({
    data: {
      signedOut: true,
    },
  });

  response.cookies.delete(DEV_AUTH_COOKIE_NAME);

  return response;
}
