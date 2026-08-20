import { isReadyToSubmit, type ReadinessItem } from "@/features/agents/submit-readiness";

type SubmitReadinessChecklistProps = {
  items: ReadinessItem[];
};

/**
 * What is still outstanding before this listing can be submitted.
 *
 * Replaces the experience of clicking Submit and being told
 * LISTING_IMAGE_COUNT_INVALID, which named the rule rather than the remedy and
 * gave no clue which of five gates had fired.
 *
 * Server-rendered and stateless: the page already knows all of this, so there is
 * nothing to fetch and nothing to keep in sync.
 */
export function SubmitReadinessChecklist({ items }: SubmitReadinessChecklistProps) {
  const ready = isReadyToSubmit(items);

  if (ready) {
    return (
      <p className="text-sm font-medium text-emerald-800">
        Ready to submit for review.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-900/10 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        Before you submit
      </p>

      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.label} className="flex gap-2.5 text-sm">
            {/*
              A tick or a hollow circle, never a cross. Nothing here is a
              mistake the agent made — a verification still in review is us
              owing them, not the reverse — and a red cross would say otherwise.
            */}
            <span
              aria-hidden="true"
              className={
                item.met
                  ? "mt-0.5 text-emerald-700"
                  : "mt-0.5 text-stone-400"
              }
            >
              {item.met ? "✓" : "○"}
            </span>
            <span className="flex flex-col gap-0.5">
              <span
                className={item.met ? "text-stone-500 line-through" : "text-stone-900"}
              >
                {item.label}
              </span>
              {!item.met && item.hint ? (
                <span className="text-stone-600">{item.hint}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
