import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * BR-OBS-001 (Critical): every request receives a Request ID.
 *
 * Minted here because middleware is the only thing guaranteed to run before
 * everything else — route handlers, Server Components, and Next's own error
 * paths all sit downstream of it. Generating the id lower down would mean a
 * request that fails early has no id at all, which is exactly the request worth
 * correlating.
 *
 * An inbound `x-request-id` is honoured so a load balancer or an internal
 * caller can supply its own trace id and have our logs join theirs. It is
 * length-capped and character-restricted: the value ends up in log lines and in
 * a response header, and neither should carry arbitrary caller-controlled text.
 */
const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

function resolveRequestId(inbound: string | null) {
  return inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : crypto.randomUUID();
}

const isProtectedRoute = createRouteMatcher([
  "/agent(.*)",
  "/dashboard(.*)",
  "/onboarding(.*)",
  "/agent(.*)",
  "/admin(.*)",
  "/api/agent(.*)",
  "/api/admin(.*)",
  "/api/chats(.*)",
  "/api/inspection-requests(.*)",
  "/api/me(.*)",
  "/api/reports(.*)",
  "/api/saved-listings(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    // No dev-auth bypass. The persona switcher produces a real Clerk session,
    // so protected routes are protected identically in every environment —
    // the bypass existed only to wave through a fabricated cookie.
    await auth.protect();
  }

  const requestId = resolveRequestId(req.headers.get(REQUEST_ID_HEADER));

  // Forwarded inward so getRequestId() reads one stable value per request, and
  // echoed outward so a user reporting a problem can quote the id that ties
  // their report to our logs.
  const headers = new Headers(req.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/",
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path. Must come after the API/TRPC matcher, and must
    // not be caught by the negative lookahead above.
    "/__clerk/:path*",
  ],
};
