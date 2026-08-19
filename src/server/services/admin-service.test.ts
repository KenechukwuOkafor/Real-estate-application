import { beforeEach, describe, expect, it, vi } from "vitest";

const callOrder: string[] = [];

const ensureUserRoles = vi.fn(async () => {
  callOrder.push("ensureUserRoles");
  return [];
});
const updateAgentVerificationStatus = vi.fn(async () => {
  callOrder.push("updateAgentVerificationStatus");
  return {
    id: "agent_profile_1",
    rejection_reason: null,
    verification_status: "verified",
    verified_at: "2026-08-04T00:00:00.000Z",
    verified_by: "admin_user_1",
  };
});
const getVerificationSubmissionById = vi.fn();
const markVerificationSubmissionReviewed = vi.fn(async () => undefined);
// Return type is spelled out because the repository returns null when the
// quota guard matched nothing, and tests exercise that branch.
type GrantedQuota = { free_listing_quota: number; id: string } | null;

const grantFreeListingQuotaIfUnset = vi.fn(async (): Promise<GrantedQuota> => {
  callOrder.push("grantFreeListingQuotaIfUnset");
  return { free_listing_quota: 3, id: "agent_profile_1" };
});
const writeAuditLog = vi.fn(async () => undefined);

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/agents-repository", () => ({
  getListingById: vi.fn(),
  getVerificationSubmissionById,
  grantFreeListingQuotaIfUnset,
  listModerationQueue: vi.fn(),
  listVerificationQueue: vi.fn(),
  markVerificationSubmissionReviewed,
  updateAgentVerificationStatus,
  updateListingStatus: vi.fn(),
}));

vi.mock("@/server/repositories/users-repository", () => ({ ensureUserRoles }));

vi.mock("@/server/services/audit-service", () => ({ writeAuditLog }));

vi.mock("@/server/services/user-sync-service", () => ({
  getCurrentAppUser: vi.fn(async () => ({
    roles: ["admin"],
    user: { id: "admin_user_1" },
  })),
}));

const { approveAgentVerificationAsAdmin } = await import(
  "@/server/services/admin-service"
);

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  // mockImplementation, not mockResolvedValue: the ordering assertions below
  // depend on this pushing to callOrder, which a plain resolved value drops.
  grantFreeListingQuotaIfUnset.mockImplementation(async () => {
    callOrder.push("grantFreeListingQuotaIfUnset");
    return { free_listing_quota: 3, id: "agent_profile_1" };
  });
  getVerificationSubmissionById.mockResolvedValue({
    agent_profile_id: "agent_profile_1",
    agent_profiles: {
      id: "agent_profile_1",
      user_id: "agent_user_1",
      verification_status: "pending_review",
    },
    id: "submission_1",
    reviewed_at: null,
  });
});

describe("approveAgentVerificationAsAdmin", () => {
  it("grants the agent role to the submitting user", async () => {
    await approveAgentVerificationAsAdmin("submission_1");

    expect(ensureUserRoles).toHaveBeenCalledWith({}, "agent_user_1", ["agent"]);
  });

  it("grants the role only after the verification status is written", async () => {
    await approveAgentVerificationAsAdmin("submission_1");

    expect(callOrder.indexOf("ensureUserRoles")).toBeGreaterThan(
      callOrder.indexOf("updateAgentVerificationStatus"),
    );
  });

  it("grants the verified listing quota", async () => {
    await approveAgentVerificationAsAdmin("submission_1");

    expect(grantFreeListingQuotaIfUnset).toHaveBeenCalledWith(
      {},
      "agent_profile_1",
      3,
    );
  });

  it("audits the quota grant", async () => {
    await approveAgentVerificationAsAdmin("submission_1");

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_profile.listing_quota_granted",
        actorUserId: "admin_user_1",
        afterData: { free_listing_quota: 3 },
        entityId: "agent_profile_1",
        entityType: "agent_profile",
      }),
    );
  });

  it("leaves an existing non-zero quota untouched and does not audit a grant", async () => {
    // The repository guards on quota = 0 and returns null when it matched
    // nothing, which is how "they already had 5" reaches the service.
    grantFreeListingQuotaIfUnset.mockImplementation(async () => null);

    await approveAgentVerificationAsAdmin("submission_1");

    expect(writeAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: "agent_profile.listing_quota_granted",
      }),
    );
  });

  it("grants the quota before the role, so a failed grant never leaves a publishable agent with no slots", async () => {
    await approveAgentVerificationAsAdmin("submission_1");

    expect(callOrder.indexOf("grantFreeListingQuotaIfUnset")).toBeGreaterThan(
      callOrder.indexOf("updateAgentVerificationStatus"),
    );
    expect(callOrder.indexOf("ensureUserRoles")).toBeGreaterThan(
      callOrder.indexOf("grantFreeListingQuotaIfUnset"),
    );
  });

  it("does not grant a quota when the submission was already reviewed", async () => {
    getVerificationSubmissionById.mockResolvedValue({
      agent_profile_id: "agent_profile_1",
      agent_profiles: {
        id: "agent_profile_1",
        user_id: "agent_user_1",
        verification_status: "pending_review",
      },
      id: "submission_1",
      reviewed_at: "2026-08-01T00:00:00.000Z",
    });

    await expect(
      approveAgentVerificationAsAdmin("submission_1"),
    ).rejects.toThrow("already been reviewed");

    expect(grantFreeListingQuotaIfUnset).not.toHaveBeenCalled();
  });

  it("does not grant a role when the submission was already reviewed", async () => {
    getVerificationSubmissionById.mockResolvedValue({
      agent_profile_id: "agent_profile_1",
      agent_profiles: {
        id: "agent_profile_1",
        user_id: "agent_user_1",
        verification_status: "pending_review",
      },
      id: "submission_1",
      reviewed_at: "2026-08-01T00:00:00.000Z",
    });

    await expect(
      approveAgentVerificationAsAdmin("submission_1"),
    ).rejects.toThrow("already been reviewed");

    expect(ensureUserRoles).not.toHaveBeenCalled();
  });
});
