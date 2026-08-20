"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  listingPropertyTypeOptions,
  listingRentalDurationOptions,
} from "@/features/listings/options";
import { errorCopyForResponse } from "@/features/errors/error-copy";
import { subletLengthWarning } from "@/features/listings/rental-duration";

/**
 * One form for creating and for editing.
 *
 * Deliberately not two components. The fields, their validation and the
 * duration pairing are the same in both cases, and a second copy is a second
 * place for them to drift — the edit form quietly missing a field the create
 * form gained is exactly the kind of divergence nobody notices until an agent
 * cannot change something they could set.
 *
 * The only real difference is the request: POST to create, PATCH to update.
 */

export type EditableListing = {
  amenities: string[];
  area: string;
  bathrooms: number;
  bedrooms: number;
  city: string;
  description: string;
  id: string;
  latitude: number | null;
  longitude: number | null;
  priceNaira: number;
  propertyType: string;
  rentalDuration: "yearly" | "monthly" | "sublet";
  state: string;
  subletMonths: number | null;
  title: string;
};

type ListingFormProps = {
  /** Absent when creating. Present when editing an existing draft or rejection. */
  listing?: EditableListing;
};

export function ListingForm({ listing }: ListingFormProps) {
  const router = useRouter();
  const isEditing = Boolean(listing);

  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [propertyType, setPropertyType] = useState<string>(
    listing?.propertyType ?? "self_contain",
  );
  const [rentalDuration, setRentalDuration] = useState<
    "yearly" | "monthly" | "sublet"
  >(listing?.rentalDuration ?? "yearly");
  const [subletMonths, setSubletMonths] = useState(
    listing?.subletMonths ? String(listing.subletMonths) : "6",
  );
  const [priceNaira, setPriceNaira] = useState(
    listing ? String(listing.priceNaira) : "250000",
  );
  const [bedrooms, setBedrooms] = useState(listing ? String(listing.bedrooms) : "1");
  const [bathrooms, setBathrooms] = useState(listing ? String(listing.bathrooms) : "1");
  const [area, setArea] = useState(listing?.area ?? "");
  const [city, setCity] = useState(listing?.city ?? "Nsukka");
  const [state, setState] = useState(listing?.state ?? "Enugu");
  const [latitude, setLatitude] = useState(
    listing?.latitude === null || listing?.latitude === undefined
      ? ""
      : String(listing.latitude),
  );
  const [longitude, setLongitude] = useState(
    listing?.longitude === null || listing?.longitude === undefined
      ? ""
      : String(listing.longitude),
  );
  const [amenities, setAmenities] = useState(
    listing ? listing.amenities.join(", ") : "water, prepaid_meter",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * A warning, never a block.
   *
   * There is no database cap on sublet length, deliberately — where a sublet
   * becomes a tenancy is a product judgement with no evidence behind it. But an
   * absurd value is almost always a slipped digit, and the agent typing it is
   * the only person who knows what they meant. Submission stays enabled.
   */
  const subletWarning =
    rentalDuration === "sublet" ? subletLengthWarning(Number(subletMonths)) : null;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const body = {
      amenities: amenities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      area,
      bathrooms: Number(bathrooms),
      bedrooms: Number(bedrooms),
      city,
      description,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      priceNaira: Number(priceNaira),
      propertyType,
      rentalDuration,
      state,
      /**
       * The duration and its month count travel together, always.
       *
       * Sent as null rather than omitted when this is not a sublet, so the
       * server sees a stated choice instead of an absence. The server derives
       * the pair again before writing — the CHECK constraint refuses a month
       * count on anything that is not a sublet, so a partial update that
       * changed one without the other would fail the whole statement. This is
       * belt and braces on purpose: the client says what it means, and the
       * server does not trust it to.
       */
      subletMonths: rentalDuration === "sublet" ? Number(subletMonths) : null,
      title,
    };

    const response = await fetch(
      isEditing ? `/api/agent/listings/${listing!.id}` : "/api/agent/listings",
      {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: isEditing ? "PATCH" : "POST",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;

    if (!response.ok) {
      // Read off the code. This used to branch on the MESSAGE being exactly
      // "LISTING_SUBSCRIPTION_REQUIRED" — a second, code-shaped string thrown
      // alongside the real code SUBSCRIPTION_REQUIRED — and fall through to
      // rendering whatever message arrived. Neither the branch nor the
      // fall-through survives contact with a code lookup.
      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    setMessage(isEditing ? "Changes saved." : "Draft listing created.");
    setIsSubmitting(false);

    // Re-fetch the server component around this form so status and any
    // moderation state on the page reflect what was just written, rather than
    // showing the state the page was loaded with.
    if (isEditing) {
      router.refresh();
    }
  }

  return (
    <form className="grid gap-5 md:grid-cols-2" onSubmit={onSubmit}>
      <label className="flex flex-col gap-2 text-sm text-stone-700 md:col-span-2">
        <span>Title</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setTitle(e.target.value)} value={title} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700 md:col-span-2">
        <span>Description</span>
        <textarea className="min-h-32 rounded-2xl border border-stone-900/10 bg-white px-4 py-3" onChange={(e) => setDescription(e.target.value)} value={description} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Property type</span>
        <select className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setPropertyType(e.target.value)} value={propertyType}>
          {listingPropertyTypeOptions.filter((option) => option.value).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Duration</span>
        <select className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setRentalDuration(e.target.value as never)} value={rentalDuration}>
          {listingRentalDurationOptions.filter((option) => option.value).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {/*
        Only rendered for a sublet. The field is meaningless on a yearly or
        monthly listing, and the database refuses a month count on one, so
        showing it would invite a 422 the agent could not have predicted.
      */}
      {rentalDuration === "sublet" ? (
        <label className="flex flex-col gap-2 text-sm text-stone-700">
          <span>Sublet length (months)</span>
          <input
            className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4"
            min={1}
            onChange={(e) => setSubletMonths(e.target.value)}
            required
            step={1}
            type="number"
            value={subletMonths}
          />
          {subletWarning ? (
            <span className="text-sm text-amber-800">{subletWarning}</span>
          ) : null}
        </label>
      ) : null}

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Price (NGN)</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setPriceNaira(e.target.value)} type="number" value={priceNaira} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Bedrooms</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setBedrooms(e.target.value)} type="number" value={bedrooms} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Bathrooms</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setBathrooms(e.target.value)} type="number" value={bathrooms} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Area</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setArea(e.target.value)} value={area} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>City</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setCity(e.target.value)} value={city} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>State</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setState(e.target.value)} value={state} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Latitude</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setLatitude(e.target.value)} type="number" value={latitude} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700">
        <span>Longitude</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setLongitude(e.target.value)} type="number" value={longitude} />
      </label>

      <label className="flex flex-col gap-2 text-sm text-stone-700 md:col-span-2">
        <span>Amenities</span>
        <input className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setAmenities(e.target.value)} value={amenities} />
      </label>

      {error ? <p className="text-sm text-rose-700 md:col-span-2">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700 md:col-span-2">{message}</p> : null}

      <div className="md:col-span-2 flex justify-end">
        <button className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save changes"
              : "Create draft"}
        </button>
      </div>
    </form>
  );
}
