import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChatThread } from "@/features/chats/components/chat-thread";
import { getCurrentUserChatThread } from "@/server/services/chat-service";
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
  const result = await getCurrentUserChatThread(chatId).catch((error: Error) => {
    if (error.message === "Chat not found.") {
      return null;
    }

    throw error;
  });

  if (!result) {
    notFound();
  }

  const listingTitle = result.chat.listings?.title ?? "Listing";
  const listingHref = result.chat.listings?.slug
    ? `/listings/${result.chat.listings.slug}`
    : result.chat.listings?.id
      ? `/listings/${result.chat.listings.id}`
      : null;
  const counterpartyLabel = user.roles.includes("agent")
    ? result.chat.student?.full_name ?? "student"
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
