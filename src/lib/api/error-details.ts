/**
 * Structured detail that travels with an error.
 *
 * `details` has existed in the response shape since the beginning and has always
 * been `null`. That absence is what capped the copy layer: VALIDATION_ERROR is
 * thrown for roughly twenty distinct field failures, so the only honest sentence
 * it could produce was "some details are missing or do not look right". The
 * information the form needed — which field, and why — existed only inside the
 * message, which is precisely what stopped being read.
 *
 * This is that information as data. Per-field CODES would also have worked, but
 * they would multiply the registry with entries that are really a payload: the
 * failure is always VALIDATION_ERROR, and what varies is which input and which
 * constraint.
 *
 * Deliberately client-safe. Both sides need this vocabulary — the server to
 * describe a failure, the copy layer to turn it into a sentence — and a shared
 * type is what stops the two drifting into disagreement about the spelling of a
 * rule.
 */

/**
 * The constraint that was not met.
 *
 * A closed set, because every one of these has to correspond to a sentence
 * somebody wrote. Adding a rule without adding copy is caught by test.
 */
export type ValidationRule =
  | "required"
  | "must_be_positive"
  | "must_not_be_negative"
  | "must_be_whole_number"
  | "invalid_option"
  | "not_applicable"
  | "min_items"
  | "max_items"
  | "duplicate"
  | "self_contain_shape";

export type ValidationIssue = {
  /**
   * The input this belongs beside.
   *
   * Named to match the form field so a client can map it to an input without a
   * translation table in between. Where a rule is genuinely about a relationship
   * between fields, this names the field the person is most likely to want to
   * change — see `self_contain_shape`.
   */
  field: string;
  rule: ValidationRule;
  /** Numbers the sentence needs: a minimum, a maximum, what was actually sent. */
  meta?: Record<string, string | number>;
};

/**
 * Details, tagged by what kind of failure they describe.
 *
 * A union rather than a bag, because `details` means different things for
 * different codes and a reader should not have to guess which shape they got.
 */
export type ErrorDetails =
  | { kind: "validation"; issues: ValidationIssue[] }
  /**
   * One code, four situations. LISTING_STATE_TRANSITION_INVALID is raised when
   * editing, submitting, archiving or removing an image, and the copy could only
   * describe all four at once. The action and the status it was refused from are
   * exactly the two facts a specific sentence needs.
   */
  | {
      kind: "state_transition";
      action: "edit" | "submit" | "archive" | "remove_image";
      currentStatus: string;
    };

export function validationDetails(issues: ValidationIssue[]): ErrorDetails {
  return { issues, kind: "validation" };
}

export function stateTransitionDetails(
  action: "edit" | "submit" | "archive" | "remove_image",
  currentStatus: string,
): ErrorDetails {
  return { action, currentStatus, kind: "state_transition" };
}

/**
 * Read details off a response payload, or null if there are none.
 *
 * Narrow rather than cast: `details` arrives as JSON from the network and
 * nothing guarantees its shape. A malformed payload becomes "no details" rather
 * than a crash inside a component rendering an error, which would replace one
 * bad experience with a worse one.
 */
export function parseErrorDetails(value: unknown): ErrorDetails | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { kind?: unknown };

  if (candidate.kind === "validation") {
    const issues = (value as { issues?: unknown }).issues;

    if (!Array.isArray(issues)) {
      return null;
    }

    const parsed = issues.filter(
      (issue): issue is ValidationIssue =>
        Boolean(issue) &&
        typeof issue === "object" &&
        typeof (issue as ValidationIssue).field === "string" &&
        typeof (issue as ValidationIssue).rule === "string",
    );

    return parsed.length > 0 ? { issues: parsed, kind: "validation" } : null;
  }

  if (candidate.kind === "state_transition") {
    const { action, currentStatus } = value as {
      action?: unknown;
      currentStatus?: unknown;
    };

    if (typeof action !== "string" || typeof currentStatus !== "string") {
      return null;
    }

    return {
      action: action as "edit" | "submit" | "archive" | "remove_image",
      currentStatus,
      kind: "state_transition",
    };
  }

  return null;
}
