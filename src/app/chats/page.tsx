import Link from "next/link";
import { redirect } from "next/navigation";

import { listCurrentUserChats } from "@/server/services/chat-service";
import { getCurrentAppUser } from "@/server/services/user-sync-service";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null) {
  if (!value) {
    return "No messages yet";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatInspectionStatus(status: string | null | undefined) {
  if (!status) {
    return "unknown";
  }

  return status.replaceAll("_", " ");
}

export default async function ChatsPage() {
  const user = await getCurrentAppUser();

  if (!user) {
    redirect("/sign-in");
  }

  const chats = await listCurrentUserChats().catch(() => null);

  if (!chats) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Chats
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Inspection conversations.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-700">
            Every inspection request opens a dedicated chat so the student and agent
            can coordinate in one place.
          </p>
        </section>

        {chats.length === 0 ? (
          <section className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/75 p-8 text-stone-600">
            No chats yet. Inspection conversations will appear here after a request
            is created from a listing.
          </section>
        ) : null}

        <section className="grid gap-4">
          {chats.map((chat) => {
            const listingTitle = chat.listings?.title ?? "Listing";
            const listingHref = chat.listings?.slug
              ? `/listings/${chat.listings.slug}`
              : chat.listings?.id
                ? `/listings/${chat.listings.id}`
                : null;
            const counterparty = user.roles.includes("agent")
              ? chat.student?.full_name ?? "student"
              : "agent";

            return (
              <Link
                key={chat.id}
                className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_16px_40px_rgba(48,38,24,0.06)] transition-transform hover:-translate-y-1"
                href={`/chats/${chat.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                      <span>{chat.type}</span>
                      <span>
                        {formatInspectionStatus(chat.inspection_requests?.status)}
                      </span>
                      <span>{formatDateTime(chat.last_message_at ?? chat.created_at)}</span>
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold">{listingTitle}</h2>
                    <p className="mt-2 text-sm leading-7 text-stone-700">
                      Chat with {counterparty}
                    </p>
                    {chat.inspection_requests?.message ? (
                      <p className="mt-3 text-sm leading-7 text-stone-600">
                        {chat.inspection_requests.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right text-sm text-stone-600">
                    {listingHref ? <p>Linked to listing</p> : null}
                    <p className="mt-2 text-stone-800">Open thread</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
