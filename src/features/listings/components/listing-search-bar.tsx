"use client";

import { useState } from "react";

import { ListingSuggestionSheet } from "@/features/listings/components/listing-suggestion-sheet";

type ListingSearchBarProps = {
  activeFilterCount: number;
  areas: string[];
};

export function ListingSearchBar({
  activeFilterCount,
  areas,
}: ListingSearchBarProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  return (
    <>
      {/*
        Deliberately a button, not an input. Free-text search does not exist in
        the backend, and a keyboard field would imply it does. Tapping opens a
        sheet of areas, types and price bands instead.
      */}
      <button
        className="mx-auto flex h-12 w-full max-w-[600px] items-center gap-3 rounded-full border border-stone-900/15 bg-white px-4 text-left shadow-sm"
        onClick={() => setIsSheetOpen(true)}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-stone-500"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>

        <span className="flex-1 text-sm text-stone-500">Area, type or price</span>

        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-700">
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
          >
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-medium text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </span>
      </button>

      {isSheetOpen ? (
        <ListingSuggestionSheet
          areas={areas}
          onClose={() => setIsSheetOpen(false)}
        />
      ) : null}
    </>
  );
}
