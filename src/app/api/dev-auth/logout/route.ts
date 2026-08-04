import { NextResponse } from "next/server";

import { DEV_AUTH_COOKIE_NAME, isDevAuthEnabled } from "@/lib/auth/dev-auth";

export async function POST() {
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
