/**
 * The verification claim, stated once about the platform.
 *
 * It used to be a badge on every card. Every listing in the public feed comes
 * from a verified agent — verification gates both submission and visibility —
 * so the badge fired on 100% of cards and distinguished nothing between them.
 * A badge is read as a differentiator because that is what a badge is for, and
 * one that never varies teaches seekers to skip the card's only trust
 * affordance.
 *
 * So the claim moves to where it is actually true: it is a fact about Ruvo,
 * not about one listing. The card's slot is left empty for a signal that
 * varies — see the note in listing-card.tsx.
 *
 * Rendered for everyone. The signed-out value-prop block carried this before
 * and a signed-in seeker saw it nowhere at all, which is the gap that made
 * moving the badge a loss rather than a tidy-up.
 */
export function PlatformTrustLine() {
  return (
    <p className="flex items-center justify-center gap-2 text-xs text-stone-600">
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-emerald-700"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path d="m4.5 12.5 5 5 10-11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Every agent on Ruvo is reviewed before their listings go live.
    </p>
  );
}
