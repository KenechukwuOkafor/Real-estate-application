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

export function formatListingStatus(value: string) {
  const labels: Record<string, string> = {
    approved: "Approved",
    archived: "Archived",
    draft: "Draft",
    flagged: "Flagged",
    pending_review: "Pending Review",
    rejected: "Rejected",
    under_dispute: "Under Dispute",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function buildListingHref(slug: string, publicId: string) {
  return `/listings/${slug}--${publicId}`;
}
