import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "@tanstack/react-router";
import { Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import useSetProjectFieldValue from "@/hooks/mutations/project-field/use-set-project-field-value";
import useProjectFieldTable from "@/hooks/queries/project-field/use-project-field-table";
import useProjectFields from "@/hooks/queries/project-field/use-project-fields";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import {
  PROJECT_TABLE_FIXED_COLUMNS,
  ProjectFieldsTableRow,
  defaultFieldWidth,
} from "./project-fields-table-row";
import {
  PROJECT_TABLE_MAX_WIDTH,
  PROJECT_TABLE_MIN_WIDTH,
  projectTablePreferencesKey,
  readProjectTablePreferences,
  visibleProjectFields,
  writeProjectTablePreferences,
  type ProjectTablePreferences,
} from "./project-table-preferences";
import { ProjectTablePagination } from "./project-table-pagination";
import { ProjectTableToolbar } from "./project-table-toolbar";
import {
  decodeProjectTableSearch,
  type ProjectTableSearchState,
  type ProjectsSearch,
  PROJECT_TABLE_PAGE_SIZE,
} from "./project-table-search";

export function ProjectFieldsTable({
  workspaceId,
  search: rawSearch,
  onSearchChange,
}: {
  workspaceId: string;
  search: ProjectsSearch;
  onSearchChange: (next: ProjectTableSearchState) => void;
}) {
  const { t } = useTranslation();
  const { canUpdateProjects } = useWorkspacePermission();
  const canEdit = canUpdateProjects();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const definitionsQuery = useProjectFields(workspaceId);
  const definitions = definitionsQuery.data ?? [];
  const search = decodeProjectTableSearch(rawSearch, definitions);
  const tableQuery = useProjectFieldTable(workspaceId, search);
  const setValue = useSetProjectFieldValue();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [preferences, setPreferences] =
    useState<ProjectTablePreferences | null>(null);
  const definitionsKey = definitions.map((field) => field.id).join(",");
  const storageKey =
    userId && workspaceId
      ? projectTablePreferencesKey(userId, workspaceId)
      : null;

  useEffect(() => {
    if (!storageKey || definitions.length === 0) return;
    setPreferences(readProjectTablePreferences(storageKey, definitions));
    // definitionsKey tracks membership; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, definitionsKey]);

  const updatePreferences = (
    next:
      | ProjectTablePreferences
      | ((current: ProjectTablePreferences) => ProjectTablePreferences),
  ) => {
    setPreferences((current) => {
      if (!current) return current;
      const resolved = typeof next === "function" ? next(current) : next;
      if (storageKey) writeProjectTablePreferences(storageKey, resolved);
      return resolved;
    });
  };

  const fields = preferences
    ? visibleProjectFields(definitions, preferences)
    : definitions.filter((field) => field.type !== "long_text");

  const gridTemplateColumns = useMemo(() => {
    const fixed = PROJECT_TABLE_FIXED_COLUMNS.map(
      (column) => `${column.width}px`,
    ).join(" ");
    const dynamic = fields
      .map(
        (field) =>
          `${preferences?.widths[field.id] ?? defaultFieldWidth(field)}px`,
      )
      .join(" ");
    return [fixed, dynamic].filter(Boolean).join(" ");
  }, [fields, preferences]);

  const totalWidth =
    PROJECT_TABLE_FIXED_COLUMNS.reduce((sum, column) => sum + column.width, 0) +
    fields.reduce(
      (sum, field) =>
        sum + (preferences?.widths[field.id] ?? defaultFieldWidth(field)),
      0,
    );

  const projects = tableQuery.data?.projects ?? [];
  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  const change = useCallback(
    (next: Partial<ProjectTableSearchState>) => {
      const merged = { ...search, ...next };
      if ("filters" in next || "sort" in next || "includeArchived" in next) {
        merged.page = 0;
      }
      onSearchChange(merged);
    },
    [search, onSearchChange],
  );

  useEffect(() => {
    const total = tableQuery.data?.total ?? 0;
    const lastPage = Math.max(
      0,
      Math.ceil(total / PROJECT_TABLE_PAGE_SIZE) - 1,
    );
    if (search.page > lastPage) change({ page: lastPage });
  }, [search.page, tableQuery.data?.total, change]);

  const setWidth = (fieldId: string, width: number) => {
    updatePreferences((current) => ({
      ...current,
      widths: {
        ...current.widths,
        [fieldId]: Math.min(
          PROJECT_TABLE_MAX_WIDTH,
          Math.max(PROJECT_TABLE_MIN_WIDTH, Math.round(width)),
        ),
      },
    }));
  };

  const onSave = (projectId: string, fieldId: string, value: string | null) => {
    setValue.mutate(
      { workspaceId, projectId, fieldId, value },
      {
        onError: (error) =>
          toast.error(
            error instanceof Error
              ? error.message
              : t("workspace:projects.table.saveError"),
          ),
      },
    );
  };

  if (definitionsQuery.isPending) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-9 w-full" />
        {[1, 2, 3, 4].map((row) => (
          <Skeleton key={row} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (definitionsQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p role="alert" className="text-muted-foreground text-sm">
          {t("workspace:projects.table.loadError")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void definitionsQuery.refetch()}
        >
          {t("settings:projectGeneral.projectFields.retry")}
        </Button>
      </div>
    );
  }

  if (definitions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
          <Settings2 />
        </div>
        <p className="font-medium text-sm">
          {t("workspace:projects.table.noDefinitions")}
        </p>
        <p className="max-w-sm text-muted-foreground text-sm">
          {t("workspace:projects.table.noDefinitionsDescription")}
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link to="/dashboard/settings/workspace/project-fields" />}
        >
          {t("settings:workspaceProjectFields.title")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ProjectTableToolbar
        workspaceId={workspaceId}
        definitions={definitions}
        search={search}
        hidden={preferences?.hidden ?? []}
        visibleColumns={fields.map((field) => field.id)}
        onSearchChange={change}
        onToggleColumn={(fieldId, hidden) =>
          updatePreferences((current) => ({
            ...current,
            hidden: hidden
              ? [...current.hidden, fieldId]
              : current.hidden.filter((id) => id !== fieldId),
          }))
        }
      />

      <div
        ref={scrollRef}
        className="max-h-[70vh] overflow-auto rounded-lg border border-border"
      >
        <div
          role="table"
          aria-label={t("workspace:projects.views.fields")}
          style={{ minWidth: totalWidth }}
        >
          <div
            role="row"
            className="sticky top-0 z-20 grid border-border border-b bg-background"
            style={{ gridTemplateColumns }}
          >
            {PROJECT_TABLE_FIXED_COLUMNS.map((column, index) => (
              <div
                key={column.id}
                role="columnheader"
                className={cn(
                  "flex h-9 items-center px-3 font-medium text-muted-foreground text-xs",
                  index === 0 &&
                    "sticky left-0 z-10 border-background border-r bg-background",
                )}
              >
                {t(`workspace:projects.table.columns.${column.id}`)}
              </div>
            ))}
            {fields.map((field) => (
              <div
                key={field.id}
                role="columnheader"
                className="relative flex h-9 items-center gap-1 bg-primary/[0.04] px-3 font-medium text-foreground text-xs"
              >
                {/* Accent band: the field columns are the point of this view. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-0.5 bg-primary/60"
                />
                <span className="truncate">{field.name}</span>
                {field.required ? (
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                ) : null}
                {field.type === "formula" ? (
                  <span className="text-muted-foreground/60">ƒ</span>
                ) : null}
                <ResizeHandle
                  label={t("workspace:projects.table.resizeColumn", {
                    field: field.name,
                  })}
                  width={
                    preferences?.widths[field.id] ?? defaultFieldWidth(field)
                  }
                  onWidthChange={(width) => setWidth(field.id, width)}
                />
              </div>
            ))}
          </div>

          <div
            className="relative"
            style={{ height: virtualizer.getTotalSize() }}
            role="rowgroup"
          >
            {tableQuery.isError ? (
              <div className="p-6 text-center">
                <p role="alert" className="text-muted-foreground text-sm">
                  {t("workspace:projects.table.loadError")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void tableQuery.refetch()}
                >
                  {t("settings:projectGeneral.projectFields.retry")}
                </Button>
              </div>
            ) : projects.length === 0 && !tableQuery.isPending ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                {t("workspace:projects.table.noResults")}
              </div>
            ) : (
              virtualizer.getVirtualItems().map((virtualRow) => {
                const project = projects[virtualRow.index];
                if (!project) return null;
                return (
                  <ProjectFieldsTableRow
                    key={project.id}
                    project={project}
                    fields={fields}
                    workspaceId={workspaceId}
                    canEdit={canEdit}
                    gridTemplateColumns={gridTemplateColumns}
                    top={virtualRow.start}
                    onSave={(fieldId, value) =>
                      onSave(project.id, fieldId, value)
                    }
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      <ProjectTablePagination
        page={search.page}
        total={tableQuery.data?.total ?? 0}
        onPageChange={(page) => change({ page })}
      />
    </div>
  );
}

function ResizeHandle({
  label,
  width,
  onWidthChange,
}: {
  label: string;
  width: number;
  onWidthChange: (width: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none border-transparent border-r hover:border-primary focus-visible:border-primary focus-visible:outline-none"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onWidthChange(width - 16);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onWidthChange(width + 16);
        }
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) => {
          onWidthChange(startWidth + moveEvent.clientX - startX);
        };
        const finish = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", finish);
          target.removeEventListener("pointercancel", finish);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", finish);
        target.addEventListener("pointercancel", finish);
      }}
    />
  );
}
