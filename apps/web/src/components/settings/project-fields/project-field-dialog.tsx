import { type FormEvent, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ProjectFieldDefinition,
  ProjectFieldFormula,
  ProjectFieldType,
} from "@/components/project-fields/types";
import {
  ProjectFieldFormulaEditor,
  defaultFormula,
} from "./project-field-formula-editor";
import { ProjectFieldTypePicker } from "./project-field-type-picker";
import {
  emptyProjectFieldForm,
  hasProjectFieldFormErrors,
  parseProjectFieldOptions,
  projectFieldFormFromDefinition,
  type ProjectFieldFormErrors,
  type ProjectFieldFormValues,
  validateProjectFieldForm,
} from "./project-field-form";
import useCreateProjectField from "@/hooks/mutations/project-field/use-create-project-field";
import useUpdateProjectField from "@/hooks/mutations/project-field/use-update-project-field";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ProjectFieldDialogProps = {
  open: boolean;
  workspaceId: string;
  fields: ProjectFieldDefinition[];
  field: ProjectFieldDefinition | null;
  onClose: () => void;
};

const TYPE_ERROR_KEYS: Record<
  NonNullable<ProjectFieldFormErrors[keyof ProjectFieldFormErrors]>,
  string
> = {
  requiredName: "settings:workspaceProjectFields.nameRequired",
  duplicateName: "settings:workspaceProjectFields.duplicateName",
  requiredOptions: "settings:workspaceProjectFields.optionsRequired",
  requiredFormula: "settings:workspaceProjectFields.formulaRequired",
};

export function ProjectFieldDialog({
  open,
  workspaceId,
  fields,
  field,
  onClose,
}: ProjectFieldDialogProps) {
  const { t } = useTranslation();
  const createField = useCreateProjectField(workspaceId);
  const updateField = useUpdateProjectField(workspaceId);
  const [values, setValues] = useState<ProjectFieldFormValues>(
    field ? projectFieldFormFromDefinition(field) : emptyProjectFieldForm(),
  );
  const [formula, setFormula] = useState<ProjectFieldFormula | null>(
    field?.formula ?? null,
  );
  const [errors, setErrors] = useState<ProjectFieldFormErrors>({});
  const nameId = useId();
  const typeId = useId();
  const defaultId = useId();
  const optionsId = useId();
  const isEditing = field !== null;
  const isPending = createField.isPending || updateField.isPending;
  const otherFields = useMemo(
    () => fields.filter((candidate) => candidate.id !== field?.id),
    [fields, field?.id],
  );

  const update = <K extends keyof ProjectFieldFormValues>(
    key: K,
    value: ProjectFieldFormValues[K],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors({});
  };

  const changeType = (type: ProjectFieldType) => {
    setValues((current) => ({
      ...current,
      type,
      optionsText:
        type === "dropdown" || type === "multiselect"
          ? current.optionsText
          : "",
      defaultValue: type === "boolean" ? "false" : current.defaultValue,
    }));
    setFormula(type === "formula" ? defaultFormula(otherFields) : null);
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const nextErrors = validateProjectFieldForm(values, {
      editingId: field?.id,
      existing: fields,
      formula,
    });
    if (hasProjectFieldFormErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    const options = parseProjectFieldOptions(values.optionsText);
    const payload = {
      name: values.name.trim(),
      type: values.type,
      required: values.type === "formula" ? false : values.required,
      defaultValue:
        values.type === "formula" || values.defaultValue === ""
          ? null
          : values.defaultValue,
      ...(values.type === "dropdown" || values.type === "multiselect"
        ? { options }
        : {}),
      ...(values.type === "formula" ? { formula } : {}),
    };

    try {
      if (field) {
        await updateField.mutateAsync({ id: field.id, ...payload });
        toast.success(t("settings:workspaceProjectFields.updateSuccess"));
      } else {
        await createField.mutateAsync({ workspaceId, ...payload });
        toast.success(t("settings:workspaceProjectFields.createSuccess"));
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t(
              isEditing
                ? "settings:workspaceProjectFields.updateError"
                : "settings:workspaceProjectFields.createError",
            ),
      );
    }
  };

  const choiceOptions = parseProjectFieldOptions(values.optionsText);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <form className="contents" noValidate onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {t(
                isEditing
                  ? "settings:workspaceProjectFields.editField"
                  : "settings:workspaceProjectFields.newField",
              )}
            </DialogTitle>
            <DialogDescription>
              {t("settings:workspaceProjectFields.subtitle")}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="max-h-[65vh] space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor={nameId}>
                {t("settings:workspaceProjectFields.nameLabel")}
              </Label>
              <Input
                id={nameId}
                value={values.name}
                placeholder={t(
                  "settings:workspaceProjectFields.namePlaceholder",
                )}
                aria-invalid={errors.name ? true : undefined}
                onChange={(event) => update("name", event.target.value)}
              />
              {errors.name ? (
                <p className="text-destructive-foreground text-xs">
                  {t(TYPE_ERROR_KEYS[errors.name])}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={typeId}>
                {t("settings:workspaceProjectFields.typeLabel")}
              </Label>
              <ProjectFieldTypePicker
                id={typeId}
                value={values.type}
                onChange={changeType}
              />
            </div>

            {values.type === "dropdown" || values.type === "multiselect" ? (
              <div className="space-y-1.5">
                <Label htmlFor={optionsId}>
                  {t("settings:workspaceProjectFields.optionsLabel")}
                </Label>
                <Textarea
                  id={optionsId}
                  rows={4}
                  value={values.optionsText}
                  placeholder={t(
                    "settings:workspaceProjectFields.optionsPlaceholder",
                  )}
                  aria-invalid={errors.options ? true : undefined}
                  onChange={(event) =>
                    update("optionsText", event.target.value)
                  }
                />
                <p className="text-muted-foreground text-xs">
                  {t("settings:workspaceProjectFields.optionsHint")}
                </p>
                {errors.options ? (
                  <p className="text-destructive-foreground text-xs">
                    {t(TYPE_ERROR_KEYS[errors.options])}
                  </p>
                ) : null}
              </div>
            ) : null}

            {values.type === "formula" ? (
              <div className="space-y-1.5">
                <ProjectFieldFormulaEditor
                  fields={otherFields}
                  value={formula}
                  onChange={setFormula}
                />
                <p className="text-muted-foreground text-xs">
                  {t("settings:workspaceProjectFields.formulaHint")}
                </p>
                {errors.formula ? (
                  <p className="text-destructive-foreground text-xs">
                    {t(TYPE_ERROR_KEYS[errors.formula])}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor={defaultId}>
                  {t("settings:workspaceProjectFields.defaultValueLabel")}
                </Label>
                {values.type === "dropdown" || values.type === "multiselect" ? (
                  <Select
                    value={values.defaultValue || "none"}
                    onValueChange={(next) =>
                      update(
                        "defaultValue",
                        next && next !== "none" ? next : "",
                      )
                    }
                  >
                    <SelectTrigger id={defaultId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("tasks:customFields.empty")}
                      </SelectItem>
                      {choiceOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : values.type === "boolean" ? (
                  <Select
                    value={values.defaultValue || "unset"}
                    onValueChange={(next) =>
                      update(
                        "defaultValue",
                        next && next !== "unset" ? next : "",
                      )
                    }
                  >
                    <SelectTrigger id={defaultId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">
                        {t("settings:projectGeneral.projectFields.unset")}
                      </SelectItem>
                      <SelectItem value="true">
                        {t("settings:projectGeneral.projectFields.yes")}
                      </SelectItem>
                      <SelectItem value="false">
                        {t("settings:projectGeneral.projectFields.no")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={defaultId}
                    type={
                      values.type === "number"
                        ? "number"
                        : values.type === "date"
                          ? "date"
                          : "text"
                    }
                    value={values.defaultValue}
                    onChange={(event) =>
                      update("defaultValue", event.target.value)
                    }
                  />
                )}
                <p className="text-muted-foreground text-xs">
                  {t("settings:workspaceProjectFields.defaultValueHint")}
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.required}
                disabled={values.type === "formula"}
                onChange={(event) => update("required", event.target.checked)}
              />
              {t("settings:workspaceProjectFields.requiredLabel")}
            </label>
            <p className="-mt-2 text-muted-foreground text-xs">
              {t("settings:workspaceProjectFields.requiredHint")}
            </p>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {t(
                isEditing
                  ? "settings:workspaceProjectFields.saveField"
                  : "settings:workspaceProjectFields.createField",
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
