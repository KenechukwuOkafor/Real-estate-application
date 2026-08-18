import { AppError } from "@/lib/api/errors";
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
function validationError(message: string) {
  return new AppError("VALIDATION_ERROR", message, 422);
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
  assertNonEmpty(input.title, "Listing title is required.");
  assertNonEmpty(input.description, "Listing description is required.");
  assertNonEmpty(input.area, "Area is required.");

  if (!propertyTypes.has(input.propertyType)) {
    throw validationError("Invalid property type.");
  }

  if (input.priceNaira <= 0) {
    throw validationError("Price must be greater than zero.");
  }

  if (input.bedrooms < 0 || input.bathrooms < 0) {
    throw validationError("Bedrooms and bathrooms cannot be negative.");
  }

  if (
    input.propertyType === "self_contain" &&
    (input.bedrooms !== 1 || input.bathrooms !== 1)
  ) {
    throw validationError("Self contain listings must have 1 bedroom and 1 bathroom.");
  }
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
