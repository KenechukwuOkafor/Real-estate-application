"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorCopyForResponse } from "@/features/errors/error-copy";

const roleOptions = [
  {
    description: "Browse listings, save homes, and request inspections.",
    label: "Student",
    value: "student",
  },
  {
    description:
      "Create drafts and manage inquiries right away. Publishing a listing needs identity verification first.",
    label: "Agent",
    value: "agent",
  },
] as const;

export function RoleSelectionForm() {
  const router = useRouter();
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["student"]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRole(role: string) {
    setSelectedRoles((current) => {
      if (current.includes(role)) {
        return current.filter((item) => item !== role);
      }

      return [...current, role];
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedRoles.length === 0) {
      setError("Select at least one role to continue.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/me/bootstrap", {
      body: JSON.stringify({
        roles: selectedRoles,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      setError(errorCopyForResponse(payload));
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        {roleOptions.map((role) => {
          const active = selectedRoles.includes(role.value);

          return (
            <button
              key={role.value}
              className={`rounded-[1.75rem] border p-6 text-left transition-colors ${
                active
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-900/10 bg-stone-50 text-stone-900"
              }`}
              onClick={() => toggleRole(role.value)}
              type="button"
            >
              <p className="text-sm uppercase tracking-[0.2em] opacity-70">
                {role.label}
              </p>
              <p className="mt-3 text-lg font-semibold">{role.label} account</p>
              <p className="mt-2 text-sm leading-7 opacity-80">{role.description}</p>
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-stone-600">
          You can update or expand your roles later.
        </p>
        <button
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Continue"}
        </button>
      </div>
    </form>
  );
}
