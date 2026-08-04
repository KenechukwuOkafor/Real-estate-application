import "server-only";

import { getSupabaseAdminClient } from "@/lib/db/supabase";
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
    throw new Error("Unauthenticated request.");
  }

  const adminClient = getSupabaseAdminClient();
  const agentProfile = appUser.roles.includes("agent")
    ? await getAgentProfileByUserId(adminClient, appUser.user.id)
    : null;

  return {
    adminClient,
    agentProfile,
    appUser,
  };
}

function assertMessageBody(body: string) {
  if (!body.trim()) {
    throw new Error("Message body is required.");
  }

  if (body.trim().length > 2000) {
    throw new Error("Message body must be 2000 characters or fewer.");
  }
}

export async function listCurrentUserChats() {
  const context = await getChatAccessContext();

  return listChatsForUser(context.adminClient, {
    agentProfileId: context.agentProfile?.id ?? null,
    userId: context.appUser.user.id,
  });
}

export async function getCurrentUserChatThread(chatId: string) {
  const context = await getChatAccessContext();
  const chat = await getChatForUser(context.adminClient, {
    agentProfileId: context.agentProfile?.id ?? null,
    chatId,
    userId: context.appUser.user.id,
  });

  if (!chat) {
    throw new Error("Chat not found.");
  }

  const messages = await listChatMessages(context.adminClient, chatId);

  return {
    chat,
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
  const chat = await getChatForUser(context.adminClient, {
    agentProfileId: context.agentProfile?.id ?? null,
    chatId: input.chatId,
    userId: context.appUser.user.id,
  });

  if (!chat) {
    throw new Error("Chat not found.");
  }

  const message = await createChatMessage(context.adminClient, {
    body: input.body.trim(),
    chatId: chat.id,
    senderUserId: context.appUser.user.id,
  });

  await touchChatLastMessageAt(context.adminClient, chat.id, message.created_at);

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
