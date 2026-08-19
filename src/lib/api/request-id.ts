import { headers } from "next/headers";

import { currentRequestId, enterContext } from "@/lib/observability/context";

/**
 * The correlation id for this request, and the point at which logging context
 * begins to exist.
 *
 * BR-OBS-001 (Critical). Middleware guarantees the `x-request-id` header, so
 * this reads one stable value rather than minting a new one — the previous
 * implementation called crypto.randomUUID() on every invocation, which meant
 * two calls in the same request produced two different "request" ids and
 * correlation was impossible by construction.
 *
 * Calling this also seeds the async context, so everything downstream — service,
 * repository, the enqueue of a job — can log against the same id without having
 * it threaded through its signature. Route handlers already call it first, so
 * they gain correlation without being restructured.
 *
 * The fallback matters: middleware does not run in tests or in scripts, and a
 * missing header must not throw. Losing an id is a degraded log line; throwing
 * would be a failed request.
 */
export async function getRequestId() {
  const existing = currentRequestId();

  if (existing) {
    return existing;
  }

  const headerStore = await headers();
  const requestId = headerStore.get("x-request-id") ?? crypto.randomUUID();

  enterContext({ requestId, service: "api" });

  return requestId;
}
