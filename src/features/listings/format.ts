export function formatPriceNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatPropertyType(value: string) {
  return value.replaceAll("_", " ");
}

export function buildListingHref(slug: string, publicId: string) {
  return `/listings/${slug}--${publicId}`;
}
