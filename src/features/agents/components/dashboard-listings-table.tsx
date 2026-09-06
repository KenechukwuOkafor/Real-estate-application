import Link from "next/link";

import type { PerListingRow } from "@/features/agents/dashboard/metrics";

/**
 * Views, requests and conversion per listing.
 *
 * The most actionable thing on the page, because it is the only place the
 * three situations separate:
 *
 *   viewers, no requests  → price or photos. People are seeing it and passing.
 *   no viewers            → visibility. Nobody has been shown it at all.
 *   viewers and requests  → working.
 *
 * The "reads as" column says which, in words, rather than leaving an agent to
 * work it out from two numbers and a percentage. That inference is the whole
 * value of the table and it is not obvious.
 */
function reading(row: PerListingRow) {
  if (row.viewers === 0) {
    return { text: "Not being seen", tone: "text-stone-600" };
  }

  if (row.requests === 0) {
    return { text: "Seen, but not asked about", tone: "text-amber-800" };
  }

  return { text: "Converting", tone: "text-emerald-800" };
}

export function DashboardListingsTable({ rows }: { rows: PerListingRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-stone-900/10 text-xs uppercase tracking-[0.14em] text-stone-500">
            <th className="py-2 pr-4 font-semibold">Listing</th>
            <th className="py-2 pr-4 font-semibold">Viewers</th>
            <th className="py-2 pr-4 font-semibold">Requests</th>
            <th className="py-2 pr-4 font-semibold">Conversion</th>
            <th className="py-2 font-semibold">Reads as</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const read = reading(row);

            return (
              <tr className="border-b border-stone-900/5" key={row.listingId}>
                <td className="py-3 pr-4">
                  {/*
                    /agent/listings?focus=<id>, not /agent/listings/<id>. The
                    latter has never existed — every listing title in this table
                    was a 404 — and it should not, because every action an agent
                    takes on a listing already fits on its card. A page that
                    would contain nothing the card does not is a route.
                  */}
                  <Link
                    className="font-medium underline underline-offset-4"
                    href={`/agent/listings?focus=${row.listingId}`}
                  >
                    {row.title}
                  </Link>
                  {row.status !== "approved" ? (
                    <span className="ml-2 text-xs text-stone-500">{row.status}</span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 tabular-nums">{row.viewers}</td>
                <td className="py-3 pr-4 tabular-nums">{row.requests}</td>
                <td className="py-3 pr-4 tabular-nums">
                  {/*
                    A dash, not 0%. No views and no requests is a different
                    conclusion from views and no requests, and printing 0% for
                    both merges exactly the two the table exists to separate.
                  */}
                  {row.conversion === null
                    ? "—"
                    : `${(row.conversion * 100).toFixed(1)}%`}
                </td>
                <td className={`py-3 text-sm ${read.tone}`}>{read.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
