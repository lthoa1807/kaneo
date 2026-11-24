import { useNavigate, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { isPlainClick } from "./is-plain-click";
import { ProjectScopeLink } from "./project-scope-link";
import {
  PROJECT_ROUTE_PATHS,
  type ProjectView,
  tasksViewFor,
} from "./project-views";

type ProjectScopeToggleProps = {
  workspaceId: string;
  projectId: string;
  currentView: ProjectView;
  onSelect: (view: ProjectView) => void;
  /** Only staff who can read intake see the tab. */
  showIntake?: boolean;
  intakeActive?: boolean;
};

export function ProjectScopeToggle({
  workspaceId,
  projectId,
  currentView,
  onSelect,
  showIntake = false,
  intakeActive = false,
}: ProjectScopeToggleProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const taskLayout = useUserPreferencesStore((state) => state.taskLayout);
  const viewMode = useUserPreferencesStore((state) => state.viewMode);
  const onBacklog = currentView === "backlog";
  const tasksView = onBacklog
    ? tasksViewFor(taskLayout, viewMode)
    : currentView;

  return (
    <nav
      aria-label={t("tasks:view.heading")}
      className="flex h-7 shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-background p-0.5 dark:bg-input/32"
    >
      <ProjectScopeLink
        view={tasksView}
        workspaceId={workspaceId}
        projectId={projectId}
        active={!onBacklog}
        onSelect={onSelect}
      >
        {t("tasks:title")}
      </ProjectScopeLink>
      <ProjectScopeLink
        view="backlog"
        workspaceId={workspaceId}
        projectId={projectId}
        active={onBacklog}
        onSelect={onSelect}
      >
        {t("tasks:view.backlog")}
      </ProjectScopeLink>
      {showIntake ? (
        // ProjectScopeLink is typed to ProjectView, so the intake tab is a
        // plain sibling link with the same classes.
        <a
          href={
            router.buildLocation({
              to: PROJECT_ROUTE_PATHS.intake,
              params: { workspaceId, projectId },
            }).href
          }
          aria-current={intakeActive ? "page" : undefined}
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            navigate({
              to: PROJECT_ROUTE_PATHS.intake,
              params: { workspaceId, projectId },
            });
          }}
          className={cn(
            "inline-flex h-6 items-center rounded-[calc(var(--radius-lg)-3px)] px-2.5 font-medium text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            intakeActive
              ? "bg-accent text-foreground shadow-xs/5"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("intake:staff.tab")}
        </a>
      ) : null}
    </nav>
  );
}
