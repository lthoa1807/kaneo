import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import WidgetCard from "./widget-card";
import type { DashboardSummary } from "./types";

export default function DueLoadChart({
  series,
  onOpen,
}: {
  series: DashboardSummary["charts"]["dueByDay"];
  onOpen: (day: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const max = Math.max(1, ...series.map((row) => row.count));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <WidgetCard
      title={t("dashboard:charts.dueLoad")}
      hint={t("dashboard:charts.dueLoadHint")}
    >
      <div className="flex h-32 items-end gap-1.5">
        {series.map((row) => {
          const date = new Date(`${row.date}T00:00:00.000Z`);
          const label = date.toLocaleDateString(i18n.language, {
            weekday: "short",
            timeZone: "UTC",
          });
          const dayNumber = date.getUTCDate();
          const isToday = row.date === today;
          const isUrgent = row.urgent * 2 > row.count;

          return (
            <button
              key={row.date}
              type="button"
              onClick={() => onOpen(row.date)}
              aria-current={isToday ? "date" : undefined}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`${row.date}: ${row.count}`}
            >
              <span className="text-muted-foreground text-[10px] tabular-nums">
                {row.count || ""}
              </span>
              <span
                className={cn(
                  "w-full rounded-t group-hover:opacity-90",
                  isUrgent ? "bg-warning" : "bg-primary/70",
                )}
                style={{ height: `${(row.count / max) * 100}%`, minHeight: 2 }}
              />
              <span
                className={cn(
                  "text-[10px] text-muted-foreground",
                  isToday && "font-semibold text-foreground",
                )}
              >
                {label}
              </span>
              <span className="text-[10px] tabular-nums">{dayNumber}</span>
            </button>
          );
        })}
      </div>
    </WidgetCard>
  );
}
