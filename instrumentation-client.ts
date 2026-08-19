/**
 * Browser initialisation.
 *
 * ADR-026 requires frontend exceptions as well as backend: a listing page that
 * throws while rendering is invisible server-side, and the user simply sees
 * nothing and leaves.
 */
import * as Sentry from "@sentry/nextjs";

import { baseSentryOptions } from "@/lib/observability/sentry";

Sentry.init({
  ...baseSentryOptions(),

  // Session Replay records the DOM, which on this product means listing
  // photographs, chat messages between a seeker and an agent, and verification
  // forms. Off, deliberately, and not a default to be turned on casually.
  replaysOnErrorSampleRate: 0,
  replaysSessionSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
