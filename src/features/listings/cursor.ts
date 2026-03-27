import type { ListingCursor } from "@/features/listings/types";

export function encodeListingCursor(cursor: ListingCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeListingCursor(value: string): ListingCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as ListingCursor;

    if (!parsed.lastId || !parsed.lastValue || !parsed.sort) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
