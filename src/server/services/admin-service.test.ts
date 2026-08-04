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

vi.mock("@/lib/db/supabase", () => ({
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/agents-repository", () => ({
  getListingById: vi.fn(),
  getVerificationSubmissionById,
  listModerationQueue: vi.fn(),
  listVerificationQueue: vi.fn(),
  markVerificationSubmissionReviewed,
  updateAgentVerificationStatus,
  updateListingStatus: vi.fn(),
}));

vi.mock("@/server/repositories/users-repository", () => ({ ensureUserRoles }));

vi.mock("@/server/services/audit-service", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

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
