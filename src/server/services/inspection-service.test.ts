import { beforeEach, describe, expect, it, vi } from "vitest";

const getAgentProfileByUserId = vi.fn();
const getCurrentAppUser = vi.fn();
const getInspectionRequestById = vi.fn();
const updateInspectionRequestStatus = vi.fn();

vi.mock("@/lib/db/supabase", () => ({
  createSupabaseAuthenticatedClient: vi.fn(async () => ({})),
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/server/repositories/inspection-repository", () => ({
  attachChatToInspectionRequest: vi.fn(),
  createInspectionRequestWithChat: vi.fn(),
  findActiveInspectionRequest: vi.fn(),
  getInspectableListingById: vi.fn(),
  getInspectionRequestById,
  updateInspectionRequestStatus,
}));

vi.mock("@/server/repositories/agents-repository", () => ({
  getAgentProfileByUserId,
}));

vi.mock("@/server/services/audit-service", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/server/services/user-sync-service", () => ({ getCurrentAppUser }));

const { respondToInspectionRequest } = await import(
  "@/server/services/inspection-service"
);

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentAppUser.mockResolvedValue({
    roles: ["agent"],
    user: { id: "user_1" },
  });
  getAgentProfileByUserId.mockResolvedValue({ id: "agent_profile_1" });
  getInspectionRequestById.mockResolvedValue({
    agent_profile_id: "agent_profile_1",
    id: "inspection_1",
    status: "requested",
  });
  updateInspectionRequestStatus.mockImplementation(
    async (_client, id: string, status: string) => ({
      id,
      responded_at: "2026-08-17T00:00:00.000Z",
      status,
    }),
  );
});

describe("respondToInspectionRequest", () => {
  it("accepts an explicit accept", async () => {
    await expect(
      respondToInspectionRequest({
        decision: "accepted",
        inspectionRequestId: "inspection_1",
      }),
    ).resolves.toMatchObject({ status: "accepted" });
  });

  it("declines an explicit decline", async () => {
    await expect(
      respondToInspectionRequest({
        decision: "declined",
        inspectionRequestId: "inspection_1",
      }),
    ).resolves.toMatchObject({ status: "declined" });
  });

  // Accepting is what commits the agent and opens the channel that will later
  // carry an exact address. It must never be the fallback for bad input.
  const malformed: Array<[string, unknown]> = [
    ["missing", undefined],
    ["null", null],
    ["empty string", ""],
    ["misspelled", "accept"],
    ["wrong case", "Accepted"],
    ["boolean", true],
    ["number", 1],
    ["object", { decision: "accepted" }],
    ["array", ["accepted"]],
  ];

  it.each(malformed)("422s on a %s decision instead of accepting", async (_label, value) => {
    await expect(
      respondToInspectionRequest({
        decision: value,
        inspectionRequestId: "inspection_1",
      }),
    ).rejects.toMatchObject({
      code: "INSPECTION_DECISION_INVALID",
      httpStatus: 422,
    });

    expect(updateInspectionRequestStatus).not.toHaveBeenCalled();
  });

  it("rejects a malformed decision before any authorization work", async () => {
    // Validation is cheap and unauthenticated-safe, so it runs first. This
    // also means a bad payload cannot probe for request existence.
    await expect(
      respondToInspectionRequest({
        decision: "maybe",
        inspectionRequestId: "inspection_1",
      }),
    ).rejects.toThrow();

    expect(getCurrentAppUser).not.toHaveBeenCalled();
    expect(getInspectionRequestById).not.toHaveBeenCalled();
  });
});
