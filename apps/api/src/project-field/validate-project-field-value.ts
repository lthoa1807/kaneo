import { HTTPException } from "hono/http-exception";
import { isChoiceType, parseChoiceValue } from "../custom-field/choice-options";
import type { ProjectFieldType } from "./types";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ProjectFieldValueDefinition = {
  name: string;
  type: ProjectFieldType;
  required: boolean;
  options: string[] | null;
  hiddenOptions: string[];
};

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

function isDateOnly(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseMultiselect(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    badRequest("Value must be a valid JSON array");
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string")
  ) {
    badRequest("Value must be a JSON array of options");
  }
  return parsed as string[];
}

// Hidden options stay on values that already have them but can't be picked
// anew, so the current value is checked before rejecting hidden picks.
function normalizeChoiceValue(
  definition: ProjectFieldValueDefinition,
  value: string,
  currentValue: string | null,
): string {
  const options = definition.options ?? [];
  const hidden = new Set(definition.hiddenOptions);

  if (definition.type === "dropdown") {
    if (!options.includes(value)) {
      badRequest(
        `"${value}" is not an available option for "${definition.name}"`,
      );
    }
    if (hidden.has(value) && value !== currentValue) {
      badRequest("Hidden options can't be selected");
    }
    return value;
  }

  const picked = parseMultiselect(value);
  const unknown = picked.find((option) => !options.includes(option));
  if (unknown !== undefined) {
    badRequest(
      `"${unknown}" is not an available option for "${definition.name}"`,
    );
  }

  const kept = new Set(parseChoiceValue(currentValue, "multiselect"));
  const newHiddenPick = picked.find(
    (option) => hidden.has(option) && !kept.has(option),
  );
  if (newHiddenPick !== undefined) {
    badRequest("Hidden options can't be selected");
  }

  return JSON.stringify(Array.from(new Set(picked)));
}

function normalizeStoredValue(
  definition: ProjectFieldValueDefinition,
  nextValue: string | null,
) {
  if (definition.type === "text" || definition.type === "long_text") {
    return nextValue ?? "";
  }
  return (nextValue ?? "").trim();
}

function isEmptyValue(
  definition: ProjectFieldValueDefinition,
  value: string,
): boolean {
  if (value.trim().length === 0) return true;
  if (definition.type !== "multiselect") return false;
  return parseMultiselect(value).length === 0;
}

export function normalizeProjectFieldValue(
  definition: ProjectFieldValueDefinition,
  nextValue: string | null,
  currentValue: string | null,
): string | null {
  if (definition.type === "formula") {
    badRequest("Formula fields are computed and cannot be edited");
  }

  const stored = normalizeStoredValue(definition, nextValue);

  if (isEmptyValue(definition, stored)) {
    if (definition.required) {
      badRequest(`"${definition.name}" is required`);
    }
    return null;
  }

  if (definition.type === "number") {
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) {
      badRequest(`"${definition.name}" expects a number`);
    }
  }

  if (definition.type === "date" && !isDateOnly(stored)) {
    badRequest(`"${definition.name}" expects a date in YYYY-MM-DD format`);
  }

  if (
    definition.type === "boolean" &&
    stored !== "true" &&
    stored !== "false"
  ) {
    badRequest(`"${definition.name}" expects true or false`);
  }

  if (isChoiceType(definition.type)) {
    return normalizeChoiceValue(definition, stored, currentValue);
  }

  return stored;
}
