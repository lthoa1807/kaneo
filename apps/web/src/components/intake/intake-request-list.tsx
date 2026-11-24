import { useTranslation } from "react-i18next";
import type { IntakeRequestListItem } from "@/types/intake";
import { formatRelativeTime } from "@/lib/format";
import { IntakeProgress } from "./intake-progress";
import { IntakeStatusBadge } from "./intake-status-badge";

type IntakeRequestListProps = {
  items: IntakeRequestListItem[];
  /** Hide the project column when the list already belongs to one project. */
  showProject?: boolean;
  onRowClick: (requestId: string) => void;
};

export function IntakeRequestList({
  items,
  showProject = true,
  onRowClick,
}: IntakeRequestListProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        {t("intake:list.empty")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onRowClick(item.id)}
            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
          >
            <span className="font-mono text-muted-foreground text-xs">
              {item.displayId}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-sm">
              {item.title}
            </span>
            {showProject ? (
              <span className="truncate text-muted-foreground text-xs">
                {item.projectName}
              </span>
            ) : null}
            <IntakeStatusBadge status={item.status} />
            {item.taskCount > 0 ? (
              <IntakeProgress
                taskCount={item.taskCount}
                completedTaskCount={item.completedTaskCount}
              />
            ) : null}
            <span className="text-muted-foreground text-xs">
              {formatRelativeTime(item.updatedAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
