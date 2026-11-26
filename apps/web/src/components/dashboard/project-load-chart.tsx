import { useTranslation } from "react-i18next";
import WidgetCard from "./widget-card";
import type { DashboardSummary } from "./types";

export default function ProjectLoadChart({
  series,
  onOpen,
}: {
  series: DashboardSummary["charts"]["byProject"];
  onOpen: (projectId: string) => void;
}) {
  const { t } = useTranslation();
  const max = Math.max(1, ...series.map((row) => row.count));

  return (
    <WidgetCard
      title={t("dashboard:charts.byProject")}
      hint={t("dashboard:charts.byProjectHint")}
    >
      {series.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("dashboard:drill.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {series.map((row) => (
            <li key={row.projectId}>
              <button
                type="button"
                onClick={() => onOpen(row.projectId)}
                className="flex w-full flex-col gap-1 rounded text-left focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={`${row.name}: ${row.count}`}
              >
                <span className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="tabular-nums">{row.count}</span>
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary/70"
                    style={{ width: `${(row.count / max) * 100}%` }}
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
