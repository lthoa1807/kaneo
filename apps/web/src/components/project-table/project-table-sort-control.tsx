import { ArrowDown, ArrowUp, ArrowUpDown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ProjectFieldDefinition,
  ProjectFieldSort,
} from "@/components/project-fields/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROJECT_TABLE_MAX_SORTS } from "./project-table-search";

const BASE_SORTS = ["name", "createdAt"] as const;

export function ProjectTableSortControl({
  definitions,
  sort,
  onChange,
}: {
  definitions: ProjectFieldDefinition[];
  sort: ProjectFieldSort[];
  onChange: (sort: ProjectFieldSort[]) => void;
}) {
  const { t } = useTranslation();
  const options = [
    ...BASE_SORTS.map((key) => ({
      key,
      label: t(`workspace:projects.table.sorts.${key}`),
    })),
    ...definitions
      .filter((field) => field.type !== "formula")
      .map((field) => ({ key: field.id, label: field.name })),
  ];
  const used = new Set(sort.map((item) => item.key));

  const update = (index: number, next: Partial<ProjectFieldSort>) => {
    onChange(
      sort.map((item, current) =>
        current === index ? { ...item, ...next } : item,
      ),
    );
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <ArrowUpDown aria-hidden="true" />
            {t("workspace:projects.table.sort")}
            {sort.length > 0 ? ` (${sort.length})` : ""}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 space-y-2 p-3">
        {sort.map((item, index) => (
          <div
            key={`${item.key}-${item.direction}`}
            className="flex items-center gap-1.5"
          >
            <Select
              value={item.key}
              onValueChange={(next) => {
                if (typeof next === "string") update(index, { key: next });
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("workspace:projects.table.sortField")}
                className="flex-1"
              >
                <SelectValue>
                  {options.find((option) => option.key === item.key)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem
                    key={option.key}
                    value={option.key}
                    disabled={used.has(option.key) && option.key !== item.key}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t(
                item.direction === "asc"
                  ? "workspace:projects.table.ascending"
                  : "workspace:projects.table.descending",
              )}
              onClick={() =>
                update(index, {
                  direction: item.direction === "asc" ? "desc" : "asc",
                })
              }
            >
              {item.direction === "asc" ? <ArrowUp /> : <ArrowDown />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("workspace:projects.table.removeSort")}
              onClick={() =>
                onChange(sort.filter((_entry, current) => current !== index))
              }
            >
              <X />
            </Button>
          </div>
        ))}
        {sort.length < PROJECT_TABLE_MAX_SORTS ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => {
              const next = options.find((option) => !used.has(option.key));
              if (!next) return;
              onChange([...sort, { key: next.key, direction: "asc" }]);
            }}
          >
            + {t("workspace:projects.table.addSort")}
          </Button>
        ) : null}
        {sort.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {t("workspace:projects.table.sortHint")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
