import Link from "next/link";

export default function ListingNotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f7f4ec_0%,_#efe7da_100%)] px-6 py-10">
      <div className="max-w-xl rounded-[2rem] border border-stone-900/10 bg-white/85 p-10 text-center shadow-[0_20px_80px_rgba(48,38,24,0.08)]">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
          Listing unavailable
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
          This property is no longer available.
        </h1>
        <p className="mt-4 text-lg leading-8 text-stone-700">
          The listing may have been removed, archived, or is no longer public.
        </p>
        <Link
          className="mt-8 inline-flex rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
          href="/listings"
        >
          Browse other listings
        </Link>
      </div>
    </main>
  );
}
