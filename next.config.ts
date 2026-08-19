import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

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
export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  widenClientFileUpload: true,
});
