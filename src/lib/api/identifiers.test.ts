/**
 * Path-segment identifier validation.
 *
 * These guard a class of bug rather than one route: a non-UUID reaching a query
 * against a uuid column raises Postgres 22P02, which surfaced as HTTP 500. A
 * crawler requesting a junk path was indistinguishable from the database being
 * down, and the round trip was wasted on a query that could never match.
 */
import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/api/errors";
import { isUuid, requireUuid } from "@/lib/api/identifiers";

describe("isUuid", () => {
  it("accepts a canonical uuid", () => {
    expect(isUuid("20887cbf-53fc-4c45-adb2-c5d4d33cf001")).toBe(true);
  });

  it("accepts uppercase, since Postgres compares case-insensitively", () => {
    expect(isUuid("20887CBF-53FC-4C45-ADB2-C5D4D33CF001")).toBe(true);
  });

  it("accepts a uuidv7, because the schema mixes v4 and v7", () => {
    // Version nibble 7. Rejecting it would break every jobs and media path.
    expect(isUuid("01a018bc-ee56-7c29-b6de-5e43ce3e2777")).toBe(true);
  });

  it.each([
    ["a crawler path", "robots.txt"],
    ["a stringified undefined", "undefined"],
    ["traversal", "../../etc/passwd"],
    ["empty", ""],
    ["a bare slug", "clean-self-contain-odenigbo"],
    ["missing a group", "20887cbf-53fc-4c45-c5d4d33cf001"],
    ["a non-hex character", "20887cbg-53fc-4c45-adb2-c5d4d33cf001"],
    ["trailing whitespace", "20887cbf-53fc-4c45-adb2-c5d4d33cf001 "],
  ])("rejects %s", (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });

  it("rejects null and undefined without throwing", () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("requireUuid", () => {
  it("returns the value when it is a uuid", () => {
    const id = "20887cbf-53fc-4c45-adb2-c5d4d33cf001";
    expect(requireUuid(id, "Listing")).toBe(id);
  });

  it("throws a 404, not a 400 or a 500", () => {
    // 404 deliberately. Several of these routes are reachable without a
    // session, and answering differently for "malformed" than for "unknown"
    // would let an anonymous caller probe for existence.
    expect(() => requireUuid("robots.txt", "Listing")).toThrow(AppError);

    try {
      requireUuid("robots.txt", "Listing");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).httpStatus).toBe(404);
      expect((error as AppError).code).toBe("NOT_FOUND");
    }
  });

  it("names the resource without echoing the input back", () => {
    // The rejected value is attacker-controlled and must not be reflected.
    try {
      requireUuid("<script>alert(1)</script>", "Chat");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as AppError).message).toBe("Chat not found.");
      expect((error as AppError).message).not.toContain("script");
    }
  });
});
