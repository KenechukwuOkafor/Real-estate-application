import "server-only";

import { assertMachineRequestAuthorized } from "@/server/jobs/authorize-machine-request";

/**
 * Authorizes a drain invocation.
 *
 * ADR-032 requires only that the route "is authenticated and cannot be invoked
 * by an anonymous caller". The mechanism is shared with the monitoring route —
 * see assertMachineRequestAuthorized for why a bearer secret rather than a
 * session, and why it fails closed. This wrapper keeps the drain's own
 * environment variable named at the drain's own call site.
 */
export function assertDrainRequestAuthorized(request: Request) {
  assertMachineRequestAuthorized(request, "JOBS_DRAIN_SECRET");
}
