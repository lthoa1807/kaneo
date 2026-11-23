import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProjectFieldDefinition } from "@/components/project-fields/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ProjectFieldRowProps = {
  field: ProjectFieldDefinition;
  canManage: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: (field: ProjectFieldDefinition) => void;
  onDelete: (field: ProjectFieldDefinition) => void;
  onMove: (field: ProjectFieldDefinition, direction: -1 | 1) => void;
};

export function ProjectFieldRow({
  field,
  canManage,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDelete,
  onMove,
}: ProjectFieldRowProps) {
  const { t } = useTranslation();
  const typeLabel = t(`settings:workspaceProjectFields.types.${field.type}`);

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-sm">{field.name}</span>
          <Badge variant="secondary">{typeLabel}</Badge>
          {field.required ? (
            <Badge variant="outline">
              {t("settings:workspaceProjectFields.requiredBadge")}
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {field.type === "dropdown" || field.type === "multiselect"
            ? (field.options ?? []).join(" · ")
            : field.formula
              ? field.formula.kind
              : field.defaultValue
                ? `${t("settings:workspaceProjectFields.defaultValueLabel")}: ${field.defaultValue}`
                : typeLabel}
        </p>
      </div>
      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings:workspaceProjectFields.moveUp")}
            disabled={!canMoveUp}
            onClick={() => onMove(field, -1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings:workspaceProjectFields.moveDown")}
            disabled={!canMoveDown}
            onClick={() => onMove(field, 1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings:workspaceProjectFields.editField")}
            onClick={() => onEdit(field)}
          >
            <PencilIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings:workspaceProjectFields.deleteField")}
            onClick={() => onDelete(field)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
