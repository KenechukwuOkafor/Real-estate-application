import "server-only";

/**
 * Submission slots granted when an agent's verification is approved.
 *
 * This is the only thing that puts a non-zero free_listing_quota on an agent
 * profile today. Until billing exists (ADR-004 Paystack, ADR-020 subscriptions)
 * it is also the only route to publishing at all, so the grant is what makes a
 * newly verified agent able to submit anything.
 *
 * The number is a product decision, not a documented rule: neither
 * REB-DOM-005 Subscriptions nor ADR-020 mentions a free allowance, and the
 * founding_agent / free_listing_quota columns exist only in the schema. Treat
 * it as provisional and revisit when plans land.
 */
export const VERIFIED_AGENT_LISTING_QUOTA = 3;
