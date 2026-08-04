import Link from "next/link";

import { formatPriceNaira } from "@/features/listings/format";
import {
  getListingPropertyTypeLabel,
  getListingSortLabel,
} from "@/features/listings/options";
import { buildListingSearchQuery } from "@/features/listings/search-params";
import type { ListingListFilters } from "@/features/listings/types";

type ActiveListingFiltersProps = {
  filters: ListingListFilters;
  listingCount: number;
};

type FilterChip = {
  href: string;
  label: string;
};

function buildFilterChips(filters: ListingListFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.area) {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        area: undefined,
        cursor: undefined,
      })}`,
      label: `Area: ${filters.area}`,
    });
  }

  if (filters.propertyType) {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        cursor: undefined,
        propertyType: undefined,
      })}`,
      label: `Type: ${getListingPropertyTypeLabel(filters.propertyType)}`,
    });
  }

  if (typeof filters.bedrooms === "number") {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        bedrooms: undefined,
        cursor: undefined,
      })}`,
      label: `Bedrooms: ${filters.bedrooms}`,
    });
  }

  if (typeof filters.minPrice === "number") {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        cursor: undefined,
        minPrice: undefined,
      })}`,
      label: `Min: ${formatPriceNaira(filters.minPrice)}`,
    });
  }

  if (typeof filters.maxPrice === "number") {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        cursor: undefined,
        maxPrice: undefined,
      })}`,
      label: `Max: ${formatPriceNaira(filters.maxPrice)}`,
    });
  }

  if (filters.city) {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        city: undefined,
        cursor: undefined,
      })}`,
      label: `City: ${filters.city}`,
    });
  }

  if (filters.state) {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        cursor: undefined,
        state: undefined,
      })}`,
      label: `State: ${filters.state}`,
    });
  }

  if (filters.verifiedOnly) {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        cursor: undefined,
        verifiedOnly: undefined,
      })}`,
      label: "Verified only",
    });
  }

  if (filters.sort !== "newest") {
    chips.push({
      href: `/listings?${buildListingSearchQuery(filters, {
        cursor: undefined,
        sort: "newest",
      })}`,
      label: `Sort: ${getListingSortLabel(filters.sort)}`,
    });
  }

  return chips;
}

export function ActiveListingFilters({
  filters,
  listingCount,
}: ActiveListingFiltersProps) {
  const chips = buildFilterChips(filters);
  const hasActiveFilters = chips.length > 0;

  return (
    <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">
              {listingCount} listing{listingCount === 1 ? "" : "s"}
              {hasActiveFilters ? " matched" : " available"}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {hasActiveFilters
                ? "Filtered results — click any tag below to remove it."
                : "All verified listings in Nsukka, newest first."}
            </p>
          </div>

          <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600">
            {getListingSortLabel(filters.sort)}
          </span>
        </div>

        {hasActiveFilters ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Link
                key={chip.label}
                className="rounded-full border border-stone-900/10 bg-stone-50 px-3.5 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100"
                href={chip.href}
              >
                {chip.label} ×
              </Link>
            ))}
            <Link
              className="rounded-full bg-stone-900 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
              href="/listings"
            >
              Clear all
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
