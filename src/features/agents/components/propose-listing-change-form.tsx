"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SupportWhatsAppLink } from "@/components/support-whatsapp-link";
import {
  errorCopyForResponse,
  fieldErrorsFrom,
  supportTopicForResponse,
} from "@/features/errors/error-copy";
import type { SupportTopic } from "@/lib/support-contact";
import { listingRentalDurationOptions } from "@/features/listings/options";
import { subletLengthWarning } from "@/features/listings/rental-duration";

export type ProposableListing = {
  amenities: string[];
  description: string;
  id: string;
  priceNaira: number;
  rentalDuration: "yearly" | "monthly" | "sublet";
  subletMonths: number | null;
  title: string;
};

type ProposeListingChangeFormProps = {
  hasPendingRevision: boolean;
  listing: ProposableListing;
};

/**
 * Propose a change to a live listing.
 *
 * A separate component from ListingForm rather than a mode on it, because the
 * two are different actions with different consequences. Editing a draft is
 * saving your own work; this is asking a moderator for something, and the
 * component that asks should say so in its own words.
 *
 * The fields are only those a revision may carry — see migration 0023. A form
 * that showed the property type and then silently dropped it would be worse
 * than one that never offered it.
 */
export function ProposeListingChangeForm({
  hasPendingRevision,
  listing,
}: ProposeListingChangeFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [priceNaira, setPriceNaira] = useState(String(listing.priceNaira));
  const [rentalDuration, setRentalDuration] = useState(listing.rentalDuration);
  const [subletMonths, setSubletMonths] = useState(
    listing.subletMonths ? String(listing.subletMonths) : "6",
  );
  const [amenities, setAmenities] = useState(listing.amenities.join(", "));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportTopic, setSupportTopic] = useState<SupportTopic | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const subletWarning =
    rentalDuration === "sublet" ? subletLengthWarning(Number(subletMonths)) : null;

  /**
   * A change is already waiting.
   *
   * Shown instead of the form rather than beside it. Offering inputs that the
   * server will refuse is how an agent comes to distrust a form.
   */
  if (hasPendingRevision) {
    return (
      <div className="rounded-tile border border-attention-line-strong bg-attention-surface p-5">
        <p className="text-sm font-semibold text-attention-deep">
          A change is waiting for review
        </p>
        <p className="mt-2 text-sm leading-6 text-attention-ink">
          Your listing is still live with its current details. Once a moderator
          has looked at your change you will be able to make another.
        </p>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    setSupportTopic(null);
    setFieldErrors({});

    const response = await fetch(
      `/api/agent/listings/${listing.id}/revisions`,
      {
        body: JSON.stringify({
          amenities: amenities
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          description,
          priceNaira: Number(priceNaira),
          rentalDuration,
          subletMonths: rentalDuration === "sublet" ? Number(subletMonths) : null,
          title,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | { error?: { code?: string; details?: unknown; message?: string } }
      | null;

    if (!response.ok) {
      const fields = fieldErrorsFrom(payload);
      setFieldErrors(fields);
      setError(Object.keys(fields).length > 0 ? null : errorCopyForResponse(payload));
      // 0044: a suspended agent's revision is refused with a sentence that
      // sends them to a person, so the link travels with it.
      setSupportTopic(supportTopicForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    setMessage(
      "Sent for review. Your listing stays live with its current details until a moderator approves the change.",
    );
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      {/*
        Said before the agent commits, not after.
        An agent who changes a price, sees a success message, and assumes it is
        live has been misled by us — and the person who finds out is a seeker
        who was quoted the old figure.
      */}
      <div className="rounded-tile border border-line bg-sunken p-4">
        <p className="text-sm font-semibold text-ink">
          Changes are reviewed before they go live
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm leading-6 text-body">
          <li>• Your listing stays live and searchable while we review.</li>
          <li>• Seekers keep seeing the current details until the change is approved.</li>
          <li>• This does not use a submission slot.</li>
        </ul>
      </div>

      <label className="flex flex-col gap-2 text-sm text-body">
        <span>Title</span>
        <input
          aria-describedby={fieldErrors.title ? "title-error" : undefined}
          aria-invalid={Boolean(fieldErrors.title)}
          className="h-12 rounded-field border border-line bg-paper px-4"
          onChange={(e) => setTitle(e.target.value)}
          value={title}
        />
        {fieldErrors.title ? (
          <span className="text-sm text-fix" id="title-error">
            {fieldErrors.title}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2 text-sm text-body">
        <span>Description</span>
        <textarea
          aria-describedby={fieldErrors.description ? "description-error" : undefined}
          aria-invalid={Boolean(fieldErrors.description)}
          className="min-h-32 rounded-field border border-line bg-paper px-4 py-3"
          onChange={(e) => setDescription(e.target.value)}
          value={description}
        />
        {fieldErrors.description ? (
          <span className="text-sm text-fix" id="description-error">
            {fieldErrors.description}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2 text-sm text-body">
        <span>Price (NGN)</span>
        <input
          aria-describedby={fieldErrors.priceNaira ? "priceNaira-error" : undefined}
          aria-invalid={Boolean(fieldErrors.priceNaira)}
          className="h-12 rounded-field border border-line bg-paper px-4"
          onChange={(e) => setPriceNaira(e.target.value)}
          type="number"
          value={priceNaira}
        />
        {fieldErrors.priceNaira ? (
          <span className="text-sm text-fix" id="priceNaira-error">
            {fieldErrors.priceNaira}
          </span>
        ) : null}
      </label>

      <label className="flex flex-col gap-2 text-sm text-body">
        <span>Duration</span>
        <select
          className="h-12 rounded-field border border-line bg-paper px-4"
          onChange={(e) => setRentalDuration(e.target.value as never)}
          value={rentalDuration}
        >
          {listingRentalDurationOptions
            .filter((option) => option.value)
            .map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </select>
      </label>

      {rentalDuration === "sublet" ? (
        <label className="flex flex-col gap-2 text-sm text-body">
          <span>Sublet length (months)</span>
          <input
            aria-describedby={fieldErrors.subletMonths ? "subletMonths-error" : undefined}
            aria-invalid={Boolean(fieldErrors.subletMonths)}
            className="h-12 rounded-field border border-line bg-paper px-4"
            min={1}
            onChange={(e) => setSubletMonths(e.target.value)}
            step={1}
            type="number"
            value={subletMonths}
          />
          {fieldErrors.subletMonths ? (
            <span className="text-sm text-fix" id="subletMonths-error">
              {fieldErrors.subletMonths}
            </span>
          ) : null}
          {subletWarning ? (
            <span className="text-sm text-attention">{subletWarning}</span>
          ) : null}
        </label>
      ) : null}

      <label className="flex flex-col gap-2 text-sm text-body">
        <span>Amenities</span>
        <input
          className="h-12 rounded-field border border-line bg-paper px-4"
          onChange={(e) => setAmenities(e.target.value)}
          value={amenities}
        />
      </label>

      {/*
        What cannot change here, stated rather than left to be discovered.
        An agent hunting for the bedroom count should find out why it is absent,
        not conclude the form is broken.
      */}
      <p className="text-sm leading-6 text-muted">
        The property type, room counts and area cannot be changed on a live
        listing — seekers searched and filtered on those. If those are wrong,
        take this listing down and create a new one.
      </p>

      {error ? <p className="text-sm text-fix">{error}</p> : null}
      {error && supportTopic ? (
        <SupportWhatsAppLink
          className="text-sm font-medium text-fix-strong underline underline-offset-4"
          topic={supportTopic}
        />
      ) : null}
      {message ? <p className="text-sm text-verified">{message}</p> : null}

      <div className="flex justify-end">
        <button
          className="rounded-full bg-action px-5 py-3 text-sm font-medium text-on-action disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Sending for review..." : "Send change for review"}
        </button>
      </div>
    </form>
  );
}
