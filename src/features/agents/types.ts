import type { Database } from "@/types/database";

export type AgentVerificationStatus =
  Database["public"]["Enums"]["agent_verification_status"];

export type AgentProfileInput = {
  bio?: string;
  displayName: string;
};

/**
 * Verification submission.
 *
 * `documents` used to be agent-typed "type|url" strings — links to wherever
 * the agent happened to host a photo of their government ID. Nothing ever
 * reached Ruvo, so BR-MEDIA-003 and BR-SEC-005 could not be met by any amount
 * of application code. They are now references to objects already uploaded to
 * the private verification-documents bucket.
 */
export type AgentVerificationSubmissionInput = {
  documents: Array<{
    documentType: string;
    originalFilename?: string;
    storagePath: string;
  }>;
  fullLegalName: string;
  notes?: string;
};

export type VerificationDocumentUploadRequest = {
  files: Array<{ contentType: string; fileName: string }>;
};

/** REB-ARCH-005 lists these as the verification document kinds. */
export const VERIFICATION_DOCUMENT_TYPES = [
  { label: "Government ID", value: "government_id" },
  { label: "CAC certificate", value: "cac_certificate" },
  { label: "Utility bill", value: "utility_bill" },
  { label: "Agency license", value: "agency_license" },
] as const;

export type AgentDraftListingInput = {
  amenities: string[];
  area: string;
  bathrooms: number;
  bedrooms: number;
  city?: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  priceNaira: number;
  propertyType: Database["public"]["Enums"]["property_type"];
  rentalDuration: Database["public"]["Enums"]["rental_duration"];
  state?: string;
  /**
   * Months, and only for a sublet.
   *
   * `null` rather than optional, so "not a sublet" is a value the caller states
   * rather than a field they forgot. The database enforces the same pairing in
   * a CHECK, because a form-only rule holds only until the next caller.
   */
  subletMonths: number | null;
  title: string;
};

export type AgentProfileSummary = {
  bio: string | null;
  displayName: string;
  id: string;
  userId: string;
  verificationStatus: AgentVerificationStatus;
};

/**
 * Registration payload for already-uploaded listing images.
 *
 * Only the storage path and ordering come from the client. publicUrl, mimeType
 * and sizeBytes are derived server-side from the object that actually exists in
 * the bucket — they used to be client-supplied and were written to the database
 * unverified.
 */
export type AgentListingImageInput = {
  images: Array<{
    position: number;
    storagePath: string;
  }>;
  listingId: string;
};

export type AgentListingImageUploadRequest = {
  files: Array<{
    contentType: string;
    fileName: string;
  }>;
  listingId: string;
};
