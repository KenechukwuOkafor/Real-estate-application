import { afterEach, describe, expect, it, vi } from "vitest";

import { isDevAuthEnabled } from "@/lib/auth/dev-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDevAuthEnabled", () => {
  it("is false in production even when the server flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(false);
  });

  it("is false in production even when the public flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(false);
  });

  it("is true in development when the server flag is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(true);
  });

  it("is false in development when no flag is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_AUTH", "");

    expect(isDevAuthEnabled()).toBe(false);
  });

  it("is false when only the client-exposed flag is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_AUTH", "true");

    expect(isDevAuthEnabled()).toBe(false);
  });
});
