"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  HOME_PROPERTY_TYPES,
  PRICE_BANDS,
} from "@/features/listings/suggestions";

type ListingSuggestionSheetProps = {
  areas: string[];
  onClose: () => void;
};

const SELECTED_CLASSES = "border-emerald-600 bg-emerald-50 text-emerald-900";
const UNSELECTED_CLASSES = "border-stone-900/15 text-stone-800";

export function ListingSuggestionSheet({
  areas,
  onClose,
}: ListingSuggestionSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the single source of truth, same as the tiles: read it here
  // to drive selected styling, never cache it in local state.
  const selectedType = searchParams.get("propertyType");
  const selectedArea = searchParams.get("area");
  const selectedMinPrice = searchParams.get("minPrice");
  const selectedMaxPrice = searchParams.get("maxPrice");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function apply(update: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    params.delete("cursor");
    router.push(`?${params.toString()}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/30 md:items-center">
      <div
        aria-label="Narrow your search"
        aria-modal="true"
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-white p-5 md:max-w-lg md:rounded-[1.5rem]"
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">
            Narrow your search
          </h2>
          <button
            className="rounded-full px-3 py-1 text-sm text-stone-600"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <section className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
            Property type
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {HOME_PROPERTY_TYPES.map((type) => {
              const isSelected = selectedType === type.value;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    isSelected ? SELECTED_CLASSES : UNSELECTED_CLASSES
                  }`}
                  key={type.value}
                  onClick={() => apply({ propertyType: type.value })}
                  type="button"
                >
                  {type.label}
                </button>
              );
            })}
          </div>
        </section>

        {areas.length > 0 ? (
          <section className="mt-5">
            <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
              Area
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {areas.map((area) => {
                const isSelected = selectedArea === area;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={`rounded-full border px-4 py-2 text-sm ${
                      isSelected ? SELECTED_CLASSES : UNSELECTED_CLASSES
                    }`}
                    key={area}
                    onClick={() =>
                      apply({ area: isSelected ? undefined : area })
                    }
                    type="button"
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
            Budget
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRICE_BANDS.map((band) => {
              const bandMinPrice = band.minPrice ? String(band.minPrice) : null;
              const bandMaxPrice = band.maxPrice ? String(band.maxPrice) : null;
              const isSelected =
                bandMinPrice === selectedMinPrice &&
                bandMaxPrice === selectedMaxPrice;

              return (
                <button
                  aria-pressed={isSelected}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    isSelected ? SELECTED_CLASSES : UNSELECTED_CLASSES
                  }`}
                  key={band.label}
                  onClick={() =>
                    apply(
                      isSelected
                        ? { maxPrice: undefined, minPrice: undefined }
                        : {
                            maxPrice: band.maxPrice
                              ? String(band.maxPrice)
                              : undefined,
                            minPrice: band.minPrice
                              ? String(band.minPrice)
                              : undefined,
                          },
                    )
                  }
                  type="button"
                >
                  {band.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
