"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ChatMessage = {
  body: string;
  created_at: string;
  id: string;
  sender_user_id: string;
};

type ChatThreadProps = {
  chatId: string;
  counterpartyLabel: string;
  inspectionRequestId: string | null;
  inspectionStatus: string | null;
  introMessage: string | null;
  listingHref: string | null;
  listingTitle: string;
  messages: ChatMessage[];
  viewerIsAgent: boolean;
  viewerUserId: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatInspectionStatus(status: string | null) {
  if (!status) {
    return "Unknown";
  }

  return status.replaceAll("_", " ");
}

export function ChatThread({
  chatId,
  counterpartyLabel,
  inspectionRequestId,
  inspectionStatus,
  introMessage,
  listingHref,
  listingTitle,
  messages,
  viewerIsAgent,
  viewerUserId,
}: ChatThreadProps) {
  const router = useRouter();
  const [messageBody, setMessageBody] = useState("");
  const [items, setItems] = useState(messages);
  const [currentInspectionStatus, setCurrentInspectionStatus] = useState(
    inspectionStatus,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSending(true);

    const response = await fetch(`/api/chats/${chatId}/messages`, {
      body: JSON.stringify({ body: messageBody }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          data?: { body?: string; createdAt?: string; id?: string };
          error?: { message?: string };
        }
      | null;

    if (!response.ok || !payload?.data?.id || !payload.data.createdAt) {
      setError(payload?.error?.message ?? "Unable to send message.");
      setIsSending(false);
      return;
    }

    const createdMessage = {
      body: payload.data.body ?? messageBody.trim(),
      created_at: payload.data.createdAt,
      id: payload.data.id,
      sender_user_id: viewerUserId,
    };

    setItems((current) => [
      ...current,
      createdMessage,
    ]);
    setMessageBody("");
    setMessage("Message sent.");
    setIsSending(false);
    router.refresh();
  }

  async function respondToInspectionRequest(decision: "accepted" | "declined") {
    if (!inspectionRequestId) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsResponding(true);

    const response = await fetch(
      `/api/inspection-requests/${inspectionRequestId}/respond`,
      {
        body: JSON.stringify({ decision }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | {
          data?: { status?: string };
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to respond to inspection request.");
      setIsResponding(false);
      return;
    }

    setCurrentInspectionStatus(payload?.data?.status ?? decision);
    setMessage(
      decision === "accepted"
        ? "Inspection request accepted."
        : "Inspection request declined.",
    );
    setIsResponding(false);
    router.refresh();
  }

  return (
    <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-900/10 pb-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">
            Inspection chat
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
            {listingTitle}
          </h1>
          <p className="mt-2 text-sm text-stone-600">Chat with {counterpartyLabel}</p>
        </div>
        {listingHref ? (
          <Link
            className="rounded-full border border-stone-900/10 bg-white px-4 py-2 text-sm font-medium text-stone-800"
            href={listingHref}
          >
            View listing
          </Link>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-stone-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
          Status: {formatInspectionStatus(currentInspectionStatus)}
        </span>
      </div>

      {introMessage ? (
        <div className="mt-5 rounded-[1.5rem] bg-stone-50 p-4 text-sm leading-7 text-stone-700">
          <p className="font-medium text-stone-900">Original inspection request</p>
          <p className="mt-2">{introMessage}</p>
        </div>
      ) : null}

      {viewerIsAgent &&
      inspectionRequestId &&
      currentInspectionStatus === "requested" ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isResponding}
            onClick={() => respondToInspectionRequest("accepted")}
            type="button"
          >
            Accept inspection
          </button>
          <button
            className="rounded-full bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={isResponding}
            onClick={() => respondToInspectionRequest("declined")}
            type="button"
          >
            Decline inspection
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-[1.5rem] bg-stone-50 p-4">
        {items.length === 0 ? (
          <p className="text-sm text-stone-500">
            No messages yet. Send the first follow-up in this chat.
          </p>
        ) : (
          items.map((item) => {
            const isOwn = item.sender_user_id === viewerUserId;

            return (
              <div
                key={item.id}
                className={`max-w-[85%] rounded-[1.25rem] px-4 py-3 text-sm leading-7 ${
                  isOwn
                    ? "self-end bg-stone-900 text-white"
                    : "self-start bg-white text-stone-800"
                }`}
              >
                <p>{item.body}</p>
                <p
                  className={`mt-2 text-xs ${
                    isOwn ? "text-stone-300" : "text-stone-500"
                  }`}
                >
                  {formatDateTime(item.created_at)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form className="mt-5 flex flex-col gap-3" onSubmit={sendMessage}>
        <textarea
          className="min-h-28 rounded-[1.5rem] border border-stone-900/10 bg-white px-4 py-3 text-sm text-stone-800"
          maxLength={2000}
          onChange={(event) => setMessageBody(event.target.value)}
          placeholder="Write a message"
          value={messageBody}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-stone-500">{messageBody.trim().length}/2000</p>
          <button
            className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
            disabled={isSending}
            type="submit"
          >
            {isSending ? "Sending..." : "Send message"}
          </button>
        </div>
      </form>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
    </section>
  );
}
