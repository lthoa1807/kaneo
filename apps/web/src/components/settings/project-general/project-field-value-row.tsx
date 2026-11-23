import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CustomFieldPopover } from "@/components/custom-fields/custom-field-popover";
import type { EditableFieldDefinition } from "@/components/custom-fields/editable-field";
import { ProjectFieldBooleanEditor } from "@/components/project-fields/project-field-boolean-editor";
import type { ProjectFieldWithValue } from "@/components/project-fields/types";
import { SettingsRow } from "@/components/settings/settings-row";
import { Button } from "@/components/ui/button";

type ProjectFieldValueRowProps = {
  field: ProjectFieldWithValue;
  canEdit: boolean;
  saving?: boolean;
  onSave: (value: string | null) => void;
};

function toEditableField(
  field: ProjectFieldWithValue,
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

export function ProjectFieldValueRow({
  field,
  canEdit,
  saving = false,
  onSave,
}: ProjectFieldValueRowProps) {
  const { t } = useTranslation();
  const definedInWorkspace = t(
    "settings:projectGeneral.projectFields.definedInWorkspace",
  );

  if (field.type === "formula") {
    return (
      <SettingsRow
        title={field.name}
        description={definedInWorkspace}
        badge={
          field.required ? (
            <span className="text-destructive text-xs" aria-hidden>
              *
            </span>
          ) : null
        }
      >
        <span className="text-muted-foreground text-sm tabular-nums">
          {field.computedValue ?? "—"}
        </span>
      </SettingsRow>
    );
  }

  if (field.type === "boolean") {
    return (
      <SettingsRow title={field.name} description={definedInWorkspace}>
        <ProjectFieldBooleanEditor
          name={field.name}
          value={field.value}
          required={field.required}
          disabled={!canEdit || saving}
          onChange={onSave}
        />
      </SettingsRow>
    );
  }

  if (field.type === "long_text") {
    return (
      <LongTextRow
        field={field}
        canEdit={canEdit}
        saving={saving}
        onSave={onSave}
      />
    );
  }

  const clearValue = field.type === "multiselect" ? "[]" : "";
  const value = field.value ?? (field.type === "multiselect" ? "[]" : "");
  const control = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="max-w-56 justify-start truncate font-normal"
      disabled={!canEdit || saving}
      aria-label={field.name}
    >
      {field.value ? field.value : t("tasks:customFields.empty")}
    </Button>
  );

  return (
    <SettingsRow title={field.name} description={definedInWorkspace}>
      {canEdit ? (
        <CustomFieldPopover
          field={toEditableField(field)}
          value={value}
          onChange={(next) => {
            if (field.required && next.trim() === "") return;
            onSave(next === clearValue ? null : next);
          }}
        >
          {control}
        </CustomFieldPopover>
      ) : (
        control
      )}
    </SettingsRow>
  );
}

function LongTextRow({
  field,
  canEdit,
  saving,
  onSave,
}: {
  field: ProjectFieldWithValue;
  canEdit: boolean;
  saving: boolean;
  onSave: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(field.value ?? "");

  useEffect(() => {
    setDraft(field.value ?? "");
  }, [field.value]);

  if (!canEdit) {
    return (
      <SettingsRow title={field.name} stack>
        <p className="whitespace-pre-wrap text-muted-foreground text-sm">
          {field.value || "—"}
        </p>
      </SettingsRow>
    );
  }

  return (
    <SettingsRow
      title={field.name}
      description={t(
        "settings:projectGeneral.projectFields.definedInWorkspace",
      )}
      stack
    >
      <textarea
        aria-label={field.name}
        value={draft}
        disabled={saving}
        rows={3}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-64"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft.trim();
          if (next === (field.value ?? "")) return;
          if (field.required && next === "") return;
          onSave(next === "" ? null : next);
        }}
      />
    </SettingsRow>
  );
}
