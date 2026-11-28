import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import {
  INTAKE_GROUPS,
  type IntakeGroupFilter,
  type IntakeGroupKey,
} from "./intake-groups";

export type IntakeCounts = {
  all: number;
  waiting: number;
  in_progress: number;
  awaiting: number;
};

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SEGMENT_CLASS: Record<IntakeGroupKey, string> = {
  waiting: "stroke-muted-foreground",
  in_progress: "stroke-warning-foreground",
  awaiting: "stroke-info-foreground",
};

const SWATCH_CLASS: Record<IntakeGroupKey, string> = {
  waiting: "bg-muted-foreground",
  in_progress: "bg-warning-foreground",
  awaiting: "bg-info-foreground",
};

/** The SVG is decoration: counts, percentages and click targets live in the legend. */
function IntakeDonut({ counts }: { counts: IntakeCounts }) {
  const { t } = useTranslation();
  const active = counts.waiting + counts.in_progress + counts.awaiting;
  const lengths = INTAKE_GROUPS.map((group) =>
    active > 0 ? (counts[group.key] / active) * CIRCUMFERENCE : 0,
  );
  const segments = INTAKE_GROUPS.map((group, index) => {
    const length = lengths[index];
    const offset = lengths
      .slice(0, index)
      .reduce((sum, previous) => sum + previous, 0);

    return (
      <circle
        key={group.key}
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        strokeWidth="14"
        strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
        strokeDashoffset={-offset}
        transform="rotate(-90 50 50)"
        className={SEGMENT_CLASS[group.key]}
      />
    );
  });

  return (
    <div className="relative size-24 shrink-0">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-24">
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          strokeWidth="14"
          className="stroke-muted"
        />
        {segments}
      </svg>
      <div className="absolute inset-0 grid place-content-center gap-px text-center">
        <span className="font-semibold text-lg tabular-nums">{active}</span>
        <span className="text-[10px] text-muted-foreground">
          {t("intake:portal.active")}
        </span>
      </div>
    </div>
  );
}

function LegendRow({
  group,
  label,
  count,
  total,
  selected,
  onSelect,
}: {
  group: IntakeGroupFilter;
  label: string;
  count: number;
  total: number;
  selected: boolean;
  onSelect: (group: IntakeGroupFilter) => void;
}) {
  const { t } = useTranslation();
  const showPercent = group !== "all";
  const swatch = group === "all" ? null : SWATCH_CLASS[group];
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <li className={group === "all" ? "sm:col-span-2" : undefined}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={t("intake:portal.legendName", { label, count })}
        onClick={() => onSelect(group)}
        className={cn(
          "touch-hitbox relative flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          selected && "bg-secondary font-semibold",
        )}
      >
        {swatch ? (
          <span
            aria-hidden="true"
            className={cn("size-2.5 shrink-0 rounded-full", swatch)}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="tabular-nums">{count}</span>
        {showPercent ? (
          <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">
            {percent}%
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function IntakeSummary({
  counts,
  selected,
  onSelect,
}: {
  counts?: IntakeCounts;
  selected: IntakeGroupFilter;
  onSelect: (group: IntakeGroupFilter) => void;
}) {
  const { t } = useTranslation();

  if (!counts) {
    return (
      <section className="flex flex-col gap-4 rounded-xl border p-4">
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <div className="flex w-full flex-col gap-0.5">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
            <Skeleton className="my-1 h-px w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      </section>
    );
  }

  if (counts.all === 0) return null;

  const active = counts.waiting + counts.in_progress + counts.awaiting;

  return (
    <section
      aria-labelledby="intake-summary-heading"
      className="flex flex-col gap-4 rounded-xl border p-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="intake-summary-heading" className="font-medium text-sm">
          {t("intake:portal.overview")}
        </h2>
        <p className="text-muted-foreground text-xs">
          {t("intake:portal.overviewHint", { count: counts.all })}
        </p>
      </header>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <IntakeDonut counts={counts} />
        <ul className="grid w-full min-w-0 grid-cols-1 gap-0.5 sm:grid-cols-2">
          {INTAKE_GROUPS.map((group) => (
            <LegendRow
              key={group.key}
              group={group.key}
              label={t(`intake:portal.group.${group.key}`)}
              count={counts[group.key]}
              total={active}
              selected={selected === group.key}
              onSelect={onSelect}
            />
          ))}
          <li aria-hidden="true" className="col-span-full my-1 border-t" />
          <LegendRow
            group="all"
            label={t("intake:portal.group.all")}
            count={counts.all}
            total={counts.all}
            selected={selected === "all"}
            onSelect={onSelect}
          />
        </ul>
      </div>
    </section>
  );
}
