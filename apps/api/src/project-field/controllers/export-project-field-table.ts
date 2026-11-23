import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  serializeProjectFieldCsvHeader,
  serializeProjectFieldCsvRows,
} from "../csv";
import type {
  ProjectFieldTableQuery,
  ProjectFieldTableRow,
} from "../table-types";
import {
  countProjectFieldRows,
  loadProjectFieldDefinitions,
  queryProjectFieldPage,
} from "../table-query";
import type { ProjectFieldDefinition } from "../types";
import {
  parseTableFilters,
  parseTableSort,
  type ProjectFieldTableRequest,
} from "./get-project-field-table";

const MAX_EXPORT_ROWS = 20_000;
const BATCH_SIZE = 500;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ExportProjectFieldTableRequest = ProjectFieldTableRequest & {
  columns?: string;
};

export type ExportProjectFieldTableDependencies = {
  transaction: <T>(run: (tx: Transaction) => Promise<T>) => Promise<T>;
  loadDefinitions: (
    tx: Transaction,
    workspaceId: string,
  ) => Promise<ProjectFieldDefinition[]>;
  countRows: (
    tx: Transaction,
    query: ProjectFieldTableQuery,
    definitions: ProjectFieldDefinition[],
  ) => Promise<number>;
  queryPage: (
    tx: Transaction,
    query: ProjectFieldTableQuery,
    definitions: ProjectFieldDefinition[],
  ) => Promise<ProjectFieldTableRow[]>;
};

const defaultDependencies: ExportProjectFieldTableDependencies = {
  transaction: (run) =>
    db.transaction(run, {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    }),
  loadDefinitions: (tx, workspaceId) =>
    loadProjectFieldDefinitions(tx as never, workspaceId),
  countRows: (tx, query, definitions) =>
    countProjectFieldRows(tx as never, query, definitions),
  queryPage: (tx, query, definitions) =>
    queryProjectFieldPage(tx as never, query, definitions),
};

export function resolveExportColumns(
  definitions: ProjectFieldDefinition[],
  columns: string | undefined,
) {
  if (columns === undefined) return definitions.map((field) => field.id);

  const requested = new Set(
    columns
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean),
  );
  const unknown = [...requested].find(
    (id) => !definitions.some((field) => field.id === id),
  );
  if (unknown !== undefined) {
    throw new HTTPException(400, {
      message: "Invalid project field column",
    });
  }

  // Definition order keeps the CSV header stable no matter how the client
  // ordered or repeated its visible column ids.
  return definitions
    .filter((field) => requested.has(field.id))
    .map((field) => field.id);
}

export default async function exportProjectFieldTable(
  {
    workspaceId,
    userId,
    filters,
    sort,
    includeArchived,
    columns,
  }: ExportProjectFieldTableRequest,
  dependencies: ExportProjectFieldTableDependencies = defaultDependencies,
) {
  if ((filters?.length ?? 0) + (sort?.length ?? 0) > 16 * 1024) {
    throw new HTTPException(400, {
      message: "Project field table query is too large",
    });
  }

  const baseQuery: ProjectFieldTableQuery = {
    workspaceId,
    userId,
    filters: parseTableFilters(filters),
    sort: parseTableSort(sort),
    limit: BATCH_SIZE,
    offset: 0,
    includeArchived,
  };

  const csv = await dependencies.transaction(async (tx) => {
    const definitions = await dependencies.loadDefinitions(tx, workspaceId);
    const total = await dependencies.countRows(tx, baseQuery, definitions);
    if (total > MAX_EXPORT_ROWS) {
      throw new HTTPException(400, {
        message: `Export is limited to ${MAX_EXPORT_ROWS.toLocaleString("en-US")} rows. Narrow the filters and try again.`,
      });
    }

    const columnIds = resolveExportColumns(definitions, columns);
    let output = serializeProjectFieldCsvHeader(definitions, columnIds);

    for (let offset = 0; offset < total; offset += BATCH_SIZE) {
      const page = await dependencies.queryPage(
        tx,
        { ...baseQuery, offset },
        definitions,
      );
      if (page.length === 0) break;
      output += serializeProjectFieldCsvRows(definitions, page, columnIds);
      if (page.length < BATCH_SIZE) break;
    }

    return output;
  });

  return { csv, filename: `projects-${workspaceId}.csv` };
}
