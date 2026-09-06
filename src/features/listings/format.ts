export function formatPriceNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatPropertyType(value: string) {
  const labels: Record<string, string> = {
    "1_bedroom": "1 Bedroom",
    "2_bedroom": "2 Bedroom",
    "3_bedroom": "3 Bedroom",
    lodge_room: "Lodge Room",
    self_contain: "Self Contain",
    shop: "Shop",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

/**
 * The agent-facing name of a status, which is not always the enum's name.
 *
 * `rented` reads "Taken" because not everything on Ruvo is residential — shop
 * is a property type — and "rented" is wrong for half of them. "Taken" is also
 * what a student actually says about a room that has gone.
 *
 * `archived` reads "Removed" rather than the older "Taken down", which now
 * collides: those two states are opposite in consequence — one is turnover,
 * the other is permanent and costs a slot to undo — and telling them apart by
 * one word is telling them apart by nothing.
 */
export function formatListingStatus(value: string) {
  const labels: Record<string, string> = {
    approved: "Approved",
    archived: "Removed",
    draft: "Draft",
    flagged: "Flagged",
    pending_review: "Pending Review",
    rejected: "Rejected",
    rented: "Taken",
    under_dispute: "Under Dispute",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function buildListingHref(slug: string, publicId: string) {
  return `/listings/${slug}--${publicId}`;
}
