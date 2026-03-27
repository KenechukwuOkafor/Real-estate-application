import { redirect } from "next/navigation";

import { ListingModerationActions } from "@/features/admin/components/listing-moderation-actions";
import { listAdminModerationQueue } from "@/server/services/admin-service";

export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
  const listings = await listAdminModerationQueue().catch(() => null);

  if (!listings) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-900/10 bg-white/85 p-8 shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Admin moderation
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Pending review queue.
          </h1>
        </section>

        {listings.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-stone-900/15 bg-white/75 p-8 text-stone-600">
            No listings are waiting for review.
          </div>
        ) : null}

        {listings.map((listing) => (
          <article
            key={listing.id}
            className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-6 shadow-[0_16px_40px_rgba(48,38,24,0.06)]"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
                  {listing.status}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">{listing.title}</h2>
                <p className="mt-2 text-sm leading-7 text-stone-700">
                  {listing.description}
                </p>
                <p className="mt-4 text-sm text-stone-600">
                  Agent: {listing.agent_profiles?.display_name ?? "Unknown"} | Area:{" "}
                  {listing.area} | Price: {listing.price_naira} NGN
                </p>
              </div>

              <div className="min-w-[280px]">
                <ListingModerationActions listingId={listing.id} />
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
