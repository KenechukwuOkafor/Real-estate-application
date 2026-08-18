import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
