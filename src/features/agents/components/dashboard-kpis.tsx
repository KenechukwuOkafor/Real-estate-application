import { formatReplyTime } from "@/features/agents/dashboard/metrics";

type Kpis = {
  medianReply: { deltaPercent: number | null; value: number | null };
  newRequests: { deltaPercent: number | null; value: number };
  responseRate: {
    answerable: number;
    answered: number;
    deltaPercent: number | null;
    value: number | null;
  };
  views: { deltaPercent: number | null; value: number };
};

/**
 * A delta, or nothing at all.
 *
 * Nothing when the previous period was empty. "+100%" against a period with no
 * data is not a measurement, and an arrow implies a trend that one data point
 * cannot support.
 */
function Delta({ percent, lowerIsBetter = false }: { percent: number | null; lowerIsBetter?: boolean }) {
  if (percent === null) {
    return <span className="text-xs text-stone-500">No prior period</span>;
  }

  const good = lowerIsBetter ? percent < 0 : percent > 0;
  const flat = percent === 0;

  return (
    <span
      className={`text-xs font-medium ${
        flat ? "text-stone-500" : good ? "text-emerald-700" : "text-rose-700"
      }`}
    >
      {percent > 0 ? "+" : ""}
      {percent}% vs previous
    </span>
  );
}

function Card({
  children,
  detail,
  label,
}: {
  children: React.ReactNode;
  detail?: React.ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-stone-900/10 bg-white/85 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
        {children}
      </p>
      {detail ? <p className="mt-1 text-sm text-stone-600">{detail}</p> : null}
    </div>
  );
}

export function DashboardKpis({ kpis }: { kpis: Kpis }) {
  return (
    <section aria-label="Performance" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label="New requests"
        detail={<Delta percent={kpis.newRequests.deltaPercent} />}
      >
        {kpis.newRequests.value}
      </Card>

      <Card label="Listing views" detail={<Delta percent={kpis.views.deltaPercent} />}>
        {kpis.views.value}
      </Card>

      <Card
        label="Response rate"
        detail={
          <>
            {/*
              The raw fraction, always. "86%" means nothing without "12 of 14":
              one answered request out of one is also 100%, and an agent cannot
              tell those apart from the percentage alone.
            */}
            <span className="block text-stone-700">
              {kpis.responseRate.answerable === 0
                ? "Nothing needing an answer yet"
                : `${kpis.responseRate.answered} of ${kpis.responseRate.answerable} answered in time`}
            </span>
            <Delta percent={kpis.responseRate.deltaPercent} />
          </>
        }
      >
        {kpis.responseRate.value === null
          ? "—"
          : `${Math.round(kpis.responseRate.value * 100)}%`}
      </Card>

      <Card
        label="Median reply"
        detail={<Delta percent={kpis.medianReply.deltaPercent} lowerIsBetter />}
      >
        {formatReplyTime(kpis.medianReply.value)}
      </Card>
    </section>
  );
}
