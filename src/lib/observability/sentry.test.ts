import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({
      setTag: vi.fn(),
      setUser: vi.fn(),
      setExtras: vi.fn(),
      setLevel: vi.fn(),
    }),
  ),
}));

import { appEnvironment, sentryEnabled } from "@/lib/observability/sentry";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("sentryEnabled", () => {
  it("does not transmit under vitest, where NODE_ENV is 'test'", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
    delete process.env.NEXT_PUBLIC_APP_ENV;

    // NODE_ENV is "test" here. The previous gate was `!== "development"`,
    // which made this true and would have transmitted the whole suite.
    expect(sentryEnabled()).toBe(false);
  });

  it("does not transmit in development", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";
    process.env.NEXT_PUBLIC_APP_ENV = "development";

    expect(sentryEnabled()).toBe(false);
  });

  it("transmits in preview and production when a DSN is present", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.sentry.io/1";

    process.env.NEXT_PUBLIC_APP_ENV = "preview";
    expect(sentryEnabled()).toBe(true);

    process.env.NEXT_PUBLIC_APP_ENV = "production";
    expect(sentryEnabled()).toBe(true);
  });

  it("does not transmit in production without a DSN", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    process.env.NEXT_PUBLIC_APP_ENV = "production";

    expect(sentryEnabled()).toBe(false);
  });

  it("reports the environment name for tagging", () => {
    process.env.NEXT_PUBLIC_APP_ENV = "preview";
    expect(appEnvironment()).toBe("preview");
  });
});
