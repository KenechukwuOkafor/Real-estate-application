/**
 * The single place that decides what tapping a filter chip means.
 *
 * The type tiles and the suggestion sheet both write `propertyType`, and they
 * drifted: the tiles toggled, the sheet set unconditionally. A seeker could
 * apply a type from either control but clear it from only one.
 *
 * Both already read the URL rather than caching selection in local state,
 * which is what stops them *displaying* different things. Sharing the decision
 * below is the same move for what they *write* — the area and budget chips in
 * the sheet had it inline and correct, which is why only the type chips broke.
 */
export function toggleFilterValue(
  current: string | null,
  tapped: string,
): string | undefined {
  return current === tapped ? undefined : tapped;
}
