import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

type DbClient = SupabaseClient<Database>;

type ChatRow = Database["public"]["Tables"]["chats"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export type ChatSummaryRow = ChatRow & {
  inspection_requests:
    | Pick<
        Database["public"]["Tables"]["inspection_requests"]["Row"],
        | "agent_profile_id"
        | "expires_at"
        | "id"
        | "message"
        | "requested_at"
        | "requester_user_id"
        | "responded_at"
        | "status"
      >
    | null;
  listings:
    | Pick<Database["public"]["Tables"]["listings"]["Row"], "id" | "slug" | "title">
    | null;
  student: Pick<Database["public"]["Tables"]["users"]["Row"], "full_name" | "id"> | null;
};

export async function listChatsForUser(
  client: DbClient,
  input: {
    agentProfileId?: string | null;
    userId: string;
  },
) {
  let query = client
    .from("chats")
    .select(
      `
        *,
        inspection_requests!chats_inspection_request_id_fkey (
          id,
          requester_user_id,
          agent_profile_id,
          status,
          message,
          requested_at,
          responded_at,
          expires_at
        ),
        listings (
          id,
          slug,
          title
        ),
        student:users!chats_student_user_id_fkey (
          id,
          full_name
        )
      `,
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (input.agentProfileId) {
    query = query.or(
      `student_user_id.eq.${input.userId},agent_profile_id.eq.${input.agentProfileId}`,
    );
  } else {
    query = query.eq("student_user_id", input.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as ChatSummaryRow[];
}

export async function getChatForUser(
  client: DbClient,
  input: {
    agentProfileId?: string | null;
    chatId: string;
    userId: string;
  },
) {
  let query = client
    .from("chats")
    .select(
      `
        *,
        inspection_requests!chats_inspection_request_id_fkey (
          id,
          requester_user_id,
          agent_profile_id,
          status,
          message,
          requested_at,
          responded_at,
          expires_at
        ),
        listings (
          id,
          slug,
          title
        ),
        student:users!chats_student_user_id_fkey (
          id,
          full_name
        )
      `,
    )
    .eq("id", input.chatId)
    .is("deleted_at", null);

  if (input.agentProfileId) {
    query = query.or(
      `student_user_id.eq.${input.userId},agent_profile_id.eq.${input.agentProfileId}`,
    );
  } else {
    query = query.eq("student_user_id", input.userId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data as unknown as ChatSummaryRow | null;
}

export async function listChatMessages(client: DbClient, chatId: string) {
  const { data, error } = await client
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as MessageRow[];
}

export async function createChatMessage(
  client: DbClient,
  input: {
    body: string;
    chatId: string;
    senderUserId: string;
  },
) {
  const { data, error } = await client
    .from("messages")
    .insert({
      body: input.body,
      chat_id: input.chatId,
      sender_user_id: input.senderUserId,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as MessageRow;
}

export async function touchChatLastMessageAt(
  client: DbClient,
  chatId: string,
  timestamp: string,
) {
  const { data, error } = await client
    .from("chats")
    .update({
      last_message_at: timestamp,
    })
    .eq("id", chatId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as ChatRow;
}
