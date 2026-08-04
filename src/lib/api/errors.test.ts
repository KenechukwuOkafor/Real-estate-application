import { describe, expect, it } from "vitest";

import { AppError, resolveRouteError } from "@/lib/api/errors";

describe("resolveRouteError", () => {
  it("uses the status carried by an AppError", () => {
    const resolved = resolveRouteError(new AppError("TEAPOT", "Nope.", 418));

    expect(resolved).toEqual({
      code: "TEAPOT",
      httpStatus: 418,
      message: "Nope.",
    });
  });

  it("maps unauthenticated requests to 401", () => {
    expect(resolveRouteError(new Error("Unauthenticated request."))).toMatchObject({
      code: "UNAUTHENTICATED",
      httpStatus: 401,
    });
  });

  it("maps a missing role to 403", () => {
    expect(resolveRouteError(new Error("Admin role is required."))).toMatchObject({
      code: "UNAUTHORIZED",
      httpStatus: 403,
    });
  });

  it("maps not-found messages to 404", () => {
    expect(resolveRouteError(new Error("Listing not found."))).toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
    });
  });

  it("maps an unverified agent to 403", () => {
    expect(resolveRouteError(new Error("AGENT_NOT_VERIFIED"))).toMatchObject({
      code: "AGENT_NOT_VERIFIED",
      httpStatus: 403,
    });
  });

  it("falls back to 500 for unrecognised messages", () => {
    expect(resolveRouteError(new Error("kaboom"))).toMatchObject({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
    });
  });
});
