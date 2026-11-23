import type {
  ProjectFieldDefinition,
  ProjectFieldFormula,
  ProjectFieldType,
} from "@/components/project-fields/types";

export type ProjectFieldFormValues = {
  name: string;
  type: ProjectFieldType;
  required: boolean;
  defaultValue: string;
  optionsText: string;
};

export type ProjectFieldFormErrors = {
  name?: "requiredName" | "duplicateName";
  options?: "requiredOptions";
  formula?: "requiredFormula";
};

export function emptyProjectFieldForm(): ProjectFieldFormValues {
  return {
    name: "",
    type: "text",
    required: false,
    defaultValue: "",
    optionsText: "",
  };
}

export function projectFieldFormFromDefinition(
  field: ProjectFieldDefinition,
): ProjectFieldFormValues {
  return {
    name: field.name,
    type: field.type,
    required: field.required,
    defaultValue: field.defaultValue ?? "",
    optionsText: (field.options ?? []).join("\n"),
  };
}

export function parseProjectFieldOptions(value: string) {
  return Array.from(
    new Set(
      value
        .split("\n")
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  );
}

export function validateProjectFieldForm(
  values: ProjectFieldFormValues,
  {
    editingId,
    existing,
    formula,
  }: {
    editingId?: string;
    existing: ProjectFieldDefinition[];
    formula: ProjectFieldFormula | null;
  },
): ProjectFieldFormErrors {
  const errors: ProjectFieldFormErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = "requiredName";
  } else if (
    existing.some(
      (field) =>
        field.id !== editingId &&
        field.name.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = "duplicateName";
  }

  if (
    (values.type === "dropdown" || values.type === "multiselect") &&
    parseProjectFieldOptions(values.optionsText).length === 0
  ) {
    errors.options = "requiredOptions";
  }

  if (values.type === "formula" && !formula) {
    errors.formula = "requiredFormula";
  }

  return errors;
}

export function hasProjectFieldFormErrors(errors: ProjectFieldFormErrors) {
  return Object.keys(errors).length > 0;
}
