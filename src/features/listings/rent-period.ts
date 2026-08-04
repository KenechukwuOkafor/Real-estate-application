/**
 * Hardcoded, deliberately.
 *
 * There is no `rental_frequency` column. Every listing in the database is
 * annual rent, and the Listings domain doc states the MVP targets yearly
 * rentals, so this label is true today — it is simply not enforced by the
 * schema. The first monthly listing will display incorrectly.
 *
 * Phase 1 follow-up: add `rental_frequency` to `listings`, surface it in the
 * agent draft form, and read it here instead of assuming.
 */
export const RENT_PERIOD_LABEL = "per year";
