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

  it("passes an AppError through with its own code and status", () => {
    expect(
      resolveRouteError(new AppError("SOME_CODE", "Some message.", 418)),
    ).toMatchObject({ code: "SOME_CODE", httpStatus: 418, message: "Some message." });
  });

  // These previously resolved to 500 because their wording missed every
  // string-matching branch. They are typed at the throw site now; the
  // assertions below pin the contract so a future reword cannot silently
  // turn a client error back into a server error.
  it("maps a validation failure whose wording matches no pattern", () => {
    expect(
      resolveRouteError(
        new AppError(
          "VALIDATION_ERROR",
          "Self contain listings must have 1 bedroom and 1 bathroom.",
          422,
        ),
      ),
    ).toMatchObject({ code: "VALIDATION_ERROR", httpStatus: 422 });
  });

  it("still maps an explicit ownership denial to 403, not 500", () => {
    // INSPECTION_NOT_OWNED is now largely unreachable: RLS denies the read
    // first, so an agent asking about another agent's request gets 404. The
    // branch is retained as defence in depth if a policy change ever widens
    // the read, and this pins its mapping for that case.
    expect(
      resolveRouteError(
        new AppError(
          "INSPECTION_NOT_OWNED",
          "This inspection request belongs to another agent.",
          403,
        ),
      ),
    ).toMatchObject({ code: "INSPECTION_NOT_OWNED", httpStatus: 403 });
  });

  it("keeps verification state errors out of the listing namespace", () => {
    // "Verification cannot be reviewed from status X" matches the resolver's
    // includes("cannot be") branch, which would label it
    // LISTING_STATE_TRANSITION_INVALID. Typing it at the throw site wins
    // because AppError is checked first.
    expect(
      resolveRouteError(
        new AppError(
          "VERIFICATION_STATE_TRANSITION_INVALID",
          "Verification cannot be reviewed from status verified.",
          422,
        ),
      ),
    ).toMatchObject({
      code: "VERIFICATION_STATE_TRANSITION_INVALID",
      httpStatus: 422,
    });
  });

  it("maps a compare-and-set loss to 409", () => {
    expect(resolveRouteError(new Error("LISTING_STATE_CONFLICT"))).toMatchObject({
      code: "LISTING_STATE_CONFLICT",
      httpStatus: 409,
    });
  });

  it("falls back to 500 for unrecognised messages", () => {
    expect(resolveRouteError(new Error("kaboom"))).toMatchObject({
      code: "INTERNAL_ERROR",
      httpStatus: 500,
    });
  });
});
