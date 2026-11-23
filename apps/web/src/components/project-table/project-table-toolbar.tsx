import { Download, Filter, Plus, X } from "lucide-react";
import { useState } from "react";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import type {
  ProjectFieldDefinition,
  ProjectFieldFilter,
  ProjectFieldSort,
} from "@/components/project-fields/types";
import exportProjectFieldTable from "@/fetchers/project-field/export-project-field-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { ProjectTableColumnMenu } from "./project-table-column-menu";
import { ProjectTableFilterDialog } from "./project-table-filter-dialog";
import { ProjectTableSortControl } from "./project-table-sort-control";
import {
  filterOperatorsFor,
  type ProjectTableSearchState,
} from "./project-table-search";

export function ProjectTableToolbar({
  workspaceId,
  definitions,
  search,
  visibleColumns,
  hidden,
  onSearchChange,
  onToggleColumn,
}: {
  workspaceId: string;
  definitions: ProjectFieldDefinition[];
  search: ProjectTableSearchState;
  visibleColumns: string[];
  hidden: string[];
  onSearchChange: (next: Partial<ProjectTableSearchState>) => void;
  onToggleColumn: (fieldId: string, hidden: boolean) => void;
}) {
  const { t } = useTranslation();
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<ProjectFieldFilter | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);

  const fieldName = (fieldId: string) =>
    definitions.find((field) => field.id === fieldId)?.name ?? fieldId;

  const describe = (filter: ProjectFieldFilter) => {
    const field = definitions.find((item) => item.id === filter.fieldId);
    if (!field) return "";
    const operator = filterOperatorsFor(field).includes(filter.operator)
      ? t(
          `workspace:projects.table.operators.${
            {
              eq: "equals",
              neq: "notEquals",
              contains: "contains",
              notContains: "notContains",
              startsWith: "startsWith",
              gt: "greaterThan",
              gte: "greaterOrEqual",
              lt: "lessThan",
              lte: "lessOrEqual",
              before: "before",
              after: "after",
              onOrBefore: "onOrBefore",
              onOrAfter: "onOrAfter",
              empty: "isEmpty",
              notEmpty: "isNotEmpty",
              in: "isAnyOf",
              isTrue: "isYes",
              isFalse: "isNo",
            }[filter.operator]
          }`,
        )
      : filter.operator;
    const value = Array.isArray(filter.value)
      ? filter.value.join(", ")
      : filter.value;
    return `${field.name} ${operator}${value ? ` ${value}` : ""}`;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await exportProjectFieldTable({
        workspaceId,
        params: search,
        columns: visibleColumns,
      });
      saveAs(blob, filename);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("workspace:projects.table.exportError"),
      );
    } finally {
      setExporting(false);
    }
  };

  const setFilters = (filters: ProjectFieldFilter[]) =>
    onSearchChange({ filters });
  const setSort = (sort: ProjectFieldSort[]) => onSearchChange({ sort });

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingFilter(null);
            setFilterDialogOpen(true);
          }}
        >
          <Filter aria-hidden="true" />
          {t("workspace:projects.table.addFilter")}
        </Button>
        <ProjectTableSortControl
          definitions={definitions}
          sort={search.sort}
          onChange={setSort}
        />
        <label className="flex items-center gap-2 px-1 text-sm">
          <Checkbox
            checked={search.includeArchived}
            onCheckedChange={(checked) =>
              onSearchChange({ includeArchived: checked === true })
            }
          />
          {t("workspace:projects.table.includeArchived")}
        </label>
        <ProjectTableColumnMenu
          definitions={definitions}
          hidden={hidden}
          onToggle={onToggleColumn}
        />
        <div className="ml-auto flex items-center gap-2">
          {search.filters.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters([])}
            >
              <X aria-hidden="true" />
              {t("workspace:projects.table.clearFilters")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={exporting}
            onClick={() => void handleExport()}
          >
            <Download aria-hidden="true" />
            {t("workspace:projects.table.export")}
          </Button>
        </div>
      </div>

      {search.filters.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {search.filters.map((filter, index) => (
            <span
              key={JSON.stringify(filter)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pr-1 pl-2.5 text-xs"
            >
              <button
                type="button"
                className="max-w-64 truncate"
                aria-label={t("workspace:projects.table.editFilter")}
                onClick={() => {
                  setEditingFilter(filter);
                  setFilterDialogOpen(true);
                }}
              >
                {describe(filter)}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("workspace:projects.table.removeFilter", {
                  field: fieldName(filter.fieldId),
                })}
                onClick={() =>
                  setFilters(
                    search.filters.filter(
                      (_item, current) => current !== index,
                    ),
                  )
                }
              >
                <X />
              </Button>
            </span>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={t("workspace:projects.table.addFilter")}
            onClick={() => {
              setEditingFilter(null);
              setFilterDialogOpen(true);
            }}
          >
            <Plus />
          </Button>
        </div>
      ) : null}

      <ProjectTableFilterDialog
        open={filterDialogOpen}
        definitions={definitions}
        filter={editingFilter}
        onClose={() => setFilterDialogOpen(false)}
        onSave={(next) => {
          setFilters(
            editingFilter
              ? search.filters.map((item) =>
                  item === editingFilter ? next : item,
                )
              : [...search.filters, next],
          );
          setFilterDialogOpen(false);
        }}
      />
    </div>
  );
}
