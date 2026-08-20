import "server-only";

import { AppError } from "@/lib/api/errors";
import { findCounterpartyNames } from "@/server/repositories/inspection-repository";
import { createSupabaseAuthenticatedClient } from "@/lib/db/supabase";
import {
  createChatMessage,
  getChatForUser,
  listChatMessages,
  listChatsForUser,
  touchChatLastMessageAt,
} from "@/server/repositories/chat-repository";
import { getAgentProfileByUserId } from "@/server/repositories/agents-repository";
import { writeAuditLog } from "@/server/services/audit-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

async function getChatAccessContext() {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    throw new AppError("UNAUTHENTICATED", "Unauthenticated request.");
  }

  // RLS-respecting. Chats and messages are the most sensitive data in the
  // system, so every read and write below is evaluated against the
  // participant policies in migration 0009 as well as the ownership filters
  // the repository already applies. The service-layer scoping stays: RLS is
  // defence in depth, not a replacement (ADR-023).
  const client = await createSupabaseAuthenticatedClient();
  const agentProfile = appUser.roles.includes("agent")
    ? await getAgentProfileByUserId(client, appUser.user.id)
    : null;

  return {
    agentProfile,
    appUser,
    client,
  };
}

function assertMessageBody(body: string) {
  if (!body.trim()) {
    throw new AppError("VALIDATION_ERROR", "Message body is required.");
  }

  if (body.trim().length > 2000) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Message body must be 2000 characters or fewer.",
    );
  }
}

/**
 * The chats, each with the counterparty's name resolved.
 *
 * The `student:users ( full_name )` embed in the repository returns null for
 * every row when an agent reads it — public.users is readable only by yourself
 * or an admin, and a denied embed is not an error, so both chat surfaces have
 * been rendering the literal word "student" where a name should be. Migration
 * 0025 discloses the name and nothing else; this attaches it.
 */
export async function listCurrentUserChats() {
  const context = await getChatAccessContext();

  const chats = await listChatsForUser(context.client, {
    agentProfileId: context.agentProfile?.id ?? null,
    userId: context.appUser.user.id,
  });

  const names = await findCounterpartyNames(
    context.client,
    chats.map((chat) => chat.student_user_id),
  );

  return chats.map((chat) => ({
    ...chat,
    counterpartyName:
      names.get(chat.student_user_id)?.trim() ?? chat.student?.full_name ?? null,
  }));
}

export async function getCurrentUserChatThread(chatId: string) {
  const context = await getChatAccessContext();
  const chat = await getChatForUser(context.client, {
    agentProfileId: context.agentProfile?.id ?? null,
    chatId,
    userId: context.appUser.user.id,
  });

  if (!chat) {
    throw new AppError("CHAT_NOT_FOUND", "Chat not found.");
  }

  const messages = await listChatMessages(context.client, chatId);
  const names = await findCounterpartyNames(context.client, [
    chat.student_user_id,
  ]);

  return {
    chat,
    counterpartyName:
      names.get(chat.student_user_id)?.trim() ?? chat.student?.full_name ?? null,
    messages,
    viewerUserId: context.appUser.user.id,
  };
}

export async function sendCurrentUserChatMessage(input: {
  body: string;
  chatId: string;
}) {
  assertMessageBody(input.body);

  const context = await getChatAccessContext();
  const chat = await getChatForUser(context.client, {
    agentProfileId: context.agentProfile?.id ?? null,
    chatId: input.chatId,
    userId: context.appUser.user.id,
  });

  if (!chat) {
    throw new AppError("CHAT_NOT_FOUND", "Chat not found.");
  }

  const message = await createChatMessage(context.client, {
    body: input.body.trim(),
    chatId: chat.id,
    senderUserId: context.appUser.user.id,
  });

  await touchChatLastMessageAt(context.client, chat.id, message.created_at);

  await writeAuditLog({
    action: "message.sent",
    actorUserId: context.appUser.user.id,
    afterData: {
      chat_id: message.chat_id,
      created_at: message.created_at,
    },
    entityId: message.id,
    entityType: "message",
  });

  return message;
}
