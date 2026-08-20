import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChatThread } from "@/features/chats/components/chat-thread";
import { getCurrentUserChatThread } from "@/server/services/chat-service";
import { markChatRead } from "@/server/services/inspection-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

type ChatThreadPageProps = {
  params: Promise<{ chatId: string }>;
};

export default async function ChatThreadPage({ params }: ChatThreadPageProps) {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { chatId } = await params;
  const result = await getCurrentUserChatThread(chatId).catch((error: unknown) => {
    // Branch on the code, not the sentence. Matching "Chat not found." meant
    // rewording that message would silently turn a 404 into an unhandled throw,
    // which is the coupling this slice exists to remove.
    if ((error as { code?: string })?.code === "CHAT_NOT_FOUND") {
      return null;
    }

    throw error;
  });

  if (!result) {
    notFound();
  }

  /**
   * Opening the thread is what "read" means here.
   *
   * After the fetch, so a chat the caller cannot see is never written to, and
   * awaited so the unread badge on the inspection inbox is already clear by the
   * time the agent navigates back. markChatRead swallows its own failures — see
   * the service — because a badge that fails to clear must not take the
   * conversation down with it.
   */
  await markChatRead(chatId);

  const listingTitle = result.chat.listings?.title ?? "Listing";
  const listingHref = result.chat.listings?.slug
    ? `/listings/${result.chat.listings.slug}`
    : result.chat.listings?.id
      ? `/listings/${result.chat.listings.id}`
      : null;
  const counterpartyLabel = user.roles.includes("agent")
    ? result.counterpartyName ?? "the seeker"
    : "agent";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link className="text-sm font-medium text-stone-600" href="/chats">
            Back to chats
          </Link>
          <Link className="text-sm font-medium text-stone-600" href="/dashboard">
            Dashboard
          </Link>
        </div>

        <ChatThread
          chatId={result.chat.id}
          counterpartyLabel={counterpartyLabel}
          inspectionRequestId={result.chat.inspection_requests?.id ?? null}
          inspectionStatus={result.chat.inspection_requests?.status ?? null}
          introMessage={result.chat.inspection_requests?.message ?? null}
          listingHref={listingHref}
          listingTitle={listingTitle}
          messages={result.messages}
          viewerIsAgent={user.roles.includes("agent")}
          viewerUserId={result.viewerUserId}
        />
      </div>
    </main>
  );
}
