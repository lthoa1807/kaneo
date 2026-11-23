import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { getProjectStatisticsForIds } from "../../project/controllers/get-project-statistics";
import { projectFieldTableFilters, projectFieldTableSorts } from "../schema";
import {
  countProjectFieldRows,
  loadProjectFieldDefinitions,
  queryProjectFieldPage,
} from "../table-query";
import type {
  ProjectFieldTableQuery,
  ProjectFieldTableResult,
  TableFilter,
  TableSort,
} from "../table-types";

const MAX_QUERY_LENGTH = 16 * 1024;

export type ProjectFieldTableRequest = {
  workspaceId: string;
  userId: string;
  filters?: string;
  sort?: string;
  limit: number;
  offset: number;
  includeArchived: boolean;
};

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

function parseJsonArray(raw: string | undefined, label: string) {
  if (raw === undefined || raw.trim() === "") return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    badRequest(`Invalid ${label} parameter`);
  }
}

export function parseTableFilters(raw: string | undefined): TableFilter[] {
  const parsed = projectFieldTableFilters.safeParse(
    parseJsonArray(raw, "filters"),
  );
  if (!parsed.success) badRequest("Invalid filters parameter");
  return parsed.data;
}

export function parseTableSort(raw: string | undefined): TableSort[] {
  const parsed = projectFieldTableSorts.safeParse(parseJsonArray(raw, "sort"));
  if (!parsed.success) badRequest("Invalid sort parameter");
  return parsed.data;
}

export default async function getProjectFieldTable({
  workspaceId,
  userId,
  filters,
  sort,
  limit,
  offset,
  includeArchived,
}: ProjectFieldTableRequest): Promise<ProjectFieldTableResult> {
  if ((filters?.length ?? 0) + (sort?.length ?? 0) > MAX_QUERY_LENGTH) {
    badRequest("Project field table query is too large");
  }

  const query: ProjectFieldTableQuery = {
    workspaceId,
    userId,
    filters: parseTableFilters(filters),
    sort: parseTableSort(sort),
    limit,
    offset,
    includeArchived,
  };

  return db.transaction(
    async (tx) => {
      const definitions = await loadProjectFieldDefinitions(
        tx as never,
        workspaceId,
      );
      const total = await countProjectFieldRows(
        tx as never,
        query,
        definitions,
      );
      const projects = await queryProjectFieldPage(
        tx as never,
        query,
        definitions,
      );

      const statistics = await getProjectStatisticsForIds(
        tx,
        projects.map((project) => project.id),
      );
      for (const project of projects) {
        project.statistics = statistics.get(project.id) ?? project.statistics;
      }

      return { definitions, projects, total };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
