import type { Database } from "@/types/database";

export type RentalDuration = Database["public"]["Enums"]["rental_duration"];

/**
 * How a listing's duration reads beside its price.
 *
 * This module replaces rent-period.ts, which exported a single constant
 * `RENT_PERIOD_LABEL = "per year"`. That label was hardcoded because no column
 * existed to read, and it was correct only because every listing was annual.
 * The file said as much in its own comment: the first monthly listing would
 * have displayed incorrectly. Nothing here decides what a listing is any more —
 * it reads what the agent set.
 *
 * The name changed with the module. "rent period" described a recurring term,
 * which a sublet is not: a sublet is a fixed run of months, and calling its
 * length a period invites the same conflation the schema now forbids.
 */

/**
 * The suffix shown next to a price.
 *
 * Yearly and monthly are recurring terms and read as rates. A sublet is a fixed
 * length and reads as a quantity, because that is what it is — "4 months" is
 * the offer, not the billing interval.
 */
export function formatRentalDuration(
  duration: RentalDuration,
  subletMonths: number | null,
) {
  if (duration === "monthly") {
    return "per month";
  }

  if (duration === "sublet") {
    // A sublet with no month count cannot be stored — the CHECK constraint
    // refuses it — so this fallback is unreachable through the database. It
    // exists because this function is also reachable from a component rendering
    // data that has not been through it, and "sublet" is at least true.
    if (subletMonths === null) {
      return "sublet";
    }

    return `${subletMonths} ${subletMonths === 1 ? "month" : "months"}`;
  }

  return "per year";
}

/**
 * The heading above a price on the listing detail page.
 *
 * Previously the literal "Annual price", duplicated from the card's label and
 * wrong for the same reason.
 */
export function formatRentalPriceHeading(duration: RentalDuration) {
  if (duration === "monthly") {
    return "Monthly price";
  }

  if (duration === "sublet") {
    return "Sublet price";
  }

  return "Annual price";
}

/**
 * The type line on a card.
 *
 * A sublet is a materially different offer from a normal tenancy — it is
 * someone else's lease for a fixed run of months — and a seeker should not have
 * to infer that from the price suffix alone. The type line is where the kind of
 * property is already stated, so the kind of arrangement belongs beside it.
 *
 * Nothing is added for yearly or monthly: those are the ordinary case, and
 * labelling them would be noise that makes the sublet marker less visible.
 */
export function formatListingTypeLine(
  propertyTypeLabel: string,
  duration: RentalDuration,
) {
  return duration === "sublet" ? `${propertyTypeLabel} · Sublet` : propertyTypeLabel;
}

/**
 * Where a sublet length stops being plausible.
 *
 * There is deliberately no database cap: where a sublet stops being a sublet
 * and becomes a tenancy is a product judgement with no evidence behind it, and
 * a CHECK would be a constraint nobody decided. But 500 months is storable and
 * also obviously a typo, and the agent typing it is the only person in the
 * system who knows what they meant.
 *
 * Two years rather than one. A sublet running longer than a year is unusual but
 * real — an academic year plus a summer, a posting that runs long — and warning
 * on those would train agents to dismiss the warning, which is how a warning
 * stops working. Beyond two years the likely explanations are a slipped digit or
 * the price typed into the wrong field.
 */
export const SUBLET_MONTHS_PLAUSIBLE_MAX = 24;

/**
 * A warning, never a block.
 *
 * Returns null when there is nothing to say. The caller renders the string; it
 * must not prevent submission, because the platform's job is to display what the
 * agent set and an unusual sublet is still the agent's to declare.
 */
export function subletLengthWarning(months: number | null): string | null {
  if (months === null || !Number.isFinite(months)) {
    return null;
  }

  if (months <= SUBLET_MONTHS_PLAUSIBLE_MAX) {
    return null;
  }

  const years = Math.floor(months / 12);

  return `${months} months is about ${years} years. Sublets are usually a few months — check this is what you meant. You can still publish it.`;
}
