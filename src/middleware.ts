import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { DEV_AUTH_COOKIE_NAME, isDevAuthEnabled } from "@/lib/auth/dev-auth";

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
    if (isDevAuthEnabled() && req.cookies.get(DEV_AUTH_COOKIE_NAME)?.value) {
      return;
    }

    await auth.protect();
  }
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
