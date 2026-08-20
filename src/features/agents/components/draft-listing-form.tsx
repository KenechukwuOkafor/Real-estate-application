"use client";

import { useState } from "react";

import {
  listingPropertyTypeOptions,
  listingRentalDurationOptions,
} from "@/features/listings/options";
import { subletLengthWarning } from "@/features/listings/rental-duration";

export function DraftListingForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyType, setPropertyType] =
    useState<(typeof listingPropertyTypeOptions)[number]["value"]>("self_contain");
  const [rentalDuration, setRentalDuration] = useState<"yearly" | "monthly" | "sublet">(
    "yearly",
  );
  const [subletMonths, setSubletMonths] = useState("6");
  const [priceNaira, setPriceNaira] = useState("250000");
  const [bedrooms, setBedrooms] = useState("1");
  const [bathrooms, setBathrooms] = useState("1");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("Nsukka");
  const [state, setState] = useState("Enugu");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [amenities, setAmenities] = useState("water, prepaid_meter");
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/agent/listings", {
      body: JSON.stringify({
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
        // Only a sublet carries a month count. Sent as null otherwise rather
        // than omitted, so the server sees the choice rather than an absence.
        subletMonths: rentalDuration === "sublet" ? Number(subletMonths) : null,
        title,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(
        payload?.error?.message === "LISTING_SUBSCRIPTION_REQUIRED"
          ? "An active subscription or free listing quota is required before you can create a new draft."
          : payload?.error?.message ?? "Unable to create draft listing.",
      );
      setIsSubmitting(false);
      return;
    }

    setMessage("Draft listing created.");
    setIsSubmitting(false);
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
        <select className="h-12 rounded-2xl border border-stone-900/10 bg-white px-4" onChange={(e) => setPropertyType(e.target.value as never)} value={propertyType}>
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
          {isSubmitting ? "Creating..." : "Create draft"}
        </button>
      </div>
    </form>
  );
}
