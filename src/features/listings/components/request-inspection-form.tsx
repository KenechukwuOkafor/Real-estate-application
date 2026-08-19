"use client";

import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { useState } from "react";

import { useEffectiveAuth } from "@/lib/auth/use-effective-auth";

type RequestInspectionFormProps = {
  listingId: string;
};

export function RequestInspectionForm({
  listingId,
}: RequestInspectionFormProps) {
  const { isSignedIn } = useEffectiveAuth();
  const [message, setMessage] = useState(
    "Hi, I want to inspect this property. Please let me know your next available time.",
  );
  const [chatId, setChatId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isSignedIn) {
      setError("Sign in to request an inspection.");
      return;
    }

    setIsSubmitting(true);
    setChatId(null);
    setSuccess(null);
    setError(null);

    const response = await fetch("/api/inspection-requests", {
      body: JSON.stringify({
        listingId,
        message,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          data?: {
            chat?: { id?: string };
            inspectionRequest?: { expiresAt?: string };
          };
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to request inspection.");
      setIsSubmitting(false);
      return;
    }

    const expiresAt = payload?.data?.inspectionRequest?.expiresAt;
    const expiryLabel = expiresAt
      ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(expiresAt))
      : null;

    setChatId(payload?.data?.chat?.id ?? null);
    setSuccess(
      expiryLabel
        ? `Inspection requested. The agent has until ${expiryLabel} to respond.`
        : "Inspection requested. The agent will respond in-app.",
    );
    setIsSubmitting(false);
  }

  return (
    <div className="mt-8 rounded-[1.5rem] border border-stone-900/10 bg-white p-5">
      <h3 className="text-lg font-semibold text-stone-900">Request inspection</h3>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Start the first serious step with the agent. A successful request opens an
        inspection chat and stays active for 48 hours.
      </p>

      {!isSignedIn ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-stone-700">You need an account before requesting.</p>
          <SignInButton mode="modal">
            <button className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white">
              Sign in to continue
            </button>
          </SignInButton>
        </div>
      ) : (
        <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
          <textarea
            className="min-h-28 rounded-2xl border border-stone-900/10 bg-stone-50 px-4 py-3 text-sm text-stone-800"
            maxLength={500}
            onChange={(event) => setMessage(event.target.value)}
            value={message}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-stone-500">{message.trim().length}/500</p>
            <button
              className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Requesting..." : "Request inspection"}
            </button>
          </div>
        </form>
      )}

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
      {chatId ? (
        <Link
          className="mt-3 inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          href={`/chats/${chatId}`}
        >
          Open chat →
        </Link>
      ) : null}
    </div>
  );
}
