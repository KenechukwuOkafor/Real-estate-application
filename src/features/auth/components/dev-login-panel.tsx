"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DevAuthUser } from "@/lib/auth/dev-auth";

type DevLoginPanelProps = {
  users: readonly DevAuthUser[];
};

export function DevLoginPanel({ users }: DevLoginPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  async function signIn(clerkUserId: string) {
    setActiveUserId(clerkUserId);
    setError(null);

    const response = await fetch("/api/dev-auth/login", {
      body: JSON.stringify({ clerkUserId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Unable to sign in as development user.");
      setActiveUserId(null);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {users.map((user) => (
        <button
          key={user.clerkUserId}
          className="rounded-[1.75rem] border border-stone-900/10 bg-white p-6 text-left shadow-[0_16px_40px_rgba(48,38,24,0.06)]"
          disabled={activeUserId !== null}
          onClick={() => signIn(user.clerkUserId)}
          type="button"
        >
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
            {user.roles.join(", ")}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-900">{user.label}</h2>
          <p className="mt-2 text-sm text-stone-700">{user.email}</p>
          <p className="mt-3 text-sm leading-7 text-stone-600">{user.description}</p>
        </button>
      ))}

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
