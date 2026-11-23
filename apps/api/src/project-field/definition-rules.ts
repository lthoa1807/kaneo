import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import { workspaceCustomFieldDefinitionTable } from "../database/schema";
import { assertValidDefinition } from "../custom-field/assert-valid-definition";
import {
  isChoiceType,
  normalizeOptions,
  readOptions,
} from "../custom-field/choice-options";
import { resolveFieldUpdate } from "../custom-field/resolve-field-update";
import { projectFieldFormulaSchema } from "./schema";
import {
  PROJECT_FIELD_TYPES,
  type NormalizedProjectFieldDefinition,
  type ProjectFieldDefinitionInput,
  type ProjectFieldFormula,
  type ProjectFieldType,
  type ProjectFieldUpdateInput,
} from "./types";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type CurrentProjectField = {
  name: string;
  type: string;
  required: boolean;
  defaultValue: string | null;
  options: unknown;
  hiddenOptions: unknown;
  formula: unknown;
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

function projectFieldType(type: string): ProjectFieldType {
  if ((PROJECT_FIELD_TYPES as readonly string[]).includes(type)) {
    return type as ProjectFieldType;
  }
  return badRequest(`Unknown project field type "${type}"`);
}

function normalizeDefaultValue(
  type: ProjectFieldType,
  value: string | null | undefined,
) {
  if (value == null || value.trim() === "") return null;
  if (type === "text" || type === "long_text") return value;
  return value.trim();
}

function assertDateOnly(value: string, fieldName: string) {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    badRequest(
      `Project field "${fieldName}" expects a date in YYYY-MM-DD format`,
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    badRequest(`Project field "${fieldName}" expects a valid calendar date`);
  }
}

function formulaSources(formula: ProjectFieldFormula) {
  if (formula.kind === "date_diff") {
    return [
      { id: formula.fromFieldId, type: "date" },
      { id: formula.toFieldId, type: "date" },
    ] as const;
  }
  if (formula.kind === "date_add") {
    return [{ id: formula.fromFieldId, type: "date" }] as const;
  }
  return [
    { id: formula.leftFieldId, type: "number" },
    { id: formula.rightFieldId, type: "number" },
  ] as const;
}

async function assertFormulaSources(
  tx: Transaction,
  workspaceId: string,
  formula: ProjectFieldFormula,
) {
  const requirements = formulaSources(formula);
  const ids = [...new Set(requirements.map((source) => source.id))];
  const rows = await tx
    .select({
      id: workspaceCustomFieldDefinitionTable.id,
      type: workspaceCustomFieldDefinitionTable.type,
    })
    .from(workspaceCustomFieldDefinitionTable)
    .where(
      and(
        eq(workspaceCustomFieldDefinitionTable.workspaceId, workspaceId),
        inArray(workspaceCustomFieldDefinitionTable.id, ids),
      ),
    )
    .for("share");

  const byId = new Map(rows.map((row) => [row.id, row.type]));
  for (const source of requirements) {
    const actual = byId.get(source.id);
    if (!actual) {
      badRequest("Formula sources must belong to this workspace");
    }
    if (actual === "formula") {
      badRequest("Formula fields cannot reference another formula field");
    }
    if (actual !== source.type) {
      badRequest(`Formula source ${source.id} must be a ${source.type} field`);
    }
  }
}

export function parseProjectFieldFormula(
  value: unknown,
): ProjectFieldFormula | null {
  const parsed = projectFieldFormulaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function projectFieldFormulaReferences(
  formula: ProjectFieldFormula,
  fieldId: string,
) {
  return formulaSources(formula).some((source) => source.id === fieldId);
}

export async function findDependentProjectFields(
  tx: Transaction,
  workspaceId: string,
  fieldId: string,
) {
  const rows = await tx
    .select({
      id: workspaceCustomFieldDefinitionTable.id,
      name: workspaceCustomFieldDefinitionTable.name,
      formula: workspaceCustomFieldDefinitionTable.formula,
    })
    .from(workspaceCustomFieldDefinitionTable)
    .where(
      and(
        eq(workspaceCustomFieldDefinitionTable.workspaceId, workspaceId),
        eq(workspaceCustomFieldDefinitionTable.type, "formula"),
      ),
    );

  return rows.flatMap((row) => {
    const formula = parseProjectFieldFormula(row.formula);
    return formula && projectFieldFormulaReferences(formula, fieldId)
      ? [{ id: row.id, name: row.name }]
      : [];
  });
}

export function normalizeProjectFieldDefinition(
  input: ProjectFieldDefinitionInput,
): NormalizedProjectFieldDefinition {
  const name = input.name.trim();
  if (!name) badRequest("Name cannot be empty");

  const type = input.type;
  const choice = isChoiceType(type);
  if (!choice && input.options !== undefined && input.options.length > 0) {
    badRequest("Only dropdown and multiselect fields have options");
  }

  return {
    name,
    type,
    required: input.required ?? false,
    defaultValue: normalizeDefaultValue(type, input.defaultValue),
    options: choice ? normalizeOptions(input.options ?? []) : null,
    hiddenOptions: choice ? normalizeOptions(input.hiddenOptions ?? []) : [],
    formula: input.formula ?? null,
  };
}

export function resolveProjectFieldUpdate(
  field: CurrentProjectField,
  input: ProjectFieldUpdateInput,
): NormalizedProjectFieldDefinition {
  const currentType = projectFieldType(field.type);
  const requestedType = input.type ?? currentType;

  if (currentType === "formula" || requestedType === "formula") {
    if (currentType !== "formula" || requestedType !== "formula") {
      badRequest(
        "The type of a project field cannot change. Only dropdown and multiselect fields can switch between each other.",
      );
    }

    const name = input.name === undefined ? field.name : input.name.trim();
    if (!name) badRequest("Name cannot be empty");
    if (input.required === true)
      badRequest("Formula fields cannot be required");
    if (
      input.defaultValue !== undefined &&
      input.defaultValue !== null &&
      input.defaultValue.trim() !== ""
    ) {
      badRequest("Formula fields cannot have a default value");
    }
    if (input.options && input.options.length > 0) {
      badRequest("Formula fields cannot have options");
    }
    if (input.hiddenOptions && input.hiddenOptions.length > 0) {
      badRequest("Formula fields cannot have hidden options");
    }

    const formula =
      input.formula === undefined
        ? parseProjectFieldFormula(field.formula)
        : input.formula;
    if (!formula) badRequest("Formula fields require a valid formula");

    return {
      name,
      type: "formula",
      required: false,
      defaultValue: null,
      options: null,
      hiddenOptions: [],
      formula,
    };
  }

  if (input.formula !== undefined && input.formula !== null) {
    badRequest("Only formula fields can have a formula");
  }

  const resolved = resolveFieldUpdate(field, {
    name: input.name,
    type: input.type,
    required: input.required,
    defaultValue: input.defaultValue,
    options: input.options,
    hiddenOptions: input.hiddenOptions,
  });

  const type = projectFieldType(resolved.type);
  return {
    name: resolved.name,
    type,
    required: resolved.required,
    defaultValue: resolved.defaultValue,
    options: isChoiceType(type) ? readOptions(resolved.options) : null,
    hiddenOptions: resolved.hiddenOptions,
    formula: null,
  };
}

export async function assertValidProjectFieldDefinition(
  tx: Transaction,
  workspaceId: string,
  input: NormalizedProjectFieldDefinition,
) {
  if (input.type === "formula") {
    if (input.required) badRequest("Formula fields cannot be required");
    if (input.defaultValue !== null) {
      badRequest("Formula fields cannot have a default value");
    }
    if (input.options !== null || input.hiddenOptions.length > 0) {
      badRequest("Formula fields cannot have options");
    }
    if (!input.formula) badRequest("Formula fields require a formula");
    await assertFormulaSources(tx, workspaceId, input.formula);
    return;
  }

  if (input.formula !== null)
    badRequest("Only formula fields can have a formula");
  if (input.type === "date" && input.defaultValue !== null) {
    assertDateOnly(input.defaultValue, input.name);
  }

  assertValidDefinition({
    name: input.name,
    type: input.type,
    required: input.required,
    defaultValue: input.defaultValue,
    options: input.options,
    hiddenOptions: input.hiddenOptions,
  });
}

function postgresError(error: unknown): { code?: string; constraint?: string } {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") break;
    const shape = current as {
      code?: string;
      constraint?: string;
      cause?: unknown;
    };
    if (shape.code || shape.constraint) return shape;
    current = shape.cause;
  }
  return {};
}

export function isProjectFieldNameConflict(error: unknown) {
  const cause = postgresError(error);
  return (
    cause.code === "23505" &&
    cause.constraint === "workspace_custom_field_def_workspace_name_unique"
  );
}
