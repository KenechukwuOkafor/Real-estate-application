import Link from "next/link";

import {
  listingBedroomOptions,
  listingPropertyTypeOptions,
  listingSortOptions,
} from "@/features/listings/options";
import type { ListingListFilters } from "@/features/listings/types";

type ListingFiltersProps = {
  filters: ListingListFilters;
};

function inputClassName() {
  return "h-12 rounded-2xl border border-stone-900/10 bg-white px-4 text-sm text-stone-900 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-900/30";
}

export function ListingFilters({ filters }: ListingFiltersProps) {
  return (
    <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-stone-500">
              Filters
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              Filter listings
            </h2>
          </div>

          <Link
            className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700"
            href="/listings"
          >
            Clear all
          </Link>
        </div>

        <form action="/listings" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input name="limit" type="hidden" value={filters.limit} />

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>Area</span>
            <input
              className={inputClassName()}
              defaultValue={filters.area ?? ""}
              name="area"
              placeholder="Odenigbo, Hilltop..."
              type="text"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>Property type</span>
            <select
              className={inputClassName()}
              defaultValue={filters.propertyType ?? ""}
              name="propertyType"
            >
              {listingPropertyTypeOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>Bedrooms</span>
            <select
              className={inputClassName()}
              defaultValue={
                typeof filters.bedrooms === "number" ? String(filters.bedrooms) : ""
              }
              name="bedrooms"
            >
              {listingBedroomOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>Sort</span>
            <select
              className={inputClassName()}
              defaultValue={filters.sort}
              name="sort"
            >
              {listingSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>Min price (₦)</span>
            <input
              className={inputClassName()}
              defaultValue={filters.minPrice ?? ""}
              min={0}
              name="minPrice"
              placeholder="e.g. 100000"
              type="number"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>Max price (₦)</span>
            <input
              className={inputClassName()}
              defaultValue={filters.maxPrice ?? ""}
              min={0}
              name="maxPrice"
              placeholder="e.g. 800000"
              type="number"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>City</span>
            <input
              className={inputClassName()}
              defaultValue={filters.city ?? ""}
              name="city"
              placeholder="Nsukka"
              type="text"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-stone-600">
            <span>State</span>
            <input
              className={inputClassName()}
              defaultValue={filters.state ?? ""}
              name="state"
              placeholder="Enugu"
              type="text"
            />
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700">
            <input
              defaultChecked={filters.verifiedOnly === true}
              name="verifiedOnly"
              type="checkbox"
              value="true"
            />
            Verified agents only
          </label>

          <button
            className="h-12 rounded-2xl bg-stone-900 px-5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            type="submit"
          >
            Apply filters
          </button>
        </form>
      </div>
    </section>
  );
}
