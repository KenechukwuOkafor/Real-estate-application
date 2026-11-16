"use client";

import Link from "next/link";

import { SupportWhatsAppLink } from "@/components/support-whatsapp-link";
import { moderationHold } from "@/features/agents/moderation-hold";

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
  /** Who is writing, for the routes to a person. Loaded only when one can show. */
  supportAgent?: { displayName: string | null; handle: string | null } | null;
  /** Built on the server, and only for a suspended agent. */
  supportHref?: string | null;
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
    return { text: "Too new to judge", tone: "text-subtle" };
  }

  if (card.viewers === 0) {
    return { text: "Not being seen", tone: "text-muted" };
  }

  if (card.requests === 0) {
    return { text: "Seen, but not asked about", tone: "text-attention" };
  }

  return { text: "Converting", tone: "text-verified-strong" };
}

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

const ACTION_CLASS =
  "rounded-full border border-line-strong bg-paper px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-sunken";

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
  const hold = moderationHold({
    dispute_reason: card.disputeReason,
    flag_reason: card.flagReason,
    status: card.status,
  });

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
          supportHref: entitlement.supportHref,
          verificationStatus: entitlement.verificationStatus,
        })
      : null;

  // A rented listing's public URL resolves to the honest-absence page, which is
  // exactly what a seeker sees — so "preview as seeker" is accurate there and
  // is deliberately offered. A draft has no public page at all.
  const previewable = isListingRevisable(card.status);

  return (
    <article
      className={`rounded-card border bg-card p-6 shadow-lifted ${
        focused
          ? "border-ink/40 ring-2 ring-line-strong"
          : attention
            ? "border-attention-line-strong/70"
            : "border-line"
      }`}
      id={card.id}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-subtle">
              {formatListingStatus(card.status)}
            </p>
            {card.tooNew ? (
              <span className="rounded-full bg-sunken-strong px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                New
              </span>
            ) : null}
          </div>

          <h2 className="mt-2 text-2xl font-semibold">{card.title}</h2>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              {card.area}, {card.city}
            </span>
            <span className="font-medium text-ink">
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
                <strong className="text-base font-semibold text-ink">
                  {card.viewers}
                </strong>{" "}
                <span className="text-muted">
                  viewer{card.viewers === 1 ? "" : "s"}
                </span>
              </span>
              <span>
                <strong className="text-base font-semibold text-ink">
                  {card.requests}
                </strong>{" "}
                <span className="text-muted">
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
            <p className="mt-3 rounded-tile bg-fix-surface px-4 py-3 text-sm leading-6 text-fix-ink">
              Rejected: {card.rejectionReason}
            </p>
          ) : null}

          {/*
            FLAGGED OR DISPUTED: the reason a moderator wrote for the agent,
            beside what it costs and the one thing they can do about it. Not
            rose — a flag is a question, not something they must fix.
          */}
          {hold ? (
            <div className="mt-3 rounded-tile border border-line-bold bg-sunken px-4 py-3 text-sm leading-6 text-ink-soft">
              <p className="font-medium text-ink">{hold.heading}</p>
              <p className="mt-1">
                <span className="text-muted">{hold.reasonLabel}:</span> {hold.reason}
              </p>
              <p className="mt-1 text-body">{hold.consequence}</p>
              <SupportWhatsAppLink
                agent={entitlement.supportAgent}
                className="mt-2 inline-block font-medium text-ink underline underline-offset-4"
                listing={{ title: card.title }}
                topic={hold.supportTopic}
              />
            </div>
          ) : null}

          {/*
            THE SIGNAL WITH NO OTHER SYMPTOM. The listing is live and looks
            entirely normal; only the correction to it was refused. Before this
            it appeared solely in the dashboard action queue, so an agent
            looking at the listing itself saw nothing wrong with it.
          */}
          {card.revision?.status === "rejected" ? (
            <p className="mt-3 rounded-tile bg-fix-surface px-4 py-3 text-sm leading-6 text-fix-ink">
              Your change to this listing was refused
              {card.revision.reason ? `: ${card.revision.reason}` : "."} The
              listing is still live with the details a moderator approved.
            </p>
          ) : null}

          {card.revision?.status === "pending_review" ? (
            <p className="mt-3 rounded-tile bg-sunken-strong px-4 py-3 text-sm leading-6 text-body">
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
            <p className="mt-3 rounded-tile bg-attention-surface px-4 py-3 text-sm leading-6 text-attention-ink">
              {`This sublet has been live longer than the ${card.subletMonths}-month term it advertises.`}{" "}
              It is still in search. If it has gone, mark it as taken; if the
              dates have moved, change the details.
            </p>
          ) : null}

          {card.status === "rented" ? (
            <p className="mt-3 rounded-tile bg-sunken-strong px-4 py-3 text-sm leading-6 text-body">
              Off the market{card.rentedAt ? ` for ${daysSince(card.rentedAt)} days` : ""}.
              It is not in search and is not taking new requests, but you still
              have it and it is still using no submission slot.
            </p>
          ) : null}

          {card.status === "archived" ? (
            <p className="mt-3 rounded-tile bg-sunken-strong px-4 py-3 text-sm leading-6 text-body">
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
