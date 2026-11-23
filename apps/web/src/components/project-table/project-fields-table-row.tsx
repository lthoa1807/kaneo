import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ProjectFieldCell } from "@/components/project-table/project-field-cell";
import type {
  ProjectFieldDefinition,
  ProjectFieldTableProject,
} from "@/components/project-fields/types";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import icons from "@/constants/project-icons";
import { formatDateMedium } from "@/lib/format";

export const PROJECT_TABLE_FIXED_COLUMNS = [
  { id: "project", width: 240 },
  { id: "progress", width: 160 },
  { id: "dueDate", width: 140 },
  { id: "status", width: 120 },
] as const;

export function defaultFieldWidth(field: ProjectFieldDefinition) {
  switch (field.type) {
    case "boolean":
      return 110;
    case "number":
    case "date":
      return 140;
    case "dropdown":
    case "multiselect":
      return 160;
    case "long_text":
      return 220;
    default:
      return 180;
  }
}

export function ProjectFieldsTableRow({
  project,
  fields,
  workspaceId,
  canEdit,
  gridTemplateColumns,
  onSave,
  top,
}: {
  project: ProjectFieldTableProject;
  fields: ProjectFieldDefinition[];
  workspaceId: string;
  canEdit: boolean;
  gridTemplateColumns: string;
  onSave: (fieldId: string, value: string | null) => void;
  top: number;
}) {
  const { t } = useTranslation();
  const Icon = icons[project.icon as keyof typeof icons] ?? icons.Layout;
  const statistics = project.statistics;
  const status =
    statistics.totalTasks === 0
      ? t("workspace:projects.projectStatus.notStarted")
      : statistics.completionPercentage === 100
        ? t("workspace:projects.projectStatus.complete")
        : t("workspace:projects.projectStatus.inProgress");
  const statusVariant =
    statistics.totalTasks === 0
      ? "secondary"
      : statistics.completionPercentage === 100
        ? "default"
        : "outline";

  return (
    <div
      role="row"
      className="absolute grid w-full items-center border-border/60 border-b hover:bg-muted/30"
      style={{ top, gridTemplateColumns, height: 48 }}
    >
      <div
        role="cell"
        className="sticky left-0 z-10 flex h-full min-w-0 items-center gap-2 border-background border-r bg-background px-3"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <Link
          to="/dashboard/workspace/$workspaceId/project/$projectId/board"
          params={{ workspaceId, projectId: project.id }}
          className="truncate font-medium text-sm hover:underline"
        >
          {project.name}
        </Link>
        {project.archivedAt ? (
          <Badge variant="secondary" size="sm">
            {t("workspace:projects.table.archived")}
          </Badge>
        ) : null}
      </div>
      <div role="cell" className="flex min-w-0 items-center gap-2 px-3">
        <Progress
          value={statistics.completionPercentage}
          className="h-2 w-16"
        />
        <span className="text-muted-foreground text-sm tabular-nums">
          {statistics.completionPercentage}%
        </span>
      </div>
      <div role="cell" className="truncate px-3 text-muted-foreground text-sm">
        {statistics.dueDate
          ? formatDateMedium(statistics.dueDate)
          : t("workspace:projects.noDueDate")}
      </div>
      <div role="cell" className="px-3">
        <Badge variant={statusVariant}>{status}</Badge>
      </div>
      {fields.map((field) => (
        <div
          key={field.id}
          role="cell"
          className="flex min-w-0 items-center overflow-hidden bg-primary/[0.02] px-3"
        >
          <ProjectFieldCell
            field={field}
            project={project}
            canEdit={canEdit}
            onSave={(value) => onSave(field.id, value)}
          />
        </div>
      ))}
    </div>
  );
}
