import "server-only";

import {
  effectiveInspectionStatus,
  isAwaitingResponse,
  minutesRemaining,
  type InspectionStatus,
} from "@/features/inspections/expiry";
import { AppError } from "@/lib/api/errors";
import { createSupabaseAuthenticatedClient } from "@/lib/db/supabase";
import {
  countUnreadMessagesByChat,
  createInspectionRequestWithChat,
  findActiveInspectionRequest,
  getInspectionRequestById,
  findCounterpartyNames,
  getInspectableListingById,
  listAgentInspectionRequests,
  markChatMessagesRead,
  updateInspectionRequestStatus,
} from "@/server/repositories/inspection-repository";
import { getAgentProfileByUserId } from "@/server/repositories/agents-repository";
import { writeAuditLog } from "@/server/services/audit-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

function assertInspectionMessage(message: string) {
  if (!message.trim()) {
    throw new AppError("VALIDATION_ERROR", "Inspection message is required.");
  }

  if (message.trim().length > 500) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Inspection message must be 500 characters or fewer.",
    );
  }
}

export async function requestInspection(input: {
  listingId: string;
  message: string;
}) {
  assertInspectionMessage(input.message);

  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  // One statement, therefore one transaction. The three writes — request, chat,
  // and the backlink between them — used to be sequential with no transaction,
  // so a failure between them stranded a request with no conversation. The
  // function is SECURITY DEFINER and re-validates every rule below, so this
  // path no longer needs the service-role client at all.
  const client = await createSupabaseAuthenticatedClient();
  const listing = await getInspectableListingById(client, input.listingId);

  if (!listing || listing.deleted_at || listing.status !== "approved") {
    throw new AppError("NOT_FOUND", "Listing not found.");
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
    client,
    listing.id,
    appUser.user.id,
  );

  if (activeRequest) {
    throw new AppError(
      "INSPECTION_ALREADY_ACTIVE",
      "An active inspection request already exists for this listing.",
    );
  }

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { chat, inspectionRequest: updatedRequest } =
    await createInspectionRequestWithChat(client, {
      expiresAt,
      listingId: listing.id,
      message: input.message.trim(),
    });

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
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  if (!appUser.roles.includes("agent")) {
    throw new AppError("UNAUTHORIZED", "Agent role is required.");
  }

  // The write below is RLS-respecting: 0012 restricts UPDATE to the owning
  // agent and grants only status/responded_at, so requester information stays
  // immutable no matter what this service does.
  const client = await createSupabaseAuthenticatedClient();
  const agentProfile = await getAgentProfileByUserId(client, appUser.user.id);

  if (!agentProfile) {
    throw new AppError("AGENT_PROFILE_NOT_FOUND", "Agent profile not found.");
  }

  // Read through the caller's own credentials. RLS restricts inspection
  // requests to their two parties, so an agent who does not own this one gets
  // nothing back and the request reads as "not found" — a 404 rather than the
  // 403 this used to return.
  //
  // That is deliberate. A 403 confirms the id names a real request, which lets
  // a caller enumerate valid ids; the 404 closes that oracle. The ownership
  // branch below is retained as defence in depth for the case where a future
  // policy change widens the read.
  const inspectionRequest = await getInspectionRequestById(
    client,
    input.inspectionRequestId,
  );

  if (!inspectionRequest) {
    throw new AppError("INSPECTION_NOT_FOUND", "Inspection request not found.");
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

  /**
   * Expired, checked before status.
   *
   * The stored status stays 'requested' forever — expiry is evaluated on read,
   * so nothing rewrites the column. Without this an agent could accept days
   * late and commit a seeker who had long since arranged something else, and
   * the acceptance would look entirely legitimate to every other check.
   */
  if (!isAwaitingResponse(inspectionRequest) && inspectionRequest.status === "requested") {
    throw new AppError(
      "INSPECTION_EXPIRED",
      "This inspection request passed its 48 hour window and can no longer be answered.",
      422,
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

export type AgentInspectionInboxItem = {
  chatId: string | null;
  effectiveStatus: InspectionStatus;
  /**
   * The deadline itself, so the client can recompute rather than trust a
   * number that was true when the page was built.
   */
  expiresAt: string | null;
  id: string;
  listingSlug: string | null;
  listingTitle: string;
  message: string;
  minutesRemaining: number | null;
  requestedAt: string;
  requesterName: string;
  unreadMessageCount: number;
};

/**
 * The signed-in agent's inspection inbox.
 *
 * Everything the surface needs, resolved on the server: the effective status
 * (not the stored one — see features/inspections/expiry), the countdown in
 * minutes, and the unread count for accepted requests.
 *
 * `now` is captured once and threaded through every row. Calling new Date()
 * per row would let one request read 'requested' and the next 'expired' from
 * the same page load, and a list that disagrees with itself is worse than one
 * that is a few milliseconds stale.
 */
export async function listCurrentAgentInspectionRequests(): Promise<
  AgentInspectionInboxItem[]
> {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  if (!appUser.roles.includes("agent")) {
    throw new AppError("UNAUTHORIZED", "Agent role is required.");
  }

  const client = await createSupabaseAuthenticatedClient();
  const agentProfile = await getAgentProfileByUserId(client, appUser.user.id);

  if (!agentProfile) {
    throw new AppError("AGENT_PROFILE_NOT_FOUND", "Agent profile not found.");
  }

  const requests = await listAgentInspectionRequests(client, agentProfile.id);
  const now = new Date();

  // Only accepted requests have a conversation worth counting. A declined or
  // expired request's chat, if one exists, is not something we are asking the
  // agent to attend to.
  const chatIds = requests
    .filter(
      (request) => effectiveInspectionStatus(request, now) === "accepted",
    )
    .map((request) => request.chats?.id)
    .filter((id): id is string => Boolean(id));

  const [unreadCounts, names] = await Promise.all([
    countUnreadMessagesByChat(client, chatIds, appUser.user.id),
    findCounterpartyNames(
      client,
      requests.map((request) => request.requester_user_id),
    ),
  ]);

  return requests.map((request) => ({
    chatId: request.chats?.id ?? null,
    effectiveStatus: effectiveInspectionStatus(request, now),
    expiresAt: request.expires_at,
    id: request.id,
    listingSlug: request.listings?.slug ?? null,
    // A listing the agent has since archived still has a request attached to
    // it, and "(listing removed)" is a truer answer than an empty row.
    listingTitle: request.listings?.title ?? "(listing removed)",
    message: request.message ?? "",
    minutesRemaining: minutesRemaining(request, now),
    requestedAt: request.requested_at,
    // "A seeker" is the genuine last resort — a user with no name recorded.
    // It used to be what EVERY row rendered, because the name was read through
    // an embed on a table agents cannot see into. See migration 0025.
    requesterName:
      names.get(request.requester_user_id)?.trim() || "A seeker",
    unreadMessageCount: request.chats?.id
      ? (unreadCounts.get(request.chats.id) ?? 0)
      : 0,
  }));
}

/**
 * Mark this chat's incoming messages read, on behalf of the signed-in user.
 *
 * Called when a chat is opened. Failing silently is deliberate: not clearing a
 * badge is a cosmetic problem, and an error boundary over the conversation
 * itself would turn it into a real one.
 */
export async function markChatRead(chatId: string) {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    return;
  }

  const client = await createSupabaseAuthenticatedClient();

  try {
    await markChatMessagesRead(client, chatId, appUser.user.id);
  } catch {
    // Policy from 0024 confines this to messages the caller received in a chat
    // they are party to, so a refusal here means the caller had no business
    // marking them anyway.
  }
}
