import { beforeEach, describe, expect, it, vi } from "vitest";

const createDraftListing = vi.fn();
const createVerificationSubmission = vi.fn();
const listUploadedListingImageObjects = vi.fn();
const registerListingImages = vi.fn();
const updateListingCoverImage = vi.fn();
const getAgentProfileByUserId = vi.fn();
const getCurrentAppUser = vi.fn();
const getCurrentListingEntitlementSubscription = vi.fn();
const getOwnedListing = vi.fn();
const markAgentVerificationPending = vi.fn();
const updateAgentFreeListingQuota = vi.fn();
const updateListingStatus = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  createSupabaseAuthenticatedClient: vi.fn(async () => ({})),
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/agents-repository", () => ({
  createDraftListing,
  createVerificationSubmission,
  getAgentProfileByUserId,
  getAgentProfileWithSubscriptionsByUserId: vi.fn(),
  getOwnedListing,
  listAgentListings: vi.fn(),
  markAgentVerificationPending,
  registerListingImages,
  updateAgentFreeListingQuota,
  updateDraftListing: vi.fn(),
  updateListingCoverImage,
  updateListingStatus,
  upsertAgentProfile: vi.fn(),
}));

vi.mock("@/server/repositories/subscriptions-repository", () => ({
  getCurrentListingEntitlementSubscription,
}));

vi.mock("@/server/services/audit-service", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/server/services/listing-media-service", () => ({
  createListingImageUploadTargets: vi.fn(),
  listUploadedListingImageObjects,
}));

vi.mock("@/server/services/user-sync-service", () => ({ getCurrentAppUser }));

const {
  createCurrentAgentDraftListing,
  registerCurrentAgentListingImages,
  submitCurrentAgentListingForReview,
  submitCurrentAgentVerification,
} = await import("@/server/services/agent-service");

const draftInput = {
  amenities: [],
  area: "Odenigbo",
  bathrooms: 1,
  bedrooms: 1,
  description: "A tidy self contain close to campus.",
  priceNaira: 250000,
  propertyType: "self_contain" as const,
  title: "Self contain near UNN",
};

function agentProfile(overrides: Record<string, unknown> = {}) {
  return {
    free_listing_quota: 0,
    id: "agent_profile_1",
    user_id: "user_1",
    verification_status: "not_submitted",
    ...overrides,
  };
}

function ownedListing(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing_1",
    listing_images: [
      { deleted_at: null, id: "img_1" },
      { deleted_at: null, id: "img_2" },
      { deleted_at: null, id: "img_3" },
    ],
    status: "draft",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentAppUser.mockResolvedValue({
    roles: ["agent"],
    user: { id: "user_1" },
  });
  getAgentProfileByUserId.mockResolvedValue(agentProfile());
  getCurrentListingEntitlementSubscription.mockResolvedValue(null);
  createDraftListing.mockResolvedValue({
    area: "Odenigbo",
    id: "listing_1",
    price_naira: 250000,
    status: "draft",
    title: "Self contain near UNN",
  });
  createVerificationSubmission.mockResolvedValue({ id: "submission_1" });
  markAgentVerificationPending.mockResolvedValue({
    id: "agent_profile_1",
    verification_status: "pending_review",
  });
  getOwnedListing.mockResolvedValue(ownedListing());
  updateListingStatus.mockResolvedValue({
    id: "listing_1",
    status: "pending_review",
    submitted_at: "2026-08-17T00:00:00.000Z",
  });
  updateAgentFreeListingQuota.mockImplementation(
    async (_client, _id, next: number) => agentProfile({ free_listing_quota: next }),
  );
  registerListingImages.mockResolvedValue([{ id: "img_new_1" }]);
  updateListingCoverImage.mockResolvedValue({ id: "listing_1" });
  listUploadedListingImageObjects.mockResolvedValue(
    new Map([
      [
        "listings/listing_1/abc-photo.webp",
        {
          mimeType: "image/webp",
          publicUrl: "https://storage.example/listings/listing_1/abc-photo.webp",
          sizeBytes: 51_200,
          storagePath: "listings/listing_1/abc-photo.webp",
        },
      ],
    ]),
  );
});

describe("createCurrentAgentDraftListing", () => {
  it("lets an unverified agent with no quota create a draft", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ free_listing_quota: 0, verification_status: "not_submitted" }),
    );

    await expect(
      createCurrentAgentDraftListing(draftInput),
    ).resolves.toMatchObject({ listing: { status: "draft" } });

    expect(createDraftListing).toHaveBeenCalled();
  });

  it("never consumes quota to create a draft", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ free_listing_quota: 3, verification_status: "verified" }),
    );

    await createCurrentAgentDraftListing(draftInput);

    expect(updateAgentFreeListingQuota).not.toHaveBeenCalled();
  });

  it("still requires the agent role", async () => {
    getCurrentAppUser.mockResolvedValue({
      roles: ["student"],
      user: { id: "user_1" },
    });

    await expect(createCurrentAgentDraftListing(draftInput)).rejects.toThrow(
      "Agent role is required.",
    );
  });
});

describe("submitCurrentAgentListingForReview", () => {
  it("rejects an unverified agent even when they hold quota", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ free_listing_quota: 3, verification_status: "not_submitted" }),
    );

    await expect(
      submitCurrentAgentListingForReview("listing_1"),
    ).rejects.toThrow("AGENT_NOT_VERIFIED");

    expect(updateListingStatus).not.toHaveBeenCalled();
  });

  it("lets a verified agent with quota submit and spends one slot", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ free_listing_quota: 3, verification_status: "verified" }),
    );

    await expect(
      submitCurrentAgentListingForReview("listing_1"),
    ).resolves.toMatchObject({ listing: { status: "pending_review" } });

    // next = 2, expected = 3 — the compare-and-set guard.
    expect(updateAgentFreeListingQuota).toHaveBeenCalledWith(
      {},
      "agent_profile_1",
      2,
      3,
    );
  });

  it("rejects a verified agent with no quota and no subscription", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ free_listing_quota: 0, verification_status: "verified" }),
    );

    await expect(
      submitCurrentAgentListingForReview("listing_1"),
    ).rejects.toThrow("LISTING_SUBSCRIPTION_REQUIRED");

    expect(updateListingStatus).not.toHaveBeenCalled();
  });

  it("passes the observed status as the compare-and-set guard", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ free_listing_quota: 3, verification_status: "verified" }),
    );
    getOwnedListing.mockResolvedValue(ownedListing({ status: "rejected" }));

    await submitCurrentAgentListingForReview("listing_1");

    expect(updateListingStatus).toHaveBeenCalledWith(
      {},
      "listing_1",
      "pending_review",
      "rejected",
      expect.objectContaining({ submitted_at: expect.any(String) }),
    );
  });

  it("does not spend a slot when the guarded status write loses a race", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ free_listing_quota: 3, verification_status: "verified" }),
    );
    updateListingStatus.mockRejectedValue(new Error("LISTING_STATE_CONFLICT"));

    await expect(
      submitCurrentAgentListingForReview("listing_1"),
    ).rejects.toThrow("LISTING_STATE_CONFLICT");

    expect(updateAgentFreeListingQuota).not.toHaveBeenCalled();
  });
});

describe("registerCurrentAgentListingImages", () => {
  const uploadedPath = "listings/listing_1/abc-photo.webp";

  it("registers an image that was actually uploaded for this listing", async () => {
    await expect(
      registerCurrentAgentListingImages({
        images: [{ position: 0, storagePath: uploadedPath }],
        listingId: "listing_1",
      }),
    ).resolves.toMatchObject({ count: 4 });
  });

  it("persists storage metadata rather than anything the caller could claim", async () => {
    await registerCurrentAgentListingImages({
      images: [{ position: 0, storagePath: uploadedPath }],
      listingId: "listing_1",
    });

    expect(registerListingImages).toHaveBeenCalledWith(
      {},
      {
        images: [
          {
            mimeType: "image/webp",
            position: 0,
            publicUrl:
              "https://storage.example/listings/listing_1/abc-photo.webp",
            sizeBytes: 51_200,
            storagePath: uploadedPath,
          },
        ],
        listingId: "listing_1",
      },
    );
  });

  it("rejects a path that was never uploaded", async () => {
    await expect(
      registerCurrentAgentListingImages({
        images: [
          { position: 0, storagePath: "listings/listing_1/never-uploaded.webp" },
        ],
        listingId: "listing_1",
      }),
    ).rejects.toMatchObject({
      code: "LISTING_IMAGE_NOT_UPLOADED",
      httpStatus: 422,
    });

    expect(registerListingImages).not.toHaveBeenCalled();
  });

  it("rejects a path belonging to another listing", async () => {
    await expect(
      registerCurrentAgentListingImages({
        images: [{ position: 0, storagePath: "listings/other_listing/x.webp" }],
        listingId: "listing_1",
      }),
    ).rejects.toMatchObject({ code: "LISTING_IMAGE_NOT_UPLOADED" });

    expect(registerListingImages).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary storage path", async () => {
    await expect(
      registerCurrentAgentListingImages({
        images: [
          { position: 0, storagePath: "../../other-bucket/secret.png" },
        ],
        listingId: "listing_1",
      }),
    ).rejects.toMatchObject({ code: "LISTING_IMAGE_NOT_UPLOADED" });

    expect(registerListingImages).not.toHaveBeenCalled();
  });

  it("rejects the whole batch when any one path is unverifiable", async () => {
    await expect(
      registerCurrentAgentListingImages({
        images: [
          { position: 0, storagePath: uploadedPath },
          { position: 1, storagePath: "listings/listing_1/forged.webp" },
        ],
        listingId: "listing_1",
      }),
    ).rejects.toMatchObject({ code: "LISTING_IMAGE_NOT_UPLOADED" });

    expect(registerListingImages).not.toHaveBeenCalled();
  });
});

describe("submitCurrentAgentVerification", () => {
  const submission = {
    documents: [{ type: "id_card", url: "https://example.com/id" }],
    fullLegalName: "Ada Obi",
  };

  it("allows a first submission", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ verification_status: "not_submitted" }),
    );

    await expect(
      submitCurrentAgentVerification(submission),
    ).resolves.toMatchObject({
      agentProfile: { verification_status: "pending_review" },
    });
  });

  it("allows resubmission after rejection", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ verification_status: "rejected" }),
    );

    await expect(submitCurrentAgentVerification(submission)).resolves.toBeTruthy();
  });

  it("blocks a verified agent from resubmitting", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ verification_status: "verified" }),
    );

    await expect(
      submitCurrentAgentVerification(submission),
    ).rejects.toMatchObject({ code: "AGENT_ALREADY_VERIFIED", httpStatus: 409 });

    // The bug this guards: markAgentVerificationPending would have written the
    // profile back to pending_review and hidden it from the public RLS policy.
    expect(markAgentVerificationPending).not.toHaveBeenCalled();
    expect(createVerificationSubmission).not.toHaveBeenCalled();
  });

  it("blocks resubmission while a review is already in progress", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ verification_status: "pending_review" }),
    );

    await expect(
      submitCurrentAgentVerification(submission),
    ).rejects.toMatchObject({ code: "VERIFICATION_REVIEW_IN_PROGRESS" });
  });

  it("blocks a suspended agent from clearing their own suspension", async () => {
    getAgentProfileByUserId.mockResolvedValue(
      agentProfile({ verification_status: "suspended" }),
    );

    await expect(
      submitCurrentAgentVerification(submission),
    ).rejects.toMatchObject({ code: "VERIFICATION_NOT_SUBMITTABLE" });
  });
});
