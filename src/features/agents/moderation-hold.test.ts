import { describe, expect, it } from "vitest";

import {
  moderationHold,
  moderationHoldDetail,
  moderationHoldTitle,
} from "@/features/agents/moderation-hold";

const base = { dispute_reason: null, flag_reason: null };

describe("moderationHold", () => {
  it("shows the moderator's flag reason verbatim", () => {
    const hold = moderationHold({
      ...base,
      flag_reason: "Is this still available? Two seekers say it was let in May.",
      status: "flagged",
    });

    expect(hold?.kind).toBe("flagged");
    expect(hold?.reason).toBe("Is this still available? Two seekers say it was let in May.");
  });

  it("shows the dispute reason verbatim", () => {
    const hold = moderationHold({
      ...base,
      dispute_reason: "Another agent has listed the same flat with a signed mandate.",
      status: "under_dispute",
    });

    expect(hold?.kind).toBe("disputed");
    expect(hold?.reason).toBe("Another agent has listed the same flat with a signed mandate.");
  });

  it("does not show a flag reason on a disputed listing, or the reverse", () => {
    // A listing flagged and then disputed keeps its flag_reason; the dispute is
    // the current question and the only one to show.
    expect(
      moderationHold({ dispute_reason: "Ownership", flag_reason: "Old flag", status: "under_dispute" })
        ?.reason,
    ).toBe("Ownership");
  });

  it("says what the hold costs: hidden from seekers, and locked", () => {
    for (const status of ["flagged", "under_dispute"]) {
      const hold = moderationHold({ ...base, status });

      expect(hold?.consequence).toMatch(/hidden from seekers/);
      expect(hold?.consequence).toMatch(/cannot be edited or withdrawn/);
      expect(moderationHoldDetail(hold!)).toMatch(/Hidden from seekers/);
    }
  });

  it("offers a person, because there is nothing to fix in the product", () => {
    for (const status of ["flagged", "under_dispute"]) {
      expect(moderationHold({ ...base, status })?.consequence).toMatch(/WhatsApp/);
    }
  });

  it("treats a flag as a question, not a verdict", () => {
    const hold = moderationHold({ ...base, flag_reason: "Check the price.", status: "flagged" })!;
    const text = `${hold.heading} ${hold.consequence} ${moderationHoldTitle(hold, "Flat")}`;

    expect(hold.heading).toMatch(/question/);
    expect(text).not.toMatch(/\b(wrong|violat|mistake|your fault|penalt|bann?ed)\b/i);
    // And it does not tell them to edit something they cannot edit.
    expect(hold.consequence).toMatch(/do not need to change anything yet/);
  });

  it("says plainly when no reason was recorded rather than showing nothing", () => {
    for (const reason of [null, "", "   "]) {
      expect(moderationHold({ ...base, flag_reason: reason, status: "flagged" })?.reason).toBe(
        "No details were recorded.",
      );
    }
  });

  it("returns nothing for every status that is not a hold", () => {
    for (const status of ["draft", "pending_review", "approved", "rented", "rejected", "archived"]) {
      expect(moderationHold({ ...base, flag_reason: "x", status })).toBeNull();
    }
  });

  it("names the listing in the one-line title", () => {
    const flagged = moderationHold({ ...base, status: "flagged" })!;
    const disputed = moderationHold({ ...base, status: "under_dispute" })!;

    expect(moderationHoldTitle(flagged, "Two Bedroom Flat")).toBe(
      'A moderator has a question about "Two Bedroom Flat"',
    );
    expect(moderationHoldTitle(disputed, "Two Bedroom Flat")).toBe(
      'Ownership of "Two Bedroom Flat" is being checked',
    );
  });
});
