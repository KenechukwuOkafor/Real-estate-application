/**
 * The response rate as a public agent profile renders it.
 *
 * The counting is done by agent_response_rate() in the database, against the
 * same read-time expiry rule the dashboard uses: an agent who ignores requests
 * cannot score 100% by leaving them at 'requested' forever. This module is
 * only the decision about whether to show the result, and in what words.
 *
 * That separation is deliberate. The threshold below is a rendering judgement
 * and a later caller may want a different one; the counting rule is a fact
 * about what a reply is and must not vary by surface.
 */

/**
 * Below ten answerable requests, nothing is rendered.
 *
 * Ten rather than five because at n=5 a single missed request swings a public
 * number from 100% to 80%, which overstates what one event means about a
 * person — and this number is attached to their name in front of strangers.
 *
 * The gate is on the DENOMINATOR. An agent with twelve answerable requests who
 * replied to two has earned a published 2 of 12; gating on the numerator would
 * hide exactly the record the number exists to show.
 */
export const PUBLIC_RESPONSE_RATE_MINIMUM = 10;

export type PublicResponseRate = {
  answerable: number;
  answered: number;
  label: string;
};

/**
 * The rendered rate, or null when there is not enough of a record to publish.
 *
 * NULL MEANS RENDER NOTHING — not a placeholder, not "no data yet", not a
 * chip. An absent element reads as neutral. A "not enough data" badge reads as
 * a warning about an agent who has done nothing wrong, and it would sit on the
 * profile of every agent in their first month, which is when they most need
 * the page to work for them.
 */
export function publicResponseRate({
  answerable,
  answered,
  minimum = PUBLIC_RESPONSE_RATE_MINIMUM,
}: {
  answerable: number;
  answered: number;
  minimum?: number;
}): PublicResponseRate | null {
  if (answered > answerable) {
    throw new Error(
      `responded to ${answered} of ${answerable}: the numerator cannot exceed the denominator`,
    );
  }

  if (answerable < minimum) {
    return null;
  }

  /**
   * A FRACTION, NOT A PERCENTAGE.
   *
   * "90%" hides its sample size, and a percentage on a trust page invites
   * comparison against a scale nobody has been given. "9 of 10" carries the
   * denominator with it, so a stranger can see how much evidence is behind it.
   *
   * The copy says REPLIED, and says nothing about outcomes, because that is
   * all this measures. An agent who accepts everything and completes nothing
   * scores here exactly as well as one who does the work — the completion
   * signal is a different number and is deliberately still private.
   */
  return {
    answerable,
    answered,
    label: `Replied to ${answered} of ${answerable} request${answerable === 1 ? "" : "s"}`,
  };
}
