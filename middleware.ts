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
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|.*\\..*).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
