import type { ProjectFieldTableRow } from "./table-types";
import type { ProjectFieldDefinition } from "./types";

const BOM = "\uFEFF";
const NUMBER_GRAMMAR = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
const FORMULA_CONTROL_PREFIX = /^[=+\-@\t\r]/;

export type CsvExportInput = {
  definitions: ProjectFieldDefinition[];
  projects: ProjectFieldTableRow[];
  columnIds: string[];
};

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function needsFormulaGuard(value: string) {
  return FORMULA_CONTROL_PREFIX.test(value.trimStart());
}

// Spreadsheet apps evaluate a cell that starts with =, +, -, @, tab, or CR as
// a formula. Prefixing user-authored text with a quote neutralizes it, while
// genuine numbers stay numeric so `-42` is still usable in Excel.
function guardCell(value: string, numeric: boolean) {
  if (!needsFormulaGuard(value)) return value;
  if (numeric && NUMBER_GRAMMAR.test(value.trim())) return value;
  return `'${value}`;
}

function selectedDefinitions(
  definitions: ProjectFieldDefinition[],
  columnIds: string[],
) {
  const selected = new Set(columnIds);
  return definitions.filter((definition) => selected.has(definition.id));
}

function formatChoiceValue(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return value;
    return parsed
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  } catch {
    return value;
  }
}

function cellValue(
  definition: ProjectFieldDefinition,
  project: ProjectFieldTableRow,
) {
  if (definition.type === "formula") {
    return {
      value: project.formulas[definition.id] ?? "",
      // Formula output is canonical (a number or YYYY-MM-DD), never a formula.
      numeric: true,
    };
  }

  const stored = project.values[definition.id] ?? "";
  if (definition.type === "number") {
    return { value: stored, numeric: true };
  }
  if (definition.type === "multiselect") {
    return { value: formatChoiceValue(stored), numeric: false };
  }
  return { value: stored, numeric: false };
}

export function serializeProjectFieldCsvHeader(
  definitions: ProjectFieldDefinition[],
  columnIds: string[],
) {
  const columns = selectedDefinitions(definitions, columnIds);
  return `${BOM}${[
    csvCell("Project"),
    ...columns.map((definition) => csvCell(guardCell(definition.name, false))),
  ].join(",")}\r\n`;
}

export function serializeProjectFieldCsvRows(
  definitions: ProjectFieldDefinition[],
  projects: ProjectFieldTableRow[],
  columnIds: string[],
) {
  const columns = selectedDefinitions(definitions, columnIds);
  return projects
    .map((project) => {
      const cells = [
        csvCell(guardCell(project.name, false)),
        ...columns.map((definition) => {
          const cell = cellValue(definition, project);
          return csvCell(guardCell(cell.value, cell.numeric));
        }),
      ];
      return `${cells.join(",")}\r\n`;
    })
    .join("");
}

export function serializeProjectFieldCsv(input: CsvExportInput) {
  return (
    serializeProjectFieldCsvHeader(input.definitions, input.columnIds) +
    serializeProjectFieldCsvRows(
      input.definitions,
      input.projects,
      input.columnIds,
    )
  );
}
