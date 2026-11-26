import { useTranslation } from "react-i18next";
import WidgetCard from "./widget-card";
import type { DashboardSummary } from "./types";

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SEGMENT_CLASS: Record<string, string> = {
  urgent: "stroke-destructive",
  high: "stroke-warning",
  medium: "stroke-primary",
  low: "stroke-muted-foreground/50",
  "no-priority": "stroke-muted-foreground/25",
};

const SWATCH_CLASS: Record<string, string> = {
  urgent: "bg-destructive",
  high: "bg-warning",
  medium: "bg-primary",
  low: "bg-muted-foreground/50",
  "no-priority": "bg-muted-foreground/25",
};

/**
 * The SVG is decoration: every value and the click target live in the legend.
 * Geometry is stroke-dasharray on circles, so no chart dependency is needed.
 */
export default function PriorityDonut({
  series,
  onOpen,
}: {
  series: DashboardSummary["charts"]["byPriority"];
  onOpen: (
    priority: DashboardSummary["charts"]["byPriority"][number]["priority"],
  ) => void;
}) {
  const { t } = useTranslation();
  const total = series.reduce((sum, row) => sum + row.count, 0);
  const segments = series.map((row, index) => ({
    ...row,
    length: total > 0 ? (row.count / total) * CIRCUMFERENCE : 0,
    offset: series
      .slice(0, index)
      .reduce(
        (sum, previous) =>
          sum + (total > 0 ? (previous.count / total) * CIRCUMFERENCE : 0),
        0,
      ),
  }));

  return (
    <WidgetCard
      title={t("dashboard:charts.byPriority")}
      hint={t("dashboard:charts.byPriorityHint", { count: total })}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative mx-auto size-32 shrink-0 sm:mx-0">
          <svg viewBox="0 0 100 100" aria-hidden="true" className="size-32">
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth="14"
              className="stroke-muted"
            />
            {segments.map((segment) => (
              <circle
                key={segment.priority}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                strokeWidth="14"
                strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
                strokeDashoffset={-segment.offset}
                transform="rotate(-90 50 50)"
                className={SEGMENT_CLASS[segment.priority]}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-semibold text-xl tabular-nums">{total}</span>
            <span className="text-muted-foreground text-[10px]">open</span>
          </div>
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {series.map((row) => (
            <li key={row.priority}>
              <button
                type="button"
                onClick={() => onOpen(row.priority)}
                className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span
                  aria-hidden="true"
                  className={`size-2.5 rounded-full ${SWATCH_CLASS[row.priority]}`}
                />
                <span className="min-w-0 flex-1 truncate text-xs">
                  {t(`tasks:priority.${row.priority}`)}
                </span>
                <span className="text-xs tabular-nums">{row.count}</span>
                <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">
                  {total > 0 ? Math.round((row.count / total) * 100) : 0}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </WidgetCard>
  );
}
