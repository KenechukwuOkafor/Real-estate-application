import type { Database } from "@/types/database";

export type AgentVerificationStatus =
  Database["public"]["Enums"]["agent_verification_status"];

export type AgentProfileInput = {
  bio?: string;
  displayName: string;
};

export type AgentVerificationSubmissionInput = {
  documents: Array<{
    type: string;
    url: string;
  }>;
  fullLegalName: string;
  notes?: string;
};

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
  state?: string;
  title: string;
};

export type AgentProfileSummary = {
  bio: string | null;
  displayName: string;
  id: string;
  userId: string;
  verificationStatus: AgentVerificationStatus;
};

export type AgentListingImageInput = {
  images: Array<{
    mimeType: string;
    position: number;
    publicUrl: string;
    sizeBytes: number;
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
