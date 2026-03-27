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

function assertNonEmpty(value: string, message: string) {
  if (!value.trim()) {
    throw new Error(message);
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
    throw new Error("At least one verification document is required.");
  }

  for (const document of input.documents) {
    assertNonEmpty(document.type, "Document type is required.");
    assertNonEmpty(document.url, "Document URL is required.");
  }
}

export function validateDraftListingInput(input: AgentDraftListingInput) {
  assertNonEmpty(input.title, "Listing title is required.");
  assertNonEmpty(input.description, "Listing description is required.");
  assertNonEmpty(input.area, "Area is required.");

  if (!propertyTypes.has(input.propertyType)) {
    throw new Error("Invalid property type.");
  }

  if (input.priceNaira <= 0) {
    throw new Error("Price must be greater than zero.");
  }

  if (input.bedrooms < 0 || input.bathrooms < 0) {
    throw new Error("Bedrooms and bathrooms cannot be negative.");
  }

  if (
    input.propertyType === "self_contain" &&
    (input.bedrooms !== 1 || input.bathrooms !== 1)
  ) {
    throw new Error("Self contain listings must have 1 bedroom and 1 bathroom.");
  }
}

export function validateAgentListingImagesInput(input: AgentListingImageInput) {
  if (input.images.length === 0) {
    throw new Error("At least one image is required.");
  }

  if (input.images.length > 10) {
    throw new Error("A listing cannot receive more than 10 images at once.");
  }

  for (const image of input.images) {
    assertNonEmpty(image.storagePath, "Image storage path is required.");
    assertNonEmpty(image.publicUrl, "Image public URL is required.");
    assertNonEmpty(image.mimeType, "Image MIME type is required.");

    if (image.position < 0) {
      throw new Error("Image position cannot be negative.");
    }

    if (image.sizeBytes <= 0) {
      throw new Error("Image size must be greater than zero.");
    }
  }
}
