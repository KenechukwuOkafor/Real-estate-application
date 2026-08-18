import "server-only";

import { AppError } from "@/lib/api/errors";
import {
  createSupabaseAuthenticatedClient,
  getSupabaseAdminClient,
} from "@/lib/db/supabase";
import {
  attachChatToInspectionRequest,
  createInspectionChat,
  createInspectionRequest,
  findActiveInspectionRequest,
  getInspectionRequestById,
  getInspectableListingById,
  updateInspectionRequestStatus,
} from "@/server/repositories/inspection-repository";
import { getAgentProfileByUserId } from "@/server/repositories/agents-repository";
import { writeAuditLog } from "@/server/services/audit-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

function assertInspectionMessage(message: string) {
  if (!message.trim()) {
    throw new Error("Inspection message is required.");
  }

  if (message.trim().length > 500) {
    throw new Error("Inspection message must be 500 characters or fewer.");
  }
}

export async function requestInspection(input: {
  listingId: string;
  message: string;
}) {
  assertInspectionMessage(input.message);

  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  // SERVICE ROLE for the creation path, deliberately. requestInspection writes
  // three rows with no transaction — the request, the chat, and the backlink —
  // and the chat belongs to both parties, so the seeker's own credentials are
  // the wrong authority for it. A half-applied sequence under RLS would strand
  // a request with no conversation. Reads and the agent's response are
  // RLS-enforced (migration 0012).
  const adminClient = getSupabaseAdminClient();
  const listing = await getInspectableListingById(adminClient, input.listingId);

  if (!listing || listing.deleted_at || listing.status !== "approved") {
    throw new Error("Listing not found.");
  }

  if (listing.agent_profiles?.user_id === appUser.user.id) {
    // AppError rather than a bare message: the shared resolver classifies by
    // string matching, and "cannot request" matches none of its patterns, so
    // this business rule would otherwise resolve to a 500.
    throw new AppError(
      "INSPECTION_SELF_REQUEST",
      "You cannot request an inspection for your own listing.",
      422,
    );
  }

  const activeRequest = await findActiveInspectionRequest(
    adminClient,
    listing.id,
    appUser.user.id,
  );

  if (activeRequest) {
    throw new Error("An active inspection request already exists for this listing.");
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const inspectionRequest = await createInspectionRequest(adminClient, {
    agentProfileId: listing.agent_profile_id,
    expiresAt,
    listingId: listing.id,
    message: input.message.trim(),
    requesterUserId: appUser.user.id,
  });

  const chat = await createInspectionChat(adminClient, {
    agentProfileId: listing.agent_profile_id,
    inspectionRequestId: inspectionRequest.id,
    listingId: listing.id,
    studentUserId: appUser.user.id,
  });

  const updatedRequest = await attachChatToInspectionRequest(
    adminClient,
    inspectionRequest.id,
    chat.id,
  );

  await writeAuditLog({
    action: "inspection_request.created",
    actorUserId: appUser.user.id,
    afterData: {
      expires_at: updatedRequest.expires_at,
      listing_id: updatedRequest.listing_id,
      status: updatedRequest.status,
    },
    entityId: updatedRequest.id,
    entityType: "inspection_request",
    metadata: {
      chatId: chat.id,
    },
  });

  return {
    chat,
    inspectionRequest: updatedRequest,
  };
}

type InspectionDecision = "accepted" | "declined";

/**
 * Parse an agent's response to an inspection request.
 *
 * The route previously coerced with `=== "declined" ? "declined" : "accepted"`,
 * so a missing, misspelled, or malformed decision silently ACCEPTED. Accepting
 * is the consequential branch — it is what commits the agent to an inspection
 * and opens the channel that will later carry an exact address — so it must
 * never be reachable by default. Anything that is not exactly one of the two
 * literals is rejected.
 *
 * Validation lives here rather than in the route because the service is the
 * enforcement boundary (REB-DOM-003: "Authorization MUST always be enforced by
 * backend services"). The parameter is `unknown` so no caller can bypass it by
 * asserting a type at the edge.
 */
function parseInspectionDecision(value: unknown): InspectionDecision {
  if (value === "accepted" || value === "declined") {
    return value;
  }

  throw new AppError(
    "INSPECTION_DECISION_INVALID",
    'Decision must be exactly "accepted" or "declined".',
    422,
  );
}

export async function respondToInspectionRequest(input: {
  decision: unknown;
  inspectionRequestId: string;
}) {
  const decision = parseInspectionDecision(input.decision);
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new Error("Unauthenticated request.");
  }

  if (!appUser.roles.includes("agent")) {
    throw new Error("Agent role is required.");
  }

  // The write below is RLS-respecting: 0012 restricts UPDATE to the owning
  // agent and grants only status/responded_at, so requester information stays
  // immutable no matter what this service does.
  const client = await createSupabaseAuthenticatedClient();
  const agentProfile = await getAgentProfileByUserId(client, appUser.user.id);

  if (!agentProfile) {
    throw new Error("Agent profile not found.");
  }

  // SERVICE ROLE for this read specifically, to preserve existing behaviour.
  //
  // RLS and the service layer disagree here, and the disagreement is
  // observable. Reading through the authenticated client would deny agent B
  // the row entirely, so the ownership branch below would never fire and a
  // request belonging to someone else would answer 404 "not found" instead of
  // 403 INSPECTION_NOT_OWNED.
  //
  // The RLS answer is arguably the better one — 404 closes the existence
  // oracle that lets a caller probe which inspection request ids are real —
  // but that is a product decision, not one to make as a side effect of a
  // policy migration. Flagged for decision; behaviour left unchanged.
  const adminClient = getSupabaseAdminClient();
  const inspectionRequest = await getInspectionRequestById(
    adminClient,
    input.inspectionRequestId,
  );

  if (!inspectionRequest) {
    throw new Error("Inspection request not found.");
  }

  if (inspectionRequest.agent_profile_id !== agentProfile.id) {
    // Was resolving to 500: the old hand-rolled mapping in the respond route
    // matched "does not belong" and returned 422, and converting that route to
    // the shared resolver dropped the rule without replacing it. An ownership
    // denial answering 500 is exactly the broken contract this pass exists to
    // remove.
    throw new AppError(
      "INSPECTION_NOT_OWNED",
      "This inspection request belongs to another agent.",
      403,
    );
  }

  if (inspectionRequest.status !== "requested") {
    // AppError rather than a bare message: `includes("cannot be")` in the
    // shared resolver would label this with the listing code
    // LISTING_STATE_TRANSITION_INVALID.
    throw new AppError(
      "INSPECTION_STATE_TRANSITION_INVALID",
      `Inspection request cannot be responded to from status ${inspectionRequest.status}.`,
      422,
    );
  }

  const now = new Date().toISOString();
  const updated = await updateInspectionRequestStatus(
    client,
    inspectionRequest.id,
    decision,
    {
      responded_at: now,
    },
  );

  await writeAuditLog({
    action:
      decision === "accepted"
        ? "inspection_request.accepted"
        : "inspection_request.declined",
    actorUserId: appUser.user.id,
    afterData: {
      responded_at: updated.responded_at,
      status: updated.status,
    },
    entityId: updated.id,
    entityType: "inspection_request",
  });

  return updated;
}
