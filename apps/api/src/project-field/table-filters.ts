import { type SQL, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { ProjectFieldDefinition } from "./types";

const NUMBER_PATTERN = "^-?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$";
const DATE_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";

const TEXT_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "startsWith",
  "empty",
  "notEmpty",
];
const NUMBER_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "empty",
  "notEmpty",
];
const DATE_OPERATORS = NUMBER_OPERATORS;
const CHOICE_OPERATORS = ["eq", "neq", "in", "empty", "notEmpty"];
const MULTI_OPERATORS = ["in", "empty", "notEmpty"];
const BOOLEAN_OPERATORS = ["eq", "neq", "empty", "notEmpty"];

const OPERATORS_BY_TYPE: Record<string, string[]> = {
  text: TEXT_OPERATORS,
  long_text: TEXT_OPERATORS,
  number: NUMBER_OPERATORS,
  date: DATE_OPERATORS,
  dropdown: CHOICE_OPERATORS,
  multiselect: MULTI_OPERATORS,
  boolean: BOOLEAN_OPERATORS,
};

function invalidFilter(): never {
  throw new HTTPException(400, { message: "Invalid project field filter" });
}

export function assertFilterSupported(definition: ProjectFieldDefinition) {
  if (definition.type === "formula") invalidFilter();
}

export function assertOperatorSupported(
  definition: ProjectFieldDefinition,
  operator: string,
) {
  assertFilterSupported(definition);
  if (!(OPERATORS_BY_TYPE[definition.type] ?? []).includes(operator)) {
    invalidFilter();
  }
}

function scalarValue(value: string | string[] | undefined): string {
  if (value === undefined || typeof value !== "string") invalidFilter();
  return value;
}

function listValue(value: string | string[] | undefined): string[] {
  if (!Array.isArray(value) || value.length === 0) invalidFilter();
  if (value.some((item) => typeof item !== "string")) invalidFilter();
  return value;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function valuePredicate(
  definition: ProjectFieldDefinition,
  operator: string,
  value: string | string[] | undefined,
) {
  const column = sql`filtered_value.value`;
  const nonEmpty = sql`filtered_value.value is not null and btrim(filtered_value.value) <> '' and filtered_value.value <> '[]'`;

  if (operator === "notEmpty") return nonEmpty;

  switch (definition.type) {
    case "text":
    case "long_text": {
      const text = scalarValue(value);
      if (operator === "eq")
        return sql`${column} is not null and lower(${column}) = lower(${text})`;
      if (operator === "neq")
        return sql`${nonEmpty} and lower(${column}) <> lower(${text})`;
      if (operator === "contains")
        return sql`${column} ilike ${`%${escapeLike(text)}%`} escape '\\'`;
      if (operator === "startsWith")
        return sql`${column} ilike ${`${escapeLike(text)}%`} escape '\\'`;
      return invalidFilter();
    }
    case "number": {
      const raw = scalarValue(value);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) invalidFilter();
      const numeric = sql`(case when ${column} ~ ${NUMBER_PATTERN} then ${column}::numeric end)`;
      const comparisons: Record<string, SQL> = {
        eq: sql`${numeric} = ${parsed}`,
        neq: sql`${nonEmpty} and ${numeric} <> ${parsed}`,
        gt: sql`${numeric} > ${parsed}`,
        gte: sql`${numeric} >= ${parsed}`,
        lt: sql`${numeric} < ${parsed}`,
        lte: sql`${numeric} <= ${parsed}`,
      };
      const predicate = comparisons[operator];
      return predicate ?? invalidFilter();
    }
    case "date": {
      const date = scalarValue(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalidFilter();
      const typed = sql`(case when ${column} ~ ${DATE_PATTERN} then ${column} end)`;
      const comparisons: Record<string, SQL> = {
        eq: sql`${typed} = ${date}`,
        neq: sql`${nonEmpty} and ${typed} <> ${date}`,
        gt: sql`${typed} > ${date}`,
        gte: sql`${typed} >= ${date}`,
        lt: sql`${typed} < ${date}`,
        lte: sql`${typed} <= ${date}`,
      };
      const predicate = comparisons[operator];
      return predicate ?? invalidFilter();
    }
    case "dropdown": {
      if (operator === "in") {
        const options = listValue(value);
        return sql`${column} in (${sql.join(
          options.map((option) => sql`${option}`),
          sql`, `,
        )})`;
      }
      const option = scalarValue(value);
      if (operator === "eq") return sql`${column} = ${option}`;
      if (operator === "neq")
        return sql`${nonEmpty} and ${column} <> ${option}`;
      return invalidFilter();
    }
    case "multiselect": {
      const options = listValue(value);
      const matches = options.map((option) => {
        const token = JSON.stringify(option);
        return sql`position(${token} in ${column}) > 0`;
      });
      return sql`(${sql.join(matches, sql` or `)})`;
    }
    case "boolean": {
      const flag = scalarValue(value);
      if (flag !== "true" && flag !== "false") invalidFilter();
      if (operator === "eq") return sql`${column} = ${flag}`;
      if (operator === "neq") return sql`${nonEmpty} and ${column} <> ${flag}`;
      return invalidFilter();
    }
    default:
      invalidFilter();
  }
}

export function buildFilterCondition(
  definition: ProjectFieldDefinition,
  operator: string,
  value: string | string[] | undefined,
) {
  assertOperatorSupported(definition, operator);
  const nonEmpty = sql`filtered_value.value is not null and btrim(filtered_value.value) <> '' and filtered_value.value <> '[]'`;

  // `empty` selects projects without a usable value, including projects that
  // have no value row at all, so it has to negate the existence check.
  if (operator === "empty") {
    return sql`not exists (
      select 1 from project_custom_field_value filtered_value
      where filtered_value.project_id = "project"."id"
        and filtered_value.field_id = ${definition.id}
        and ${nonEmpty}
    )`;
  }

  const predicate = valuePredicate(definition, operator, value);
  return sql`exists (
    select 1 from project_custom_field_value filtered_value
    where filtered_value.project_id = "project"."id"
      and filtered_value.field_id = ${definition.id}
      and ${predicate}
  )`;
}

export function sortExpression(
  definition: ProjectFieldDefinition,
  aliasName: string,
) {
  assertFilterSupported(definition);
  const column = sql.raw(`"${aliasName}".value`);

  if (definition.type === "number") {
    return sql`(case when ${column} ~ ${NUMBER_PATTERN} then ${column}::numeric end)`;
  }
  if (definition.type === "date") {
    return sql`(case when ${column} ~ ${DATE_PATTERN} then ${column} end)`;
  }
  if (definition.type === "boolean") {
    return sql`(${column} = 'true')`;
  }
  return sql`lower(${column})`;
}
