import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { assertSupportContactConfigured } from "./src/lib/support-contact";

const nextConfig: NextConfig = {
  /* config options here */
};

/**
 * Source-map upload.
 *
 * Without it a production browser stack trace is minified, and "improved
 * debugging" from ADR-026 is theoretical for every frontend error — the report
 * arrives, and points at a single line of bundled output.
 *
 * The build SUCCEEDS without SENTRY_AUTH_TOKEN. Upload is skipped rather than
 * fatal, so CI and local builds are unaffected by a missing secret. That is
 * deliberate: a monitoring integration that can fail a build is the same
 * inversion as one that can fail a request.
 *
 * deleteSourcemapsAfterUpload: maps go to Sentry and not into the public
 * bundle. Shipping them would hand the full unminified source to anyone with
 * devtools open.
 */
const sentryWrapped = withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
});

/**
 * The support number is checked HERE, at build, and the build fails without it.
 *
 * The opposite of the Sentry stance above, deliberately. A missing Sentry token
 * costs us readable stack traces; a missing support number puts "Message us on
 * WhatsApp" in front of a suspended agent with nothing behind it, which is the
 * defect src/lib/support-contact.ts exists to close. A build that cannot keep
 * that promise should not ship.
 *
 * Production build only: `next dev` still starts, and the getter reports the
 * problem on the request that needs the number.
 *
 * THE PHASE IS NOT ENOUGH ON ITS OWN. `next typegen` — the first half of
 * `npm run typecheck` — loads this file in PHASE_PRODUCTION_BUILD too. Gated on
 * the phase alone, the check fired during typecheck, surfaced as an unhandled
 * rejection with exit code 0, and silently skipped type generation: a CI job
 * with no support number would have typechecked against stale or missing
 * route types and reported green. So it also requires the `build` command.
 */
export function isProductionBuild(phase: string, argv: readonly string[]): boolean {
  return phase === PHASE_PRODUCTION_BUILD && argv.includes("build");
}

export default function config(phase: string): NextConfig {
  if (isProductionBuild(phase, process.argv)) {
    assertSupportContactConfigured(process.env);
  }

  return sentryWrapped;
}
