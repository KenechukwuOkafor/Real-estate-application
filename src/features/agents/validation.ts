import { AppError } from "@/lib/api/errors";
import { validationDetails, type ValidationIssue } from "@/lib/api/error-details";
import { VERIFICATION_DOCUMENT_TYPES } from "@/features/agents/types";
import type {
  AgentDraftListingInput,
  AgentListingImageInput,
  AgentProfileInput,
  AgentVerificationSubmissionInput,
} from "@/features/agents/types";

const propertyTypes = new Set([
  "self_contain",
  "1_bedroom",
  "2_bedroom",
  "3_bedroom",
  "shop",
  "lodge_room",
]);

const rentalDurations = new Set(["yearly", "monthly", "sublet"]);

/**
 * Validation failures are AppError, not bare Error.
 *
 * The shared resolver classifies bare messages by string matching, and these
 * messages kept falling outside its patterns: "Self contain listings must have
 * 1 bedroom..." missed `includes("must be")`, and "A listing cannot receive
 * more than 10 images at once." missed `includes("cannot have")` — both
 * resolved to 500 for what is plainly a 422. Typing them removes the class of
 * bug instead of adding more patterns to match.
 */
/**
 * @param issues Which inputs failed and why, for the copy layer to turn into
 * sentences beside the right fields. The message stays a developer's note.
 */
function validationError(message: string, issues: ValidationIssue[] = []) {
  return new AppError(
    "VALIDATION_ERROR",
    message,
    422,
    issues.length > 0 ? validationDetails(issues) : undefined,
  );
}

/**
 * Collects failures instead of throwing at the first one.
 *
 * Throwing early meant a form with three problems reported one, the agent fixed
 * it, submitted, and met the second. Five round trips to fill in a form is a
 * worse experience than no validation message at all, because each one looks
 * like a fresh failure.
 */
class IssueCollector {
  private readonly issues: ValidationIssue[] = [];

  add(field: string, rule: ValidationIssue["rule"], meta?: ValidationIssue["meta"]) {
    this.issues.push(meta ? { field, meta, rule } : { field, rule });
  }

  requireText(field: string, value: string) {
    if (!value.trim()) {
      this.add(field, "required");
    }
  }

  /** Throws once, with everything, or returns having found nothing. */
  throwIfAny(summary: string) {
    if (this.issues.length > 0) {
      throw validationError(summary, this.issues);
    }
  }
}

function assertNonEmpty(value: string, message: string) {
  if (!value.trim()) {
    throw validationError(message);
  }
}

export function validateAgentProfileInput(input: AgentProfileInput) {
  assertNonEmpty(input.displayName, "Display name is required.");
}

export function validateVerificationSubmissionInput(
  input: AgentVerificationSubmissionInput,
) {
  assertNonEmpty(input.fullLegalName, "Full legal name is required.");

  if (input.documents.length === 0) {
    throw validationError("At least one verification document is required.");
  }

  const allowedTypes = new Set(
    VERIFICATION_DOCUMENT_TYPES.map((entry) => entry.value as string),
  );

  for (const document of input.documents) {
    if (!allowedTypes.has(document.documentType)) {
      throw validationError("Select a valid document type.");
    }

    // A path, not a URL. The service checks it against objects that actually
    // exist under this agent's prefix before trusting it.
    assertNonEmpty(document.storagePath, "Document upload is required.");
  }
}

export function validateDraftListingInput(input: AgentDraftListingInput) {
  const issues = new IssueCollector();

  issues.requireText("title", input.title);
  issues.requireText("description", input.description);
  issues.requireText("area", input.area);

  if (!propertyTypes.has(input.propertyType)) {
    issues.add("propertyType", "invalid_option");
  }

  if (input.priceNaira <= 0) {
    issues.add("priceNaira", "must_be_positive");
  }

  if (input.bedrooms < 0) {
    issues.add("bedrooms", "must_not_be_negative");
  }

  if (input.bathrooms < 0) {
    issues.add("bathrooms", "must_not_be_negative");
  }

  /**
   * A business rule wearing validation's clothes.
   *
   * Nothing is wrong with the bedroom count on its own — 2 is a perfectly good
   * number. It is wrong only in combination with this property type, so there
   * is no single field at fault and the agent has two ways to fix it: change
   * the count, or change the type.
   *
   * Filed against `bedrooms` because that is where the correction usually
   * belongs, with a rule the copy layer renders as the relationship rather than
   * as a complaint about the number.
   */
  if (
    input.propertyType === "self_contain" &&
    (input.bedrooms !== 1 || input.bathrooms !== 1)
  ) {
    issues.add("bedrooms", "self_contain_shape");
  }

  collectRentalDurationIssues(input, issues);

  issues.throwIfAny("The listing details are incomplete.");
}

/**
 * The duration and its month count, which are one rule rather than two fields.
 *
 * Enforced here as well as in the database. The CHECK constraint is the
 * guarantee — it holds for PostgREST, a script, or any future caller — but a
 * constraint violation surfaces as a raw Postgres error mapped to a 500, and an
 * agent who forgot to type a month count deserves a 422 telling them so. The
 * database stops the bad row; this stops the bad experience.
 */
function collectRentalDurationIssues(
  input: { rentalDuration: string; subletMonths: number | null },
  issues: IssueCollector,
) {
  if (!rentalDurations.has(input.rentalDuration)) {
    issues.add("rentalDuration", "invalid_option");
    // No point judging the month count against a duration we do not recognise.
    return;
  }

  if (input.rentalDuration === "sublet") {
    if (input.subletMonths === null || input.subletMonths === undefined) {
      issues.add("subletMonths", "required");
      return;
    }

    if (!Number.isInteger(input.subletMonths)) {
      issues.add("subletMonths", "must_be_whole_number");
      return;
    }

    if (input.subletMonths <= 0) {
      issues.add("subletMonths", "must_be_positive");
    }

    return;
  }

  // Meaningless on a yearly or monthly listing, and refused rather than
  // silently dropped: a caller sending one has misunderstood the model, and
  // discarding it would hide that until the value was expected back.
  //
  // The second cross-field rule in this validator. Filed against subletMonths
  // because removing it is the fix, not changing the duration they chose.
  if (input.subletMonths !== null && input.subletMonths !== undefined) {
    issues.add("subletMonths", "not_applicable");
  }
}

/**
 * A proposed change to a live listing.
 *
 * The same rules as a draft, minus the fields a revision may not touch. Written
 * as its own function rather than reusing the draft validator with a partial
 * input, because "which fields may change after approval" is a product decision
 * and it should be readable as a list rather than inferred from what happens to
 * be optional.
 */
export function validateListingRevisionInput(input: {
  amenities: string[];
  description: string;
  priceNaira: number;
  rentalDuration: string;
  subletMonths: number | null;
  title: string;
}) {
  const issues = new IssueCollector();

  issues.requireText("title", input.title);
  issues.requireText("description", input.description);

  if (input.priceNaira <= 0) {
    issues.add("priceNaira", "must_be_positive");
  }

  collectRentalDurationIssues(input, issues);

  issues.throwIfAny("The proposed change is incomplete.");
}

export function validateAgentListingImagesInput(input: AgentListingImageInput) {
  if (input.images.length === 0) {
    throw validationError("At least one image is required.");
  }

  if (input.images.length > 10) {
    throw validationError("A listing cannot receive more than 10 images at once.");
  }

  const seenPositions = new Set<number>();

  for (const image of input.images) {
    assertNonEmpty(image.storagePath, "Image storage path is required.");

    if (!Number.isInteger(image.position) || image.position < 0) {
      throw validationError("Image position must be a non-negative integer.");
    }

    // listing_images has a unique (listing_id, position) constraint, so a
    // duplicate would surface as a raw Postgres error mapped to a 500.
    if (seenPositions.has(image.position)) {
      throw validationError("Image positions must be unique within a request.");
    }

    seenPositions.add(image.position);
  }
}
