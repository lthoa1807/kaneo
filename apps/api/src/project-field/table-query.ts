import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import type db from "../database";
import {
  projectCustomFieldValueTable,
  projectTable,
  workspaceCustomFieldDefinitionTable,
} from "../database/schema";
import { projectAccessCondition } from "../project-access/project-access-condition";
import { toProjectFieldDefinition } from "./to-project-field-definition";
import { buildFilterCondition, sortExpression } from "./table-filters";
import type {
  ProjectFieldTableQuery,
  ProjectFieldTableRow,
  TableFilter,
  TableSort,
} from "./table-types";
import { evaluateProjectFieldFormula } from "./formula";
import type { ProjectFieldDefinition } from "./types";

type Database = Pick<typeof db, "select" | "query">;

const PROJECT_SORT_KEYS = new Set(["name", "createdAt", "position"]);

function invalidQuery(): never {
  throw new HTTPException(400, {
    message: "Invalid project field table query",
  });
}

function definitionById(definitions: ProjectFieldDefinition[], id: string) {
  const definition = definitions.find((field) => field.id === id);
  if (!definition || definition.type === "formula") invalidQuery();
  return definition;
}

function filterConditions(
  query: ProjectFieldTableQuery,
  definitions: ProjectFieldDefinition[],
) {
  return query.filters.map((filter: TableFilter) => {
    const definition = definitionById(definitions, filter.fieldId);
    return buildFilterCondition(definition, filter.operator, filter.value);
  });
}

function baseConditions(
  query: ProjectFieldTableQuery,
  definitions: ProjectFieldDefinition[],
) {
  return [
    eq(projectTable.workspaceId, query.workspaceId),
    query.includeArchived ? undefined : isNull(projectTable.archivedAt),
    projectAccessCondition(query.userId, projectTable.id),
    ...filterConditions(query, definitions),
  ].filter((condition): condition is SQL => condition !== undefined);
}

function sortedKeys(sort: TableSort[]) {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const entry of sort) {
    if (seen.has(entry.key)) invalidQuery();
    seen.add(entry.key);
    keys.push(entry.key);
  }
  return keys;
}

function buildOrdering(
  sort: TableSort[],
  definitions: ProjectFieldDefinition[],
  aliases: Array<{ key: string; name: string }>,
) {
  const order: SQL[] = [];

  for (const entry of sort) {
    const direction = entry.direction;
    if (PROJECT_SORT_KEYS.has(entry.key)) {
      if (entry.key === "name") {
        order.push(
          direction === "desc"
            ? sql`lower(${projectTable.name}) desc`
            : sql`lower(${projectTable.name}) asc`,
        );
      } else if (entry.key === "createdAt") {
        order.push(
          direction === "desc"
            ? desc(projectTable.createdAt)
            : asc(projectTable.createdAt),
        );
      } else {
        order.push(
          direction === "desc"
            ? desc(projectTable.position)
            : asc(projectTable.position),
        );
      }
      continue;
    }

    const definition = definitionById(definitions, entry.key);
    const aliasEntry = aliases.find((entry) => entry.key === definition.id);
    if (!aliasEntry) invalidQuery();
    const expression = sortExpression(definition, aliasEntry.name);
    order.push(
      direction === "desc"
        ? sql`${expression} desc nulls last`
        : sql`${expression} asc nulls last`,
    );
  }

  // Deterministic fallbacks: two projects can share a name, a position, and
  // even a createdAt during bulk imports.
  order.push(
    asc(projectTable.position),
    asc(projectTable.createdAt),
    asc(projectTable.id),
  );
  return order;
}

export async function loadProjectFieldDefinitions(
  database: Pick<typeof db, "select">,
  workspaceId: string,
): Promise<ProjectFieldDefinition[]> {
  const fields = await database
    .select()
    .from(workspaceCustomFieldDefinitionTable)
    .where(eq(workspaceCustomFieldDefinitionTable.workspaceId, workspaceId))
    .orderBy(
      asc(workspaceCustomFieldDefinitionTable.position),
      asc(workspaceCustomFieldDefinitionTable.createdAt),
      asc(workspaceCustomFieldDefinitionTable.id),
    );
  return fields.map(toProjectFieldDefinition);
}

export async function countProjectFieldRows(
  database: Pick<typeof db, "select">,
  query: ProjectFieldTableQuery,
  definitions: ProjectFieldDefinition[],
) {
  const [row = { total: 0 }] = await database
    .select({ total: count() })
    .from(projectTable)
    .where(and(...baseConditions(query, definitions)));
  return Number(row.total);
}

export async function queryProjectFieldPage(
  database: Database,
  query: ProjectFieldTableQuery,
  definitions: ProjectFieldDefinition[],
): Promise<ProjectFieldTableRow[]> {
  const sortKeys = sortedKeys(query.sort);

  const aliases: Array<{ key: string; name: string; table: unknown }> = [];
  for (const key of sortKeys) {
    if (PROJECT_SORT_KEYS.has(key)) continue;
    const definition = definitionById(definitions, key);
    const name = `sort_value_${aliases.length}`;
    aliases.push({
      key: definition.id,
      name,
      table: alias(projectCustomFieldValueTable, name),
    });
  }

  let selection = database
    .select({
      id: projectTable.id,
      name: projectTable.name,
      slug: projectTable.slug,
      icon: projectTable.icon,
      archivedAt: projectTable.archivedAt,
      createdAt: projectTable.createdAt,
    })
    .from(projectTable);
  for (const entry of aliases) {
    const table = entry.table as typeof projectCustomFieldValueTable;
    selection = selection.leftJoin(
      table,
      and(eq(table.projectId, projectTable.id), eq(table.fieldId, entry.key)),
    ) as unknown as typeof selection;
  }

  const projects = await selection
    .where(and(...baseConditions(query, definitions)))
    .orderBy(...buildOrdering(query.sort, definitions, aliases))
    .limit(query.limit)
    .offset(query.offset);

  if (projects.length === 0) return [];

  const projectIds = projects.map((project) => project.id);
  const definitionIds = definitions.map((definition) => definition.id);
  const valueRows =
    definitionIds.length === 0
      ? []
      : await database
          .select({
            projectId: projectCustomFieldValueTable.projectId,
            fieldId: projectCustomFieldValueTable.fieldId,
            value: projectCustomFieldValueTable.value,
          })
          .from(projectCustomFieldValueTable)
          .where(
            and(
              inArray(projectCustomFieldValueTable.projectId, projectIds),
              inArray(projectCustomFieldValueTable.fieldId, definitionIds),
            ),
          );

  const valuesByProject = new Map<string, Map<string, string | null>>();
  for (const row of valueRows) {
    const projectValues = valuesByProject.get(row.projectId) ?? new Map();
    projectValues.set(row.fieldId, row.value);
    valuesByProject.set(row.projectId, projectValues);
  }

  return projects.map((project) => {
    const stored =
      valuesByProject.get(project.id) ?? new Map<string, string | null>();
    const values: Record<string, string | null> = {};
    const formulas: Record<string, string | null> = {};

    for (const definition of definitions) {
      if (definition.type === "formula") {
        formulas[definition.id] = definition.formula
          ? evaluateProjectFieldFormula(definition.formula, stored)
          : null;
        continue;
      }
      values[definition.id] = stored.get(definition.id) ?? null;
    }

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      icon: project.icon,
      archivedAt: project.archivedAt,
      createdAt: project.createdAt,
      statistics: {
        completionPercentage: 0,
        totalTasks: 0,
        dueDate: null,
      },
      values,
      formulas,
    };
  });
}
