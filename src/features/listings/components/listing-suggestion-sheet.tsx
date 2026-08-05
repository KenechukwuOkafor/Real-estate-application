"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  HOME_PROPERTY_TYPES,
  PRICE_BANDS,
} from "@/features/listings/suggestions";

type ListingSuggestionSheetProps = {
  areas: string[];
  onClose: () => void;
};

export function ListingSuggestionSheet({
  areas,
  onClose,
}: ListingSuggestionSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
      <div className="max-h-[80vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-white p-5 md:max-w-lg md:rounded-[1.5rem]">
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
            {HOME_PROPERTY_TYPES.map((type) => (
              <button
                className="rounded-full border border-stone-900/15 px-4 py-2 text-sm text-stone-800"
                key={type.value}
                onClick={() => apply({ propertyType: type.value })}
                type="button"
              >
                {type.label}
              </button>
            ))}
          </div>
        </section>

        {areas.length > 0 ? (
          <section className="mt-5">
            <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
              Area
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {areas.map((area) => (
                <button
                  className="rounded-full border border-stone-900/15 px-4 py-2 text-sm text-stone-800"
                  key={area}
                  onClick={() => apply({ area })}
                  type="button"
                >
                  {area}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-5">
          <h3 className="text-xs uppercase tracking-[0.18em] text-stone-500">
            Budget
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRICE_BANDS.map((band) => (
              <button
                className="rounded-full border border-stone-900/15 px-4 py-2 text-sm text-stone-800"
                key={band.label}
                onClick={() =>
                  apply({
                    maxPrice: band.maxPrice ? String(band.maxPrice) : undefined,
                    minPrice: band.minPrice ? String(band.minPrice) : undefined,
                  })
                }
                type="button"
              >
                {band.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
