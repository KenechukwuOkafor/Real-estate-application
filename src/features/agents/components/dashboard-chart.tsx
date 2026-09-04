/**
 * Views and requests over time, drawn as inline SVG.
 *
 * NO CHART LIBRARY, deliberately. Two series over at most ninety points needs
 * a path element and an axis; recharts is ~90KB gzipped on a page an agent
 * opens on a phone in Nsukka, and ADR-002's performance budget is not a
 * suggestion. This is about sixty lines.
 *
 * The two series are on SEPARATE SCALES and say so. Views outnumber requests
 * by one to two orders of magnitude, so a shared axis flattens the request
 * line onto the floor and makes the number an agent most cares about invisible.
 * Two scales risk implying a correlation that is not there, which is why the
 * legend names each series with its own maximum rather than leaving the reader
 * to infer the axis.
 */
type ChartPoint = { day: string; requests: number; viewers: number };

const WIDTH = 720;
const HEIGHT = 180;
const PADDING = { bottom: 24, left: 8, right: 8, top: 12 };

function path(points: ChartPoint[], pick: (point: ChartPoint) => number) {
  const max = Math.max(1, ...points.map(pick));
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;

  return points
    .map((point, index) => {
      const x = PADDING.left + index * step;
      const y = PADDING.top + innerHeight - (pick(point) / max) * innerHeight;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function shortDay(day: string) {
  return new Date(`${day}T12:00:00+01:00`).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

export function DashboardChart({ points }: { points: ChartPoint[] }) {
  const maxViewers = Math.max(...points.map((point) => point.viewers), 0);
  const maxRequests = Math.max(...points.map((point) => point.requests), 0);
  const totalViewers = points.reduce((sum, point) => sum + point.viewers, 0);

  if (totalViewers === 0 && maxRequests === 0) {
    return (
      <p className="text-sm leading-6 text-stone-600">
        Nothing to plot for this period yet. Views and requests will appear here
        as they arrive.
      </p>
    );
  }

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          className="h-[180px] w-full min-w-[520px]"
          role="img"
          aria-label={`Viewers and inspection requests per day. Peak ${maxViewers} viewers and ${maxRequests} requests in a day.`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
        >
          <path
            d={path(points, (point) => point.viewers)}
            fill="none"
            stroke="currentColor"
            className="text-stone-400"
            strokeWidth={2}
          />
          <path
            d={path(points, (point) => point.requests)}
            fill="none"
            stroke="currentColor"
            className="text-emerald-600"
            strokeWidth={2}
          />
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 bg-stone-400" />
            Viewers (peak {maxViewers})
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 bg-emerald-600" />
            Requests (peak {maxRequests})
          </span>
        </span>
        <span>
          {shortDay(points[0]?.day ?? "")} – {shortDay(points[points.length - 1]?.day ?? "")}
        </span>
      </figcaption>
    </figure>
  );
}
