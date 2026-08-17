import { NextResponse } from "next/server";

import {
  DEV_AUTH_COOKIE_NAME,
  getDevAuthUserByClerkUserId,
  isDevAuthEnabled,
} from "@/lib/auth/dev-auth";
import { routeErrorResponse } from "@/lib/api/errors";
import { getRequestId } from "@/lib/api/request-id";

export async function POST(request: Request) {
  const requestId = await getRequestId();

  try {
    return await handleDevAuthLogin(request);
  } catch (error) {
    return routeErrorResponse(error, requestId);
  }
}

async function handleDevAuthLogin(request: Request) {
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

  const body = ((await request.json().catch(() => null)) ?? {}) as {
    clerkUserId?: string;
  };
  const user = getDevAuthUserByClerkUserId(body.clerkUserId ?? null);

  if (!user) {
    return NextResponse.json(
      {
        error: {
          message: "Unknown development user.",
        },
      },
      { status: 422 },
    );
  }

  const response = NextResponse.json({
    data: {
      clerkUserId: user.clerkUserId,
      email: user.email,
      roles: user.roles,
    },
  });

  response.cookies.set(DEV_AUTH_COOKIE_NAME, user.clerkUserId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
