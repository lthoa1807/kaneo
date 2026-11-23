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
  createdAt: string;
  updatedAt: string;
};

export type ProjectFieldWithValue = ProjectFieldDefinition & {
  projectId: string;
  valueId: string | null;
  value: string | null;
  computedValue: string | null;
};

export type ProjectFieldValue = {
  projectId: string;
  fieldId: string;
  value: string | null;
};

export type ProjectFieldUsage = {
  projectCount: number;
  valueCount: number;
  dependentFormulaCount: number;
  dependentFormulas: Array<{ id: string; name: string }>;
};

export type ProjectFieldTableStatistics = {
  completionPercentage: number;
  totalTasks: number;
  dueDate: string | null;
};

export type ProjectFieldTableProject = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  archivedAt: string | null;
  createdAt: string;
  statistics: ProjectFieldTableStatistics;
  values: Record<string, string | null>;
  formulas: Record<string, string | null>;
};

export type ProjectFieldTableResponse = {
  definitions: ProjectFieldDefinition[];
  projects: ProjectFieldTableProject[];
  total: number;
};

export type ProjectFieldFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "startsWith"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "onOrBefore"
  | "onOrAfter"
  | "empty"
  | "notEmpty"
  | "in"
  | "isTrue"
  | "isFalse";

export type ProjectFieldFilter = {
  fieldId: string;
  operator: ProjectFieldFilterOperator;
  value?: string | string[];
};

export type ProjectFieldSort = {
  key: string;
  direction: "asc" | "desc";
};

export type ProjectFieldTableParams = {
  filters: ProjectFieldFilter[];
  sort: ProjectFieldSort[];
  page: number;
  limit: number;
  includeArchived: boolean;
};

export type InlineProjectFieldType = Exclude<
  ProjectFieldType,
  "long_text" | "formula"
>;

export function isInlineProjectField(
  field: ProjectFieldDefinition,
): field is ProjectFieldDefinition & { type: InlineProjectFieldType } {
  return field.type !== "long_text" && field.type !== "formula";
}
