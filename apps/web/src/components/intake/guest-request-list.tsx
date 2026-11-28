import { useTranslation } from "react-i18next";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { IntakeRequestListItem } from "@/types/intake";
import { guestStatusLabelKey } from "./intake-groups";
import { IntakeStatusBadge } from "./intake-status-badge";

type GuestRequestListProps = {
  items: IntakeRequestListItem[];
  /** Hide the project column when the list already belongs to one project. */
  showProject?: boolean;
  emptyLabel?: string;
  onRowClick: (request: IntakeRequestListItem) => void;
};

const COLUMNS = {
  withProject: "sm:grid-cols-[4.5rem_minmax(0,1fr)_7rem_10.5rem_9rem]",
  withoutProject: "sm:grid-cols-[4.5rem_minmax(0,1fr)_10.5rem_9rem]",
};

export function GuestRequestList({
  items,
  showProject = true,
  emptyLabel,
  onRowClick,
}: GuestRequestListProps) {
  const { t } = useTranslation();
  const grid = showProject ? COLUMNS.withProject : COLUMNS.withoutProject;

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        {emptyLabel ?? t("intake:list.empty")}
      </p>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "grid grid-cols-2 gap-x-3 gap-y-1 border-b px-2 pb-2 text-muted-foreground text-xs sm:items-center",
          grid,
        )}
      >
        <span>{t("intake:list.columns.id")}</span>
        <span>{t("intake:list.columns.request")}</span>
        {showProject ? <span>{t("intake:list.columns.project")}</span> : null}
        <span>{t("intake:list.columns.status")}</span>
        <span>{t("intake:list.columns.received")}</span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onRowClick(item)}
              className={cn(
                "flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none sm:grid sm:items-center",
                grid,
              )}
            >
              <span className="font-mono text-muted-foreground text-xs">
                {item.displayId}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-sm sm:flex-none">
                {item.title}
              </span>
              {showProject ? (
                <span className="truncate text-muted-foreground text-xs">
                  {item.projectName}
                </span>
              ) : null}
              <span>
                <IntakeStatusBadge
                  status={item.status}
                  label={t(guestStatusLabelKey(item.status))}
                />
              </span>
              <span className="text-muted-foreground text-xs">
                {formatRelativeTime(item.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
