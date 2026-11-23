import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CustomFieldPopover } from "@/components/custom-fields/custom-field-popover";
import type { EditableFieldDefinition } from "@/components/custom-fields/editable-field";
import { ProjectFieldBooleanEditor } from "@/components/project-fields/project-field-boolean-editor";
import type {
  ProjectFieldDefinition,
  ProjectFieldTableProject,
} from "@/components/project-fields/types";
import { Button } from "@/components/ui/button";

function toEditableField(
  field: ProjectFieldDefinition,
): EditableFieldDefinition {
  return {
    name: field.name,
    type: field.type as EditableFieldDefinition["type"],
    required: field.required,
    defaultValue: field.defaultValue,
    options: field.options,
    hiddenOptions: field.hiddenOptions,
  };
}

export function ProjectFieldCell({
  field,
  project,
  canEdit,
  onSave,
}: {
  field: ProjectFieldDefinition;
  project: ProjectFieldTableProject;
  canEdit: boolean;
  onSave: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const value =
    field.type === "formula"
      ? (project.formulas[field.id] ?? null)
      : (project.values[field.id] ?? null);

  if (field.type === "formula") {
    return (
      <span className="truncate text-muted-foreground text-sm tabular-nums">
        {value ?? "—"}
      </span>
    );
  }

  if (field.type === "long_text") {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-auto max-w-full justify-start truncate px-1 font-normal text-muted-foreground"
        render={
          <Link
            to="/dashboard/settings/projects/$projectId/general"
            params={{ projectId: project.id }}
          />
        }
        aria-label={`${field.name}: ${project.name}`}
      >
        {value ?? "—"}
      </Button>
    );
  }

  if (field.type === "boolean") {
    return (
      <ProjectFieldBooleanEditor
        name={`${field.name}: ${project.name}`}
        value={value}
        required={field.required}
        disabled={!canEdit}
        onChange={onSave}
      />
    );
  }

  const empty = field.type === "multiselect" ? "[]" : "";
  const control = (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto max-w-full justify-start truncate px-1 font-normal"
      disabled={!canEdit}
      aria-label={`${field.name}: ${project.name}`}
    >
      {value ?? (
        <span className="text-muted-foreground/70">
          {t("tasks:customFields.empty")}
        </span>
      )}
    </Button>
  );

  if (!canEdit) return control;

  return (
    <CustomFieldPopover
      field={toEditableField(field)}
      value={value ?? empty}
      onChange={(next) => {
        if (field.required && next.trim() === "") return;
        onSave(next === empty ? null : next);
      }}
    >
      {control}
    </CustomFieldPopover>
  );
}
