export const PROJECT_FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "date",
  "dropdown",
  "multiselect",
  "boolean",
  "formula",
] as const;

export type ProjectFieldType = (typeof PROJECT_FIELD_TYPES)[number];

export type ProjectFieldFormula =
  | {
      kind: "date_diff";
      fromFieldId: string;
      toFieldId: string;
      unit: "day" | "month";
    }
  | {
      kind: "date_add";
      fromFieldId: string;
      amount: number;
      unit: "day" | "month";
    }
  | {
      kind: "number";
      op: "add" | "subtract" | "multiply" | "divide";
      leftFieldId: string;
      rightFieldId: string;
    };

export type ProjectFieldDefinition = {
  id: string;
  workspaceId: string;
  name: string;
  type: ProjectFieldType;
  required: boolean;
  defaultValue: string | null;
  options: string[] | null;
  hiddenOptions: string[];
  formula: ProjectFieldFormula | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectFieldWithValue = ProjectFieldDefinition & {
  projectId: string;
  valueId: string | null;
  value: string | null;
  computedValue: string | null;
};

export type ProjectFieldValueInput = {
  projectId: string;
  fieldId: string;
  value: string | null;
};

export type ProjectFieldDefinitionInput = {
  workspaceId: string;
  name: string;
  type: ProjectFieldType;
  required: boolean;
  defaultValue?: string | null;
  options?: string[];
  hiddenOptions?: string[];
  formula?: ProjectFieldFormula | null;
};

export type NormalizedProjectFieldDefinition = {
  name: string;
  type: ProjectFieldType;
  required: boolean;
  defaultValue: string | null;
  options: string[] | null;
  hiddenOptions: string[];
  formula: ProjectFieldFormula | null;
};

export type ProjectFieldUpdateInput = {
  name?: string;
  type?: ProjectFieldType;
  required?: boolean;
  defaultValue?: string | null;
  options?: string[];
  hiddenOptions?: string[];
  formula?: ProjectFieldFormula | null;
};
