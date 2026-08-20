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
