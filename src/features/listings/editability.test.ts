import { describe, expect, it } from "vitest";

import {
  EDITABLE_LISTING_STATUSES,
  isListingEditable,
  isListingRevisable,
  REVISABLE_LISTING_STATUSES,
} from "@/features/listings/editability";

/**
 * The point of these is the negative half.
 *
 * Asserting that a draft is editable is nearly free. Asserting that approved,
 * pending_review, flagged and under_dispute are NOT is what stops the list from
 * being widened casually — the surfaces read this predicate, so adding a status
 * here silently grants an edit on a live listing or one under review.
 */
describe("isListingEditable", () => {
  it.each(["draft", "rejected"] as const)("allows %s", (status) => {
    expect(isListingEditable(status)).toBe(true);
  });

  // The reason travels in the test name, so a failure says why the status was
  // meant to be refused rather than only which one.
  it.each([
    {
      status: "pending_review",
      why: "sits in a queue; editing changes what is being reviewed",
    },
    { status: "approved", why: "is live inventory a seeker may have acted on" },
    { status: "flagged", why: "is where editing the evidence is the risk" },
    { status: "under_dispute", why: "is under investigation" },
    { status: "archived", why: "is finished" },
    {
      status: "rented",
      why: "was reviewed, and returns to approved with no re-review",
    },
  ] as const)("refuses $status, which $why", ({ status }) => {
    expect(isListingEditable(status)).toBe(false);
  });

  it("refuses a status it has never heard of", () => {
    expect(isListingEditable("something_new")).toBe(false);
  });

  // A guard against the list growing without anyone noticing in review.
  it("permits exactly two statuses", () => {
    expect([...EDITABLE_LISTING_STATUSES]).toEqual(["draft", "rejected"]);
  });
});

/**
 * The other half of the same rule, and the one that keeps a rented listing
 * correctable.
 *
 * These two lists must stay disjoint. A status in both would mean an agent can
 * write it directly AND propose changes to it, and for `rented` specifically
 * the direct write is the hole: marking a listing available returns it to
 * approved unreviewed, which is safe only while its content cannot have moved.
 * See migration 0036.
 */
describe("isListingRevisable", () => {
  it.each(["approved", "rented"] as const)("allows %s", (status) => {
    expect(isListingRevisable(status)).toBe(true);
  });

  it.each([
    { status: "draft", why: "is edited directly, not proposed" },
    { status: "rejected", why: "is edited directly, not proposed" },
    { status: "pending_review", why: "is already in front of a moderator" },
    { status: "flagged", why: "is frozen, and revising it is the evidence moving" },
    { status: "under_dispute", why: "is under investigation" },
    { status: "archived", why: "is finished" },
  ] as const)("refuses $status, which $why", ({ status }) => {
    expect(isListingRevisable(status)).toBe(false);
  });

  it("permits exactly two statuses", () => {
    expect([...REVISABLE_LISTING_STATUSES]).toEqual(["approved", "rented"]);
  });

  /**
   * The invariant, asserted rather than assumed. If `rented` ever appears in
   * both lists, the flip back to approved starts publishing content no
   * moderator saw — and that would otherwise be discovered in production.
   */
  it("shares no status with the directly-editable list", () => {
    const overlap = REVISABLE_LISTING_STATUSES.filter((status) =>
      (EDITABLE_LISTING_STATUSES as readonly string[]).includes(status),
    );

    expect(overlap).toEqual([]);
  });
});
