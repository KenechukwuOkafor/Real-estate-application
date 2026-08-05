"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { HOME_PROPERTY_TYPES } from "@/features/listings/suggestions";

export function PropertyTypeTiles() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL is the single source of truth. The tiles hold no local state, so
  // they cannot disagree with the filter drawer — both read and write this
  // same parameter.
  const selectedType = searchParams.get("propertyType");

  function selectType(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (selectedType === value) {
      params.delete("propertyType");
    } else {
      params.set("propertyType", value);
    }

    params.delete("cursor");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {HOME_PROPERTY_TYPES.map((type) => {
        const isSelected = selectedType === type.value;

        return (
          <button
            aria-pressed={isSelected}
            className={`rounded-2xl border px-2 py-3 text-center transition-colors ${
              isSelected
                ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                : "border-stone-900/12 bg-white text-stone-700"
            }`}
            key={type.value}
            onClick={() => selectType(type.value)}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="mx-auto h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              viewBox="0 0 24 24"
            >
              {type.icon === "door" ? (
                <>
                  <path d="M6 3h12v18H6z" />
                  <circle cx="14.5" cy="12" r="0.9" fill="currentColor" stroke="none" />
                </>
              ) : null}
              {type.icon === "bed" ? (
                <>
                  <path d="M3 17v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5" strokeLinecap="round" />
                  <path d="M3 17h18M7 10V7h5v3" strokeLinecap="round" />
                </>
              ) : null}
              {type.icon === "building" ? (
                <>
                  <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                  <path d="M16 10h2a2 2 0 0 1 2 2v9M8 8h4M8 12h4M8 16h4" strokeLinecap="round" />
                </>
              ) : null}
            </svg>
            <span className="mt-1.5 block text-xs font-medium">{type.label}</span>
          </button>
        );
      })}
    </div>
  );
}
