import type { RentalDuration } from "@/features/listings/rental-duration";

export type ListingSort = "newest" | "price_asc" | "price_desc";

export type ListingListFilters = {
  area?: string;
  bedrooms?: number;
  city?: string;
  cursor?: string;
  limit: number;
  maxPrice?: number;
  minPrice?: number;
  propertyType?:
    | "self_contain"
    | "1_bedroom"
    | "2_bedroom"
    | "3_bedroom"
    | "shop"
    | "lodge_room";
  sort: ListingSort;
  state?: string;
  verifiedOnly?: boolean;
};

export type ListingCursor = {
  lastId: string;
  lastValue: number | string;
  sort: ListingSort;
};

export type ListingListItem = {
  id: string;
  publicId: string;
  slug: string;
  title: string;
  propertyType: string;
  rentalDuration: RentalDuration;
  /** Months. Non-null if and only if `rentalDuration` is `sublet`. */
  subletMonths: number | null;
  priceNaira: number;
  bedrooms: number;
  bathrooms: number;
  area: string;
  city: string;
  state: string;
  /** Signed at render time; null when the caller may not read it. */
  coverImageUrl: string | null;
  coverImageStoragePath: string | null;
  approvedAt: string | null;
  agent: {
    displayName: string;
    isVerified: boolean;
  };
};

export type ListingDetail = ListingListItem & {
  country: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  amenities: string[];
  videoUrl: string | null;
  images: Array<{
    id: string;
    url: string | null;
  storagePath: string;
    position: number;
    isCover: boolean;
  }>;
  share: {
    canonicalUrl: string;
  };
  status: "approved";
};

export type ListingListResult = {
  items: ListingListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};
