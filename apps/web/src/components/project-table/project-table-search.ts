import type {
  ProjectFieldDefinition,
  ProjectFieldFilter,
  ProjectFieldFilterOperator,
  ProjectFieldSort,
  ProjectFieldTableParams,
  ProjectFieldType,
} from "@/components/project-fields/types";

export const PROJECT_TABLE_PAGE_SIZE = 50;
export const PROJECT_TABLE_MAX_FILTERS = 20;
export const PROJECT_TABLE_MAX_SORTS = 2;

export type ProjectsSearch = {
  view?: "overview" | "fields";
  filters?: string;
  sort?: string;
  page?: number;
  includeArchived?: boolean;
};

export type ProjectTableSearchState = ProjectFieldTableParams;

export const DEFAULT_PROJECT_TABLE_SEARCH: ProjectTableSearchState = {
  filters: [],
  sort: [],
  page: 0,
  limit: PROJECT_TABLE_PAGE_SIZE,
  includeArchived: false,
};

export const FILTER_OPERATORS: Record<
  Exclude<ProjectFieldType, "formula">,
  ProjectFieldFilterOperator[]
> = {
  text: ["contains", "eq", "neq", "startsWith", "empty", "notEmpty"],
  long_text: ["contains", "eq", "neq", "startsWith", "empty", "notEmpty"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "empty", "notEmpty"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte", "empty", "notEmpty"],
  dropdown: ["eq", "neq", "in", "empty", "notEmpty"],
  multiselect: ["in", "empty", "notEmpty"],
  boolean: ["eq", "neq", "empty", "notEmpty"],
};

export function filterOperatorsFor(
  field: ProjectFieldDefinition,
): ProjectFieldFilterOperator[] {
  if (field.type === "formula") return [];
  return FILTER_OPERATORS[field.type];
}

export function operatorNeedsValue(operator: ProjectFieldFilterOperator) {
  return operator !== "empty" && operator !== "notEmpty";
}

function parseJson(value: string | undefined) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function validFilter(
  candidate: unknown,
  definitions: ProjectFieldDefinition[],
): candidate is ProjectFieldFilter {
  if (!candidate || typeof candidate !== "object") return false;
  const filter = candidate as ProjectFieldFilter;
  const field = definitions.find((item) => item.id === filter.fieldId);
  if (!field) return false;
  if (!filterOperatorsFor(field).includes(filter.operator)) return false;
  if (!operatorNeedsValue(filter.operator)) return true;
  if (field.type === "dropdown" || field.type === "multiselect") {
    // `in` takes a list; scalar dropdown operators take one option.
    if (filter.operator === "in") {
      return (
        Array.isArray(filter.value) &&
        filter.value.length > 0 &&
        filter.value.every((item) => typeof item === "string")
      );
    }
    return typeof filter.value === "string" && filter.value.length > 0;
  }
  return typeof filter.value === "string" && filter.value.length > 0;
}

function validSort(
  candidate: unknown,
  definitions: ProjectFieldDefinition[],
): candidate is ProjectFieldSort {
  if (!candidate || typeof candidate !== "object") return false;
  const sort = candidate as ProjectFieldSort;
  if (sort.direction !== "asc" && sort.direction !== "desc") return false;
  if (sort.key === "name" || sort.key === "createdAt") return true;
  const field = definitions.find((item) => item.id === sort.key);
  return Boolean(field && field.type !== "formula");
}

export function decodeProjectTableSearch(
  raw: ProjectsSearch,
  definitions: ProjectFieldDefinition[],
): ProjectTableSearchState {
  const filters = Array.isArray(parseJson(raw.filters))
    ? (parseJson(raw.filters) as unknown[])
        .filter((filter) => validFilter(filter, definitions))
        .slice(0, PROJECT_TABLE_MAX_FILTERS)
    : [];
  const sort = Array.isArray(parseJson(raw.sort))
    ? (parseJson(raw.sort) as unknown[])
        .filter((item) => validSort(item, definitions))
        .slice(0, PROJECT_TABLE_MAX_SORTS)
    : [];

  return {
    filters,
    sort,
    page: Number.isInteger(raw.page) && raw.page! >= 0 ? raw.page! : 0,
    limit: PROJECT_TABLE_PAGE_SIZE,
    includeArchived: raw.includeArchived === true,
  };
}

export function encodeProjectTableSearch(
  next: Partial<ProjectTableSearchState>,
): ProjectsSearch {
  const state = { ...DEFAULT_PROJECT_TABLE_SEARCH, ...next };

  return {
    ...(state.filters.length ? { filters: JSON.stringify(state.filters) } : {}),
    ...(state.sort.length ? { sort: JSON.stringify(state.sort) } : {}),
    ...(state.page > 0 ? { page: state.page } : {}),
    ...(state.includeArchived ? { includeArchived: true } : {}),
  };
}
