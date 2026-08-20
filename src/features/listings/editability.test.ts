import { describe, expect, it } from "vitest";

import {
  EDITABLE_LISTING_STATUSES,
  isListingEditable,
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
