import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

type InspectableListingRow = Pick<
  Database["public"]["Tables"]["listings"]["Row"],
  "agent_profile_id" | "deleted_at" | "id" | "status" | "title"
> & {
  agent_profiles: Pick<Database["public"]["Tables"]["agent_profiles"]["Row"], "user_id"> | null;
};

type InspectionRequestRow = Database["public"]["Tables"]["inspection_requests"]["Row"];
type ChatRow = Database["public"]["Tables"]["chats"]["Row"];
type InspectionRequestWithListingRow = InspectionRequestRow & {
  listings: Pick<Database["public"]["Tables"]["listings"]["Row"], "id" | "title"> | null;
};

export async function getInspectableListingById(
  client: DbClient,
  listingId: string,
) {
  const { data, error } = await client
    .from("listings")
    .select(
      `
        id,
        title,
        status,
        deleted_at,
        agent_profile_id,
        agent_profiles (
          user_id
        )
      `,
    )
    .eq("id", listingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as InspectableListingRow | null;
}

export async function findActiveInspectionRequest(
  client: DbClient,
  listingId: string,
  requesterUserId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .select("*")
    .eq("listing_id", listingId)
    .eq("requester_user_id", requesterUserId)
    .in("status", ["requested", "accepted"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as InspectionRequestRow | null;
}

export async function createInspectionRequest(
  client: DbClient,
  input: {
    agentProfileId: string;
    expiresAt: string;
    listingId: string;
    message?: string | null;
    requesterUserId: string;
  },
) {
  const { data, error } = await client
    .from("inspection_requests")
    .insert({
      agent_profile_id: input.agentProfileId,
      expires_at: input.expiresAt,
      listing_id: input.listingId,
      message: input.message ?? null,
      requester_user_id: input.requesterUserId,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InspectionRequestRow;
}

export async function createInspectionChat(
  client: DbClient,
  input: {
    agentProfileId: string;
    inspectionRequestId: string;
    listingId: string;
    studentUserId: string;
  },
) {
  const { data, error } = await client
    .from("chats")
    .insert({
      agent_profile_id: input.agentProfileId,
      inspection_request_id: input.inspectionRequestId,
      listing_id: input.listingId,
      student_user_id: input.studentUserId,
      type: "inspection",
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ChatRow;
}

export async function attachChatToInspectionRequest(
  client: DbClient,
  inspectionRequestId: string,
  chatId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .update({
      chat_id: chatId,
    })
    .eq("id", inspectionRequestId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InspectionRequestRow;
}

export async function getInspectionRequestById(
  client: DbClient,
  inspectionRequestId: string,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .select(
      `
        *,
        listings (
          id,
          title
        )
      `,
    )
    .eq("id", inspectionRequestId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as InspectionRequestWithListingRow | null;
}

export async function updateInspectionRequestStatus(
  client: DbClient,
  inspectionRequestId: string,
  status: Database["public"]["Enums"]["inspection_status"],
  extras?: Partial<Database["public"]["Tables"]["inspection_requests"]["Update"]>,
) {
  const { data, error } = await client
    .from("inspection_requests")
    .update({
      ...extras,
      status,
    })
    .eq("id", inspectionRequestId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as InspectionRequestRow;
}

/**
 * Atomic creation via public.create_inspection_request_with_chat.
 *
 * Replaces three sequential writes that had no transaction between them.
 * Returns the same shape the service previously assembled by hand.
 */
export async function createInspectionRequestWithChat(
  client: DbClient,
  input: { expiresAt: string; listingId: string; message: string },
) {
  const { data, error } = await client
    .rpc("create_inspection_request_with_chat", {
      expires_at: input.expiresAt,
      request_message: input.message,
      target_listing_id: input.listingId,
    })
    .single();

  if (error) {
    throw error;
  }

  const created = data as { chat_id: string; inspection_request_id: string };

  const [{ data: request }, { data: chat }] = await Promise.all([
    client
      .from("inspection_requests")
      .select("*")
      .eq("id", created.inspection_request_id)
      .single(),
    client.from("chats").select("*").eq("id", created.chat_id).single(),
  ]);

  return {
    chat: chat as ChatRow,
    inspectionRequest: request as InspectionRequestRow,
  };
}
