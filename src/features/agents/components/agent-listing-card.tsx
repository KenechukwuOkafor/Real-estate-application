"use client";

import Link from "next/link";

import type { AgentListingCard as CardModel } from "@/features/agents/listing-cards";
import { needsAttention } from "@/features/agents/listing-cards";
import {
  MarkAvailableButton,
  MarkTakenButton,
} from "@/features/agents/components/listing-availability-buttons";
import { ListingImagesForm } from "@/features/agents/components/listing-images-form";
import { RemoveListingButton } from "@/features/agents/components/remove-listing-button";
import { SubmitListingReviewButton } from "@/features/agents/components/submit-listing-review-button";
import { SubmitReadinessChecklist } from "@/features/agents/components/submit-readiness-checklist";
import { submitReadiness } from "@/features/agents/submit-readiness";
import {
  isListingEditable,
  isListingRevisable,
} from "@/features/listings/editability";
import {
  buildListingHref,
  formatListingStatus,
  formatPriceNaira,
} from "@/features/listings/format";
import { formatRentalDuration } from "@/features/listings/rental-duration";

import type { SubmitReadinessInput } from "@/features/agents/submit-readiness";

/**
 * Narrowed from the service's raw string, so a status the checklist does not
 * understand is a build error here rather than a silently wrong checklist item.
 */
type Entitlement = {
  freeListingQuota: number;
  hasActiveSubscription: boolean;
  verificationStatus: SubmitReadinessInput["verificationStatus"];
};

/**
 * How the two numbers read together, in words.
 *
 * The same three situations the dashboard table separates, because the
 * inference is the whole value and it is not obvious from a pair of integers:
 *
 *   viewers, no requests  → price or photos. People are seeing it and passing.
 *   no viewers            → visibility. Nobody has been shown it at all.
 *   viewers and requests  → working.
 */
function reading(card: CardModel) {
  // A taken listing is not in search BY THE AGENT'S OWN DECISION, so a verdict
  // on its traffic is the page blaming them for something they chose. Its
  // numbers are still shown — they are real, and they cover the period before
  // it came off — but the reading is left to the "off the market" line below.
  if (card.status === "rented") {
    return null;
  }

  if (card.tooNew) {
    return { text: "Too new to judge", tone: "text-stone-500" };
  }

  if (card.viewers === 0) {
    return { text: "Not being seen", tone: "text-stone-600" };
  }

  if (card.requests === 0) {
    return { text: "Seen, but not asked about", tone: "text-amber-800" };
  }

  return { text: "Converting", tone: "text-emerald-800" };
}

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

const ACTION_CLASS =
  "rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition-colors hover:bg-stone-50";

export function AgentListingCard({
  card,
  entitlement,
  focused,
}: {
  card: CardModel;
  entitlement: Entitlement;
  focused: boolean;
}) {
  const read = reading(card);
  const attention = needsAttention(card);

  // Only where submission is the next step. An approved, taken or removed
  // listing has nothing outstanding.
  const readiness =
    card.status === "draft" || card.status === "rejected"
      ? submitReadiness({
          activeImageCount: card.imageCount,
          area: card.area,
          freeListingQuota: entitlement.freeListingQuota,
          hasActiveSubscription: entitlement.hasActiveSubscription,
          priceNaira: card.priceNaira,
          verificationStatus: entitlement.verificationStatus,
        })
      : null;

  // A rented listing's public URL resolves to the honest-absence page, which is
  // exactly what a seeker sees — so "preview as seeker" is accurate there and
  // is deliberately offered. A draft has no public page at all.
  const previewable = isListingRevisable(card.status);

  return (
    <article
      className={`rounded-[1.75rem] border bg-white/85 p-6 shadow-[0_16px_40px_rgba(48,38,24,0.06)] ${
        focused
          ? "border-stone-900/40 ring-2 ring-stone-900/15"
          : attention
            ? "border-amber-300/70"
            : "border-stone-900/10"
      }`}
      id={card.id}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              {formatListingStatus(card.status)}
            </p>
            {card.tooNew ? (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-stone-600">
                New
              </span>
            ) : null}
          </div>

          <h2 className="mt-2 text-2xl font-semibold">{card.title}</h2>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
            <span>
              {card.area}, {card.city}
            </span>
            <span className="font-medium text-stone-900">
              {formatPriceNaira(card.priceNaira)}{" "}
              {formatRentalDuration(
                card.rentalDuration as "yearly" | "monthly" | "sublet",
                card.subletMonths,
              )}
            </span>
            <span>
              {card.imageCount} image{card.imageCount === 1 ? "" : "s"}
            </span>
          </div>

          {/*
            The numbers, and the sentence that says what they mean together.
            Shown only where they can exist: a draft has never been seen by
            anyone, and a row of zeros on it reads as failure rather than as
            absence — the same reason the dashboard has a first-run state.
          */}
          {card.status === "approved" || card.status === "rented" ? (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
              <span>
                <strong className="text-base font-semibold text-stone-900">
                  {card.viewers}
                </strong>{" "}
                <span className="text-stone-600">
                  viewer{card.viewers === 1 ? "" : "s"}
                </span>
              </span>
              <span>
                <strong className="text-base font-semibold text-stone-900">
                  {card.requests}
                </strong>{" "}
                <span className="text-stone-600">
                  request{card.requests === 1 ? "" : "s"}
                </span>
              </span>
              {read ? (
                <span className={`font-medium ${read.tone}`}>{read.text}</span>
              ) : null}
            </div>
          ) : null}

          {/* ---------------------------------------------------- signals */}

          {card.status === "rejected" && card.rejectionReason ? (
            <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
              Rejected: {card.rejectionReason}
            </p>
          ) : null}

          {/*
            THE SIGNAL WITH NO OTHER SYMPTOM. The listing is live and looks
            entirely normal; only the correction to it was refused. Before this
            it appeared solely in the dashboard action queue, so an agent
            looking at the listing itself saw nothing wrong with it.
          */}
          {card.revision?.status === "rejected" ? (
            <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
              Your change to this listing was refused
              {card.revision.reason ? `: ${card.revision.reason}` : "."} The
              listing is still live with the details a moderator approved.
            </p>
          ) : null}

          {card.revision?.status === "pending_review" ? (
            <p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-700">
              A change to this listing is with a moderator. It stays live with
              its current details until they decide.
            </p>
          ) : null}

          {/*
            Says what it measures and nothing more. We do not know whether a
            tenancy started or ended — the parties agree that in chat — so this
            cannot claim the sublet is over, and nothing auto-hides on it.
          */}
          {card.subletTermPassed ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              {`This sublet has been live longer than the ${card.subletMonths}-month term it advertises.`}{" "}
              It is still in search. If it has gone, mark it as taken; if the
              dates have moved, change the details.
            </p>
          ) : null}

          {card.status === "rented" ? (
            <p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-700">
              Off the market{card.rentedAt ? ` for ${daysSince(card.rentedAt)} days` : ""}.
              It is not in search and is not taking new requests, but you still
              have it and it is still using no submission slot.
            </p>
          ) : null}

          {card.status === "archived" ? (
            <p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-700">
              Removed. This listing is no longer visible to seekers and cannot be
              restored — list the property again to bring it back.
            </p>
          ) : null}
        </div>

        {/* ------------------------------------------------------ actions */}

        <div className="flex min-w-[280px] flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {isListingRevisable(card.status) ? (
              <Link className={ACTION_CLASS} href={`/agent/listings/${card.id}/edit`}>
                Change details
              </Link>
            ) : null}

            {isListingEditable(card.status) ? (
              <Link className={ACTION_CLASS} href={`/agent/listings/${card.id}/edit`}>
                {card.status === "rejected" ? "Fix and edit" : "Edit"}
              </Link>
            ) : null}

            {previewable ? (
              <Link
                className={ACTION_CLASS}
                href={buildListingHref(card.slug, card.publicUuid)}
                rel="noreferrer"
                target="_blank"
              >
                Preview as seeker
              </Link>
            ) : null}
          </div>

          {card.status === "approved" ? (
            <>
              <MarkTakenButton listingId={card.id} listingTitle={card.title} />
              <RemoveListingButton listingId={card.id} listingTitle={card.title} />
            </>
          ) : null}

          {card.status === "rented" ? <MarkAvailableButton listingId={card.id} /> : null}

          {readiness ? (
            <>
              <ListingImagesForm listingId={card.id} />
              <SubmitReadinessChecklist items={readiness} />
              <SubmitListingReviewButton listingId={card.id} />
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
