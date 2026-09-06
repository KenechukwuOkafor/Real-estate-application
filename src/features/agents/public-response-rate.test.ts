import { describe, expect, it } from "vitest";

import {
  PUBLIC_RESPONSE_RATE_MINIMUM,
  publicResponseRate,
} from "@/features/agents/public-response-rate";

describe("publicResponseRate", () => {
  it("renders a fraction, not a percentage", () => {
    // "90%" invites comparison against a number nobody else on the page has.
    // "9 of 10" carries its own sample size, which is the honest thing to give
    // a stranger deciding whether to trust one.
    expect(publicResponseRate({ answered: 9, answerable: 10 })).toEqual({
      answerable: 10,
      answered: 9,
      label: "Replied to 9 of 10 requests",
    });
  });

  it("says request, singular, when the denominator makes it one", () => {
    // Unreachable below the threshold today, but the label is a public string
    // and a threshold is a number someone will change.
    expect(publicResponseRate({ answered: 1, answerable: 1, minimum: 1 })?.label).toBe(
      "Replied to 1 of 1 request",
    );
  });

  it("renders nothing at all below the minimum", () => {
    // Not "no data yet", not a placeholder. An absent element reads as
    // neutral; a "not enough data" chip reads as a warning about somebody who
    // has done nothing wrong.
    expect(publicResponseRate({ answered: 9, answerable: 9 })).toBeNull();
  });

  it("renders at exactly the minimum", () => {
    expect(publicResponseRate({ answered: 10, answerable: 10 })).not.toBeNull();
  });

  it("renders nothing for an agent who has answered nothing", () => {
    expect(publicResponseRate({ answered: 0, answerable: 0 })).toBeNull();
  });

  it("suppresses on the denominator, not the numerator", () => {
    // An agent with twelve answerable requests who replied to two has earned a
    // published 2 of 12. Gating on the numerator would hide exactly the record
    // the number exists to show.
    expect(publicResponseRate({ answered: 2, answerable: 12 })?.label).toBe(
      "Replied to 2 of 12 requests",
    );
  });

  it("uses ten, because five swings too far on one event", () => {
    // At n=5 a single missed request moves a published number from 100% to
    // 80%, which overstates what one event means about a person.
    expect(PUBLIC_RESPONSE_RATE_MINIMUM).toBe(10);
  });

  it("refuses a numerator larger than its denominator", () => {
    // Cannot happen through agent_response_rate, whose numerator is a filtered
    // subset of its denominator. It could happen through a hand-built caller,
    // and a profile page is the wrong place to find out.
    expect(() => publicResponseRate({ answered: 11, answerable: 10 })).toThrow();
  });
});
