/**
 * The claim the badge used to make, now made once about the platform.
 *
 * The point of moving it was that a signed-in seeker saw it nowhere: the
 * value-prop block that carried it is gated on !isSignedIn. So the assertions
 * that matter are about what it says and that it is a platform statement, not
 * a per-listing one.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PlatformTrustLine } from "@/features/listings/components/platform-trust-line";

describe("PlatformTrustLine", () => {
  const html = renderToStaticMarkup(<PlatformTrustLine />);

  it("states the review that actually happens", () => {
    expect(html).toContain(
      "Every agent on Ruvo is reviewed before their listings go live.",
    );
  });

  it("claims review, not identity verification", () => {
    // The distinction the copy corrections turned on: an administrator reviews
    // an agent's documents. Saying "identity-verified" overstated it before a
    // government ID was required, and "verified agents" reads as the badge did.
    expect(html.toLowerCase()).not.toContain("identity");
  });

  it("says nothing about this listing, because it is not about one", () => {
    expect(html.toLowerCase()).not.toContain("this listing");
    expect(html.toLowerCase()).not.toContain("this agent");
  });
});
