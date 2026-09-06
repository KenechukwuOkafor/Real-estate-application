"use client";

import { useEffect, useMemo, useState } from "react";

import { AgentListingCard } from "@/features/agents/components/agent-listing-card";
import type { AgentListingCard as CardModel } from "@/features/agents/listing-cards";
import {
  type ListingFilterState,
  needsAttention,
  type SortKey,
  SORT_OPTIONS,
  sortCards,
} from "@/features/agents/listing-cards";
import {
  DEFAULT_HIDDEN_GROUPS,
  type GroupKey,
  groupKeyForStatus,
  LISTING_GROUPS,
} from "@/features/agents/listing-groups";

import type { SubmitReadinessInput } from "@/features/agents/submit-readiness";

type Entitlement = {
  freeListingQuota: number;
  hasActiveSubscription: boolean;
  verificationStatus: SubmitReadinessInput["verificationStatus"];
};

/**
 * The agent's listings, as one flat filterable list.
 *
 * ===========================================================================
 * WHY FLAT, AND WHY CLIENT-SIDE
 * ===========================================================================
 *
 * This page used to be sections by status. That could not answer the question
 * it exists to answer — "which of my listings is dead" — because answering it
 * means sorting every listing by requests ascending, and a sort that only
 * reorders within sections does not sort. The sections became the chips above.
 *
 * Filtering happens in the browser over a list that is already fully loaded,
 * because the whole list IS already loaded: there is no pagination here and
 * deliberately none. An agent has three submission slots by default and rarely
 * more than a dozen listings, so "load all, let sort and filters do the
 * finding" costs one query and makes every interaction instant. The seeker feed
 * keeps its infinite scroll for the opposite reason — it browses inventory it
 * does not own, which is unbounded.
 *
 * ===========================================================================
 * WHY history.replaceState AND NOT router.replace
 * ===========================================================================
 *
 * The filter belongs in the URL so a refresh, a back button, or returning from
 * the edit page does not silently reset it — an agent who filtered to "Needs
 * you", fixed one listing and came back to an unfiltered list has lost their
 * place in the only screen that lists their inventory.
 *
 * But `router.replace` re-runs the server component, which re-queries five
 * tables to render a list the browser already holds. `history.replaceState`
 * updates the URL without touching the server, which is what a purely visual
 * filter should cost.
 *
 * So the two directions are split: the SERVER parses the query string on a
 * fresh load and passes `initial` down, and the CLIENT writes the query string
 * on every change without asking the server for anything. Reading it on the
 * client instead would mean either a setState inside an effect — painting the
 * unfiltered list first and replacing it — or a lazy initialiser that cannot
 * see `window` during SSR and so hydrates against markup it did not render.
 */
export function AgentListingsList({
  cards,
  entitlement,
  focusId,
  initial,
  windowDays,
}: {
  cards: CardModel[];
  entitlement: Entitlement;
  focusId: string | null;
  /** Parsed from the query string on the SERVER — see parseListingFilters. */
  initial: ListingFilterState;
  windowDays: number;
}) {
  const [active, setActive] = useState<GroupKey[]>(
    initial.groups as GroupKey[],
  );
  const [attentionOnly, setAttentionOnly] = useState(initial.attentionOnly);
  const [showRemoved, setShowRemoved] = useState(initial.showRemoved);
  const [sort, setSort] = useState<SortKey>(initial.sort);

  // The URL follows the controls, and never the other way round after mount.
  // history.replaceState rather than router.replace: this is a purely visual
  // change over data the browser already holds, and router.replace would
  // re-run the server component and re-query five tables to produce the same
  // list. The server reads these params only on a fresh load, via
  // parseListingFilters.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (active.length > 0) params.set("groups", active.join(","));
    else params.delete("groups");

    if (attentionOnly) params.set("attention", "1");
    else params.delete("attention");

    if (showRemoved) params.set("removed", "1");
    else params.delete("removed");

    if (sort !== "attention") params.set("sort", sort);
    else params.delete("sort");

    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname,
    );
  }, [active, attentionOnly, showRemoved, sort]);

  const counts = useMemo(() => {
    const byGroup = new Map<GroupKey, number>();

    for (const card of cards) {
      const key = groupKeyForStatus(card.status);
      if (key) byGroup.set(key, (byGroup.get(key) ?? 0) + 1);
    }

    return byGroup;
  }, [cards]);

  const attentionCount = useMemo(
    () => cards.filter((card) => needsAttention(card)).length,
    [cards],
  );

  const visible = useMemo(() => {
    const filtered = cards.filter((card) => {
      const key = groupKeyForStatus(card.status);

      // The focused listing is always shown, whatever the filters say. A link
      // that lands on a page which has filtered its target out is a link that
      // does not work, and the agent has no way to tell that is what happened.
      if (focusId && card.id === focusId) return true;

      if (
        key &&
        DEFAULT_HIDDEN_GROUPS.includes(key) &&
        !showRemoved &&
        !active.includes(key)
      ) {
        return false;
      }

      if (active.length > 0 && (!key || !active.includes(key))) return false;
      if (attentionOnly && !needsAttention(card)) return false;

      return true;
    });

    return sortCards(filtered, sort);
  }, [active, attentionOnly, cards, focusId, showRemoved, sort]);

  const activeSubtitle =
    active.length === 1
      ? LISTING_GROUPS.find((group) => group.key === active[0])?.subtitle
      : null;

  function toggleGroup(key: GroupKey) {
    setActive((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-[1.5rem] border border-stone-900/10 bg-white/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {attentionCount > 0 ? (
            <button
              aria-pressed={attentionOnly}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                attentionOnly
                  ? "bg-amber-900 text-white"
                  : "border border-amber-300 bg-amber-50 text-amber-900"
              }`}
              onClick={() => setAttentionOnly((on) => !on)}
              type="button"
            >
              Needs attention {attentionCount}
            </button>
          ) : null}

          {LISTING_GROUPS.filter(
            (group) => !DEFAULT_HIDDEN_GROUPS.includes(group.key),
          ).map((group) => {
            const count = counts.get(group.key) ?? 0;
            const on = active.includes(group.key);

            return (
              <button
                aria-pressed={on}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                  on
                    ? "bg-stone-900 text-white"
                    : "border border-stone-900/15 bg-white text-stone-800"
                }`}
                disabled={count === 0}
                key={group.key}
                onClick={() => toggleGroup(group.key)}
                type="button"
              >
                {group.title} {count}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              checked={showRemoved}
              className="h-4 w-4 rounded border-stone-400"
              onChange={(event) => setShowRemoved(event.target.checked)}
              type="checkbox"
            />
            Show removed ({counts.get("removed") ?? 0})
          </label>

          <label className="flex items-center gap-2 text-sm text-stone-700">
            Sort
            <select
              className="rounded-full border border-stone-900/15 bg-white px-3 py-1.5 text-sm"
              onChange={(event) => setSort(event.target.value as SortKey)}
              value={sort}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeSubtitle ? (
          <p className="text-sm leading-6 text-stone-600">{activeSubtitle}</p>
        ) : null}

        {/*
          The window is stated rather than assumed. Two numbers with no period
          attached are not a measurement, and this is the same window the
          dashboard defaults to so the two screens agree.
        */}
        <p className="text-xs uppercase tracking-[0.16em] text-stone-500">
          Viewers and requests: last {windowDays} days
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[1.5rem] border border-dashed border-stone-900/15 bg-white/60 p-6 text-sm leading-6 text-stone-600">
          {/*
            Says which filter is responsible, because "nothing here" over a list
            the agent knows is not empty reads as a broken page.
          */}
          No listings match these filters. You have {cards.length} listing
          {cards.length === 1 ? "" : "s"} in total.
        </p>
      ) : null}

      {visible.map((card) => (
        <AgentListingCard
          card={card}
          entitlement={entitlement}
          focused={card.id === focusId}
          key={card.id}
        />
      ))}
    </div>
  );
}
