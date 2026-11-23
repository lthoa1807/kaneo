# Project custom fields and aggregate table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add workspace-defined fields on projects, formula-derived values, an editable aggregate table on the Projects page, and CSV export without adding one database column per field.

**Architecture:** Store workspace-owned definitions in `workspace_custom_field_definition` and sparse project values in `project_custom_field_value`. A new Hono `project-field` module owns validation, lifecycle, formula evaluation, table querying, authorization, export, and events; React consumes its typed client through focused fetchers and TanStack Query hooks. The existing Projects overview remains intact beside a new URL-driven Fields table view.

**Tech Stack:** PostgreSQL, Drizzle ORM/migrations, Hono + Zod OpenAPI, Vitest/vite-plus, React 19, TanStack Query/Router/Virtual, Base UI, Tailwind CSS, i18next, WebSockets with optional Redis fan-out.

**Spec:** `docs/superpowers/specs/2026-11-23-project-custom-fields-table-design.md`

## Global Constraints

- Field definitions are workspace-owned and values are project-owned; task custom-field tables, endpoints, boards, filters, and UI remain unchanged.
- Adding, editing, reordering, or deleting a field is data-only after the additive migration; never create a database column per configured field.
- Supported types are exactly `text`, `long_text`, `number`, `date`, `dropdown`, `multiselect`, `boolean`, and `formula`.
- Formula fields are read-only, unstored, non-required, have no default/options, may reference only compatible non-formula fields in the same workspace, and are not sortable/filterable in v1. Date-add amounts are finite integers.
- Formula outputs are canonical: signed numeric strings for differences/arithmetic, `YYYY-MM-DD` for date addition, and `null` for missing/invalid inputs or division by zero.
- Project field names are unique per workspace. Dropdown creation needs at least one option; multiselect needs at least two. No product-provided templates or options.
- Definition writes require `workspace:manage_settings`; project values require `project:update`; reads and exports must also apply project-level access restrictions.
- Id-addressed definition/value routes return 404 for cross-workspace pairs without revealing which resource exists; table filter/sort validation returns the same generic 400 for unknown or foreign field ids.
- CSV is UTF-8 with BOM and a 20,000-row cap; native `.xlsx`, import, mobile UI, and MCP tools are out of scope.
- Events never contain values. A single instance must work without Redis; Redis only fans out the same sanitized messages.
- User-facing copy is static i18n content added to `i18n/en-US.json`, then synchronized with `pnpm i18n:check:fix`.
- Keep one component/controller/helper responsibility per file. Run heavy WSL checks one at a time with `--maxWorkers=1`; never run full web tests in parallel with typecheck.
- Do not commit, push, or open a PR unless the user explicitly authorizes it. Commit commands below are conditional checkpoints only.

## Review Focus

- **Concurrent definition creation:** two same-name creates produce one success and one 409, while concurrent distinct creates get stable unique positions (Task 2 integration tests).
- **Malformed dynamic input:** invalid filter JSON, unknown/cross-workspace field ids, and legacy malformed numeric/date values return 400 or sort as null instead of throwing/casting SQL unsafely (Task 4 integration tests).
- **Spreadsheet injection:** text-like CSV cells beginning with formula-control characters are neutralized, while genuine negative numeric/formula cells remain numeric (Task 5 unit/integration tests).
- **Access and movement:** restricted members never receive inaccessible project rows or project ids over realtime (wire messages contain workspace id only), and moving a project removes source values before seeding destination defaults (Tasks 3 and 6 integration tests).
- **Stale browser preferences:** corrupt localStorage, deleted field ids, newly added fields, and out-of-range widths reconcile to safe defaults without hiding the table (Task 10 unit tests).

---

### Task 1: Add the dynamic storage model

**Files:**
- Modify: `apps/api/src/database/schema.ts`
- Modify: `apps/api/src/database/relations.ts`
- Create: `apps/api/drizzle/0074_project_custom_fields.sql` (generated)
- Create: `apps/api/drizzle/meta/0074_snapshot.json` (generated)
- Modify: `apps/api/drizzle/meta/_journal.json` (generated)
- Create: `tests/api-integration/project-field-schema.test.ts`

**Interfaces:**
- Consumes: existing `workspaceTable`, `projectTable`, `createId`, `utcNow` schema conventions.
- Produces: `workspaceCustomFieldDefinitionTable`, `projectCustomFieldValueTable`, and Drizzle relations from workspace/project to definitions/values.

- [x] **Step 1: Write the failing schema integration test**

In `project-field-schema.test.ts`, insert two definitions and independent values for two projects, then assert the unique and cascade rules:

```ts
expect(definition.workspaceId).toBe(workspace.id);
expect(value).toMatchObject({ projectId: project.id, fieldId: definition.id });
await expect(
  db.insert(schema.projectCustomFieldValueTable).values({
    projectId: project.id,
    fieldId: definition.id,
    value: "duplicate",
  }),
).rejects.toBeDefined();
```

Also delete the definition and assert its values disappear; delete a project and assert only that project's values disappear; attempt a duplicate `(workspaceId, name)` and assert the database rejects it.

- [x] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts ../../tests/api-integration/project-field-schema.test.ts --maxWorkers=1`

Expected: FAIL because the two table exports do not exist.

- [x] **Step 3: Add the schema and relations**

Add `workspace_custom_field_definition` and `project_custom_field_value` exactly as spec §8 defines. Use:

```ts
unique("workspace_custom_field_def_workspace_name_unique").on(
  table.workspaceId,
  table.name,
);
index("project_custom_field_value_field_project_idx").on(
  table.fieldId,
  table.projectId,
);
unique("project_custom_field_value_project_field_unique").on(
  table.projectId,
  table.fieldId,
);
```

Keep `formula` as JSONB/unknown at the database boundary; parse it in the domain module. Add `projectFields` to workspace relations and `projectFieldValues` to project relations.

- [x] **Step 4: Generate and inspect the migration**

Run: `pnpm --filter @kaneo/api db:generate --name project_custom_fields`

Expected: only the two new tables, foreign keys, indexes, and unique constraints. The SQL must not alter `project`, `custom_field_definition`, or `custom_field_value`.

- [x] **Step 5: Run the schema test**

Run the Step 2 command again.

Expected: PASS.

- [x] **Step 6: Conditional checkpoint**

Inspect: `git diff -- apps/api/src/database apps/api/drizzle tests/api-integration/project-field-schema.test.ts`

If and only if commits were authorized:

```bash
git add apps/api/src/database apps/api/drizzle tests/api-integration/project-field-schema.test.ts
git commit -m "feat(api): add project field storage"
```

### Task 2: Build the definition API and rules

**Files:**
- Create: `apps/api/src/project-field/types.ts`
- Create: `apps/api/src/project-field/schema.ts`
- Create: `apps/api/src/project-field/response.ts`
- Create: `apps/api/src/project-field/definition-rules.ts`
- Create: `apps/api/src/project-field/project-field-defaults.ts`
- Create: `apps/api/src/project-field/controllers/get-project-fields-by-workspace.ts`
- Create: `apps/api/src/project-field/controllers/create-project-field.ts`
- Create: `apps/api/src/project-field/controllers/update-project-field.ts`
- Create: `apps/api/src/project-field/controllers/delete-project-field.ts`
- Create: `apps/api/src/project-field/controllers/reorder-project-fields.ts`
- Create: `apps/api/src/project-field/controllers/get-project-field-usage.ts`
- Create: `apps/api/src/project-field/index.ts`
- Modify: `apps/api/src/utils/workspace-access-middleware.ts`
- Modify: `apps/api/src/index.ts`
- Create: `tests/api-integration/project-field-definitions.test.ts`
- Create: `tests/api-integration/project-field-definition-security.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; existing `assertValidDefinition`, `resolveFieldUpdate`, choice option helpers, `workspaceAccess`, and `requireWorkspacePermission` patterns.
- Produces: `ProjectFieldType`, `ProjectFieldFormula`, `ProjectFieldDefinition`; `assertValidProjectFieldDefinition(input): Promise<void>`; `backfillProjectFieldDefault(tx, input): Promise<void>`; definition, usage, and reorder routes under `/api/project-field`.

- [x] **Step 1: Write failing definition API tests**

Cover these assertions in `project-field-definitions.test.ts`:

```ts
expect(createText.status).toBe(200);
expect(await createText.json()).toMatchObject({
  workspaceId: workspace.id,
  name: "Customer",
  type: "text",
  position: 1,
});
expect((await list.json()).map((field) => field.name)).toEqual([
  "Customer",
  "Go live",
]);
```

Add tests for every type; manual option minimums; required/default rules; strict `YYYY-MM-DD` date defaults (datetimes rejected); finite-integer date-add amounts; same-workspace formula source/type validation; rejection of nested formulas/defaults/options/required formula; non-choice type changes; dropdown ↔ multiselect conversion metadata; reorder ownership; usage counts; source deletion returning 409 with dependent formula ids/names; and default backfill including archived projects.

Add a concurrency test using `Promise.all` for same-name and distinct-name creates. Assert same-name results are `[200, 409]` in any order and distinct names receive different consecutive positions.

- [x] **Step 2: Write failing authorization tests**

In `project-field-definition-security.test.ts`, assert:

- workspace readers can list definitions;
- `workspace:manage_settings` is required for create/update/delete/reorder/usage;
- another workspace receives 404 for id-based writes;
- a task custom-field id cannot be used on a project-field route.

- [x] **Step 3: Run both files and verify failure**

Run:

```bash
pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts \
  ../../tests/api-integration/project-field-definitions.test.ts \
  ../../tests/api-integration/project-field-definition-security.test.ts \
  --maxWorkers=1
```

Expected: FAIL with 404/unregistered route or unresolved project-field module.

- [x] **Step 4: Define exact types and Zod contracts**

In `types.ts` export:

```ts
export type ProjectFieldType =
  | "text" | "long_text" | "number" | "date"
  | "dropdown" | "multiselect" | "boolean" | "formula";

export type ProjectFieldFormula =
  | { kind: "date_diff"; fromFieldId: string; toFieldId: string; unit: "day" | "month" }
  | { kind: "date_add"; fromFieldId: string; amount: number; unit: "day" | "month" }
  | { kind: "number"; op: "add" | "subtract" | "multiply" | "divide"; leftFieldId: string; rightFieldId: string };
```

`schema.ts` exports parameter schemas, create/update/reorder bodies, and the discriminated formula union. `response.ts` exports definition/list/usage schemas; usage is `{ projectCount, valueCount, dependentFormulaCount, dependentFormulas: [{ id, name }] }`.

- [x] **Step 5: Implement validation, defaults, and lifecycle controllers**

Use the existing task-field helpers for common default/options/choice conversion behavior, then layer project-only rules in `definition-rules.ts`. Normalize names/options before persistence. Every create/update/delete/reorder takes the same workspace advisory transaction lock that project create/move uses; this prevents duplicate positions, formula-source delete races, and the “definition backfill misses a concurrently created project” race. `insertUnplacedProject` joins this lock in Task 3.

`backfillProjectFieldDefault(tx, { workspaceId, fieldId, value })` selects project ids, inserts in chunks of 500 with `onConflictDoNothing`, and includes archived projects. Translate PostgreSQL code `23505` for `workspace_custom_field_def_workspace_name_unique` into HTTP 409.

Before deleting a field, query formula JSON belonging to the same workspace; return 409 with dependents before deleting/cascading values. Do not trust a formula payload's workspace ids—resolve and lock every source row. Translate the named unique constraint to 409 on both create and rename.

- [x] **Step 6: Add access lookup and mount the routes**

Extend `LookupResource` with `projectField`, resolve its workspace through `workspaceCustomFieldDefinitionTable`, and expose `workspaceAccess.fromProjectField("id")`. Register definition routes in static-before-dynamic order, mount at `/project-field`, return `projectFieldApi` from `createApp`, and add it to `AppType` so `@kaneo/libs` generates the typed client.

- [x] **Step 7: Run definition tests**

Run the Step 3 command.

Expected: PASS with no writes after a rejected request.

- [x] **Step 8: Run unchanged task custom-field update tests**

Run: `pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts ../../tests/api-integration/custom-field-update.test.ts ../../tests/api-integration/custom-field-hidden-options.test.ts --maxWorkers=1`

Expected: PASS; shared rules did not alter task-field behavior.

- [x] **Step 9: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/api/src/project-field apps/api/src/utils/workspace-access-middleware.ts apps/api/src/index.ts tests/api-integration/project-field-*.test.ts
git commit -m "feat(api): add project field definitions"
```

### Task 3: Add project values, formulas, and project lifecycle

**Files:**
- Create: `apps/api/src/project-field/formula.ts`
- Create: `apps/api/src/project-field/formula.test.ts`
- Create: `apps/api/src/project-field/validate-project-field-value.ts`
- Create: `apps/api/src/project-field/validate-project-field-value.test.ts`
- Create: `apps/api/src/project-field/controllers/get-project-fields-by-project.ts`
- Create: `apps/api/src/project-field/controllers/set-project-field-value.ts`
- Modify: `apps/api/src/project-field/schema.ts`
- Modify: `apps/api/src/project-field/response.ts`
- Modify: `apps/api/src/project-field/index.ts`
- Modify: `apps/api/src/project-field/controllers/update-project-field.ts`
- Modify: `apps/api/src/custom-field/plan-choice-value-changes.ts`
- Modify: `apps/api/src/project/controllers/insert-project.ts`
- Modify: `apps/api/src/project/controllers/move-project.ts`
- Create: `tests/api-integration/project-field-values.test.ts`
- Create: `tests/api-integration/project-field-lifecycle.test.ts`
- Create: `tests/api-integration/project-field-value-security.test.ts`

**Interfaces:**
- Consumes: Task 2 definitions/default helpers and Task 1 value table.
- Produces: `evaluateProjectFieldFormula(formula, values): string | null`; `normalizeProjectFieldValue(definition, nextValue: string | null, currentValue): string | null`; `seedProjectFieldDefaults(tx, { workspaceId, projectId }): Promise<void>`; project read/value routes; `ProjectFieldWithValue` response rows.

- [x] **Step 1: Write failing pure formula tests**

Test exact canonical behavior:

```ts
// from=2026-01-03, to=2026-01-01: date_diff is to - from.
expect(evaluateProjectFieldFormula(dayDiff, values)).toBe("-2");
expect(evaluateProjectFieldFormula(jan31PlusMonth, values)).toBe("2028-02-29");
expect(evaluateProjectFieldFormula(divideByZero, values)).toBeNull();
expect(evaluateProjectFieldFormula(addNumbers, values)).toBe("3.46");
expect(evaluateProjectFieldFormula(addNumbers, missingValues)).toBeNull();
```

Include negative month differences, non-leap February clamping, malformed legacy dates/numbers, and results that are non-finite.

- [x] **Step 2: Write failing value validation tests**

In `validate-project-field-value.test.ts`, assert strict `YYYY-MM-DD` (no datetime), finite numbers, exact booleans, active options only, valid non-empty multiselect JSON, hidden-option retention but no new hidden pick, required clear rejection, optional clear returning `null`, and formula writes rejected.

- [x] **Step 3: Run unit tests and verify failure**

Run: `pnpm --filter @kaneo/api exec vp test run src/project-field/formula.test.ts src/project-field/validate-project-field-value.test.ts --maxWorkers=1`

Expected: FAIL because the helpers do not exist.

- [x] **Step 4: Implement the pure helpers**

Use UTC calendar arithmetic rather than server-local time. For month addition, compute the target year/month at day 1, then clamp the original day to the target month's UTC last day. For month differences, count complete signed calendar months and adjust when the trailing day has not been reached. Arithmetic returns `String(Math.round(result * 100) / 100)` and `null` for division by zero/non-finite results.

Value normalization trims typed values but preserves `text`/`long_text` content except an all-whitespace value counts as empty. Multiselect values are re-serialized with `JSON.stringify` after validation and duplicate removal, preserving first-selection order. Optional empty values return `null`; controllers delete the sparse row instead of storing an empty row.

- [x] **Step 5: Write failing API/lifecycle tests**

`project-field-values.test.ts` covers set/read/clear for each stored type, computed formula rows, required rejection, hidden options, and no value row for formulas.

`project-field-lifecycle.test.ts` asserts:

```ts
expect(await valuesFor(existingProject.id)).toContainEqual(
  expect.objectContaining({ fieldId: defaulted.id, value: "Internal" }),
);
expect(await valuesFor(newProject.id)).toContainEqual(
  expect.objectContaining({ fieldId: defaulted.id, value: "Internal" }),
);
```

Also cover required-on backfill without overwriting entered values; dropdown ↔ multiselect value conversion; delete cascade; archive preservation; project deletion cascade; imported-project defaults; and moving a project deletes source values and seeds destination defaults in the same transaction.

`project-field-value-security.test.ts` covers `project:read`/`project:update`, restricted project access, cross-workspace field/project pairs returning 404, and project-field ids rejected by task custom-field endpoints.

- [x] **Step 6: Implement project value routes and lifecycle hooks**

`GET /project-field/project/{projectId}` returns ordered `ProjectFieldWithValue[]`, each containing the definition, `projectId`, `valueId`, `value`, and `computedValue`; only formulas populate `computedValue`. `PUT /project-field/project/{projectId}/value` accepts `{ fieldId, value: string | null }`, upserts or deletes one stored value, and returns `{ projectId, fieldId, value }`.

Call `seedProjectFieldDefaults` from both `insertProject` and `insertUnplacedProject`; make `insertUnplacedProject` acquire the same workspace metadata/advisory lock before inserting. In `moveProject`, delete source definition values before changing `workspaceId`, then seed target defaults after the update and before commit. Extend definition update to fill missing required project values and apply choice conversions across `projectCustomFieldValueTable`.

Parameterize `planChoiceValueChanges` with an optional entity label that defaults to the current `tasks` wording; project-field updates pass `projects`. Existing task response text and tests must remain byte-for-byte unchanged.

The value write runs in a transaction and locks the project row before resolving the definition's workspace. A concurrent project move therefore either completes after this write (and removes it) or wins first and causes the stale source-field write to return 404.

- [x] **Step 7: Run focused unit and integration tests**

Run unit tests from Step 3, then:

```bash
pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts \
  ../../tests/api-integration/project-field-values.test.ts \
  ../../tests/api-integration/project-field-lifecycle.test.ts \
  ../../tests/api-integration/project-field-value-security.test.ts \
  --maxWorkers=1
```

Expected: PASS.

- [x] **Step 8: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/api/src/project-field apps/api/src/project/controllers tests/api-integration/project-field-*.test.ts
git commit -m "feat(api): add project field values and formulas"
```

### Task 4: Build the access-scoped aggregate table query

**Files:**
- Create: `apps/api/src/project-field/table-types.ts`
- Create: `apps/api/src/project-field/table-query.ts`
- Create: `apps/api/src/project-field/table-filters.ts`
- Create: `apps/api/src/project-field/controllers/get-project-field-table.ts`
- Create: `apps/api/src/project/controllers/get-project-statistics.ts`
- Modify: `apps/api/src/project/controllers/get-projects.ts`
- Modify: `apps/api/src/project-field/schema.ts`
- Modify: `apps/api/src/project-field/response.ts`
- Modify: `apps/api/src/project-field/index.ts`
- Create: `tests/api-integration/project-field-table.test.ts`
- Create: `tests/api-integration/project-field-table-security.test.ts`

**Interfaces:**
- Consumes: Task 3 formula/value read model and `projectAccessCondition`.
- Produces: `TableFilter`, `TableSort`, `ProjectFieldTableQuery`; `loadProjectFieldDefinitions(database, workspaceId)`; `countProjectFieldRows(database, input, definitions)`; `queryProjectFieldPage(database, input, definitions)` (projects/values/formulas, no task statistics); `getWorkspaceProjectStatistics(database, workspaceId, userId, includeArchived)` for the existing list and `getProjectStatisticsForIds(database, projectIds)` for bounded table pages; `getProjectFieldTable(input): Promise<ProjectFieldTableResponse>`; `GET /api/project-field/table/{workspaceId}`.

- [x] **Step 1: Write failing table query tests**

Seed accessible/restricted/archived projects and all stored field types. Assert default page shape, `total`, 50 default/200 max pagination, deterministic project tie-breakers, field maps, computed formulas, archived toggle, and the existing completion statistics.

Cover filters with these pinned semantics (`TableFilter.value` is a string for scalar operators and a string array for `in`, so option labels may contain commas):

- text/long text comparison is case-insensitive; `contains`/`startsWith` are parameterized and treat `%`, `_`, and `\\` as literal user characters rather than SQL wildcards;
- numeric/date operators compare typed values;
- dropdown `in` matches an exact option; multiselect `in` matches any requested option;
- `neq` requires a non-empty stored value; missing values are selected only by `empty`;
- formula/unknown/cross-workspace field filters or sorts return the same generic 400; `in` requires a non-empty string array and every scalar operator rejects array values.

Cover two-key sorting, `NULLS LAST` in both directions, type-aware number/date sort, and deterministic `position`, `createdAt`, `id` fallbacks.

- [x] **Step 2: Add malformed-input and legacy-data tests**

Assert malformed JSON arrays, either raw JSON query above 16 KiB, more than 20 filters, more than two sorts, unsupported operators, invalid directions, and `limit=201` return 400. Insert malformed number/date/multiselect values directly in the database and assert table reads/filters do not throw; malformed typed values fail closed and sort as null/last where applicable.

- [x] **Step 3: Add table security tests**

In `project-field-table-security.test.ts`, assert project-access restrictions apply to both rows and `total`, API-key/custom-role scopes require `project:read`, another workspace receives 404, and no inaccessible value/name appears in the response body.

- [x] **Step 4: Run table tests and verify failure**

Run:

```bash
pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts \
  ../../tests/api-integration/project-field-table.test.ts \
  ../../tests/api-integration/project-field-table-security.test.ts \
  --maxWorkers=1
```

Expected: FAIL with an unregistered table route.

- [x] **Step 5: Implement query parsing and SQL builders**

Parse `filters` and `sort` as URL-encoded JSON arrays with Zod and the spec caps. Reject either raw query string above 16 KiB before parsing. Resolve every referenced definition before constructing SQL. `table-filters.ts` emits correlated parameterized `EXISTS`/`NOT EXISTS` predicates; escape ILIKE metacharacters with an explicit escape character, guard numbers before `::numeric`, and guard dates with the strict `YYYY-MM-DD` shape before lexical comparison/sort. For multiselect `in`, search parameterized `JSON.stringify(option)` tokens in the canonical stored text instead of casting arbitrary legacy text to JSONB; malformed rows then fail closed without aborting the query.

For each dynamic sort, alias `projectCustomFieldValueTable` and add one field-id-constrained `LEFT JOIN`. Apply type-aware order expressions and `NULLS LAST`; never interpolate field ids/operators into raw SQL.

- [x] **Step 6: Implement the paged read model**

`getProjectFieldTable` opens one read-only repeatable-read transaction and composes: definitions; filtered access-scoped count; `queryProjectFieldPage`; and one statistics query for those page ids. `queryProjectFieldPage` performs one project query, one values query restricted to its project ids, and one-pass formula evaluation. Return no value rows outside the selected project ids.

Move the existing constant-size workspace statistics query unchanged into `getWorkspaceProjectStatistics`; add the bounded `getProjectStatisticsForIds` variant for at most 200 table project ids. Keep the existing project list behavior/comment and tests unchanged rather than replacing its workspace join with a potentially unbounded `IN (...)` list.

- [x] **Step 7: Run table and existing project list tests**

Run the Step 4 command, then:

Run: `pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts ../../tests/api-integration/project-list.test.ts --maxWorkers=1`

Expected: all PASS.

- [x] **Step 8: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/api/src/project-field apps/api/src/project/controllers/get-project* tests/api-integration/project-field-table*.test.ts
git commit -m "feat(api): add project fields table query"
```

### Task 5: Export the current table as safe CSV

**Files:**
- Create: `apps/api/src/project-field/csv.ts`
- Create: `apps/api/src/project-field/csv.test.ts`
- Create: `apps/api/src/project-field/controllers/export-project-field-table.ts`
- Create: `apps/api/src/project-field/controllers/export-project-field-table.test.ts`
- Modify: `apps/api/src/project-field/schema.ts`
- Modify: `apps/api/src/project-field/index.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `tests/api-integration/cors.test.ts`
- Create: `tests/api-integration/project-field-export.test.ts`

**Interfaces:**
- Consumes: Task 4 definition/count/page helpers and canonical formula output from Task 3.
- Produces: `serializeProjectFieldCsvHeader(definitions, columnIds): string`, `serializeProjectFieldCsvRows(definitions, projects, columnIds): string`, and convenience `serializeProjectFieldCsv(input): string`; `GET /api/project-field/table/{workspaceId}/export` with identical filter/sort/archive semantics and optional comma-separated `columns`.

- [x] **Step 1: Write failing CSV unit tests**

Pin BOM, quoting, embedded quotes/newlines, selected definition order, blank cells, and canonical formula output:

```ts
const csv = serializeProjectFieldCsv(fixture);
expect(csv.startsWith("\uFEFF")).toBe(true);
expect(csv).toContain('"Acme ""North"""');
expect(csv).toContain('"line one\nline two"');
```

Add injection cases for project names, user-defined field-name headers, text/long-text/choice values, and malformed legacy typed values starting (after leading whitespace) with `=`, `+`, `-`, `@`, tab, or carriage return. Prefix those cells with a single quote. Do not prefix a number cell unless it fails the finite-number grammar; valid values such as `-42` and canonical numeric formula results such as `-2` remain numeric.

- [x] **Step 2: Run the unit test and verify failure**

Run: `pnpm --filter @kaneo/api exec vp test run src/project-field/csv.test.ts --maxWorkers=1`

Expected: FAIL because `csv.ts` does not exist.

- [x] **Step 3: Implement the serializer**

The convenience serializer takes `{ definitions, projects, columnIds }` and combines the two primitives. Header emits BOM plus `Project` and selected field names in definition order; rows emit no BOM/header so export can append batches. Escape every cell per RFC 4180 and apply formula-injection protection to every user-authored header/text-like cell plus malformed legacy typed cells. Keep all three functions pure; response headers belong in the controller.

- [x] **Step 4: Write the failing export integration test**

Assert the endpoint:

- returns `text/csv; charset=utf-8` and attachment filename `projects-<workspaceId>.csv`;
- respects access, filters, sort, archived toggle, and selected columns;
- includes all definitions when `columns` is absent;
- exports only the `Project` column when `columns=` is explicitly empty and de-duplicates repeated ids in definition order;
- returns 400 for unknown/cross-workspace column ids while allowing formula columns.

In `export-project-field-table.test.ts`, inject a fake count returning 20,001 and assert the controller rejects the hard cap without querying/serializing rows. Do not insert 20,001 full project fixtures into PostgreSQL for this boundary test.

- [x] **Step 5: Implement and mount the export controller**

Open one read-only repeatable-read export transaction, load definitions/count once, reject totals above 20,000, then call Task 4's statistics-free `queryProjectFieldPage` in stable batches of 500 and append CSV rows (header/BOM once). Do not calculate task progress, materialize every value row in one query, or weaken the public table page's max-200 schema. Use a text response schema/OpenAPI content type and set `Content-Disposition` safely. Add `Content-Disposition` to the API's CORS `exposeHeaders`, and extend `cors.test.ts` so separately hosted web/API deployments can read the filename.

- [x] **Step 6: Run export tests**

Run:

```bash
pnpm --filter @kaneo/api exec vp test run src/project-field/csv.test.ts --maxWorkers=1
pnpm --filter @kaneo/api exec vp test run src/project-field/controllers/export-project-field-table.test.ts --maxWorkers=1
pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts \
  ../../tests/api-integration/project-field-export.test.ts \
  ../../tests/api-integration/cors.test.ts --maxWorkers=1
```

Expected: PASS.

- [x] **Step 7: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/api/src/project-field apps/api/src/index.ts tests/api-integration/project-field-export.test.ts tests/api-integration/cors.test.ts
git commit -m "feat(api): export project fields as CSV"
```

### Task 6: Deliver sanitized realtime invalidation events

**Files:**
- Create: `apps/api/src/project-field/project-field-recipients.ts`
- Create: `apps/api/src/project-field/project-field-recipients.test.ts`
- Modify: `apps/api/src/project-field/controllers/create-project-field.ts`
- Modify: `apps/api/src/project-field/controllers/update-project-field.ts`
- Modify: `apps/api/src/project-field/controllers/delete-project-field.ts`
- Modify: `apps/api/src/project-field/controllers/reorder-project-fields.ts`
- Modify: `apps/api/src/project-field/controllers/set-project-field-value.ts`
- Modify: `apps/api/src/project/controllers/move-project.ts`
- Modify: `apps/api/src/ws/index.ts`
- Create: `tests/api-integration/project-field-realtime.test.ts`

**Interfaces:**
- Consumes: `publishEvent`, `workspaceUserTable`, instance-admin role helpers, and `broadcastToUser`.
- Produces: `listProjectFieldRecipients(workspaceId, dependencies?): Promise<Set<string>>`; `type ProjectFieldPublisher = (type: string, data: unknown) => Promise<void>` used as an optional controller dependency defaulting to `publishEvent`; internal `project-field.definition_changed` and `project-field.value_changed` events; user-socket messages `PROJECT_FIELD_DEFINITIONS_CHANGED` and `PROJECT_FIELD_VALUES_CHANGED` containing `workspaceId` only.

- [x] **Step 1: Write failing recipient tests**

`project-field-recipients.test.ts` injects member-list and instance-admin-list
dependencies (no database connection in the unit suite) and tests:

```ts
expect(await listProjectFieldRecipients(workspaceId)).toEqual(
  new Set([ownerId, adminId, restrictedId, instanceAdminId]),
);
```

The same workspace recipient set is used for value-change invalidation because the wire payload contains no project id or value. Exclude ordinary users outside the workspace; include restricted members (they already know the workspace and will refetch only access-scoped rows) and instance admins.

- [x] **Step 2: Write failing realtime integration tests**

Following the existing Node WebSocket integration setup, connect user sockets for an owner, an unrestricted member, a restricted member, and an outsider. Assert definition/value mutations reach workspace members only; rejected mutations deliver nothing; and every delivered JSON payload contains only its type and `workspaceId`—never `projectId`, `fieldId`, value, names, options, or formulas. Run with the in-memory adapter (no Redis configured), proving the self-hosted single-instance path and avoiding API-key scope leaks.

Separately subscribe at the controller boundary through an injected `publish` dependency and assert one post-commit internal event per create/update/delete/reorder/value mutation plus source and target workspace invalidations after project move. Do not add a permanent event listener to the global test process.

- [x] **Step 3: Run and verify failure**

Run:

```bash
pnpm --filter @kaneo/api exec vp test run src/project-field/project-field-recipients.test.ts --maxWorkers=1
pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts \
  ../../tests/api-integration/project-field-realtime.test.ts --maxWorkers=1
```

Expected: FAIL because recipient helpers/events are absent.

- [x] **Step 4: Publish only after successful transactions**

Definition event payload: `{ workspaceId, fieldId?, action: "created" | "updated" | "deleted" | "reordered" }`; reorder emits one event and omits `fieldId` because the ordered set changed.

Value event payload: `{ workspaceId, projectId, fieldId? }`. A single value write includes `fieldId`; project move/default reseed publishes source and target invalidations after commit with `fieldId` omitted.

- [x] **Step 5: Subscribe and fan out through user sockets**

In `ws/index.ts`, definition events go to every current workspace recipient as `{ type: "PROJECT_FIELD_DEFINITIONS_CHANGED", workspaceId }`; value events send `{ type: "PROJECT_FIELD_VALUES_CHANGED", workspaceId }` to the same set. Use `broadcastToUser` so in-memory delivery works without Redis and the existing adapter provides optional cross-instance fan-out. Never put project/field ids into these user-socket messages because delivery currently spans all session/API-key credentials for that user.

- [x] **Step 6: Run realtime tests**

Run the Step 3 commands.

Expected: PASS; no test payload contains a stored field value.

- [x] **Step 7: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/api/src/project-field apps/api/src/project/controllers/move-project.ts apps/api/src/ws/index.ts tests/api-integration/project-field-realtime.test.ts
git commit -m "feat(api): broadcast project field changes"
```

### Task 7: Add the typed web data layer and optimistic cache contract

**Files:**
- Create: `apps/web/src/components/project-fields/types.ts`
- Create: `apps/web/src/lib/project-field-query-keys.ts`
- Create: `apps/web/src/fetchers/project-field/get-project-fields.ts`
- Create: `apps/web/src/fetchers/project-field/create-project-field.ts`
- Create: `apps/web/src/fetchers/project-field/update-project-field.ts`
- Create: `apps/web/src/fetchers/project-field/delete-project-field.ts`
- Create: `apps/web/src/fetchers/project-field/reorder-project-fields.ts`
- Create: `apps/web/src/fetchers/project-field/get-project-field-usage.ts`
- Create: `apps/web/src/fetchers/project-field/get-project-field-values.ts`
- Create: `apps/web/src/fetchers/project-field/set-project-field-value.ts`
- Create: `apps/web/src/fetchers/project-field/get-project-field-table.ts`
- Create: `apps/web/src/fetchers/project-field/export-project-field-table.ts`
- Create: `apps/web/src/hooks/queries/project-field/use-project-fields.ts`
- Create: `apps/web/src/hooks/queries/project-field/use-project-field-values.ts`
- Create: `apps/web/src/hooks/queries/project-field/use-project-field-table.ts`
- Create: `apps/web/src/hooks/queries/project-field/use-project-field-usage.ts`
- Create: `apps/web/src/hooks/mutations/project-field/use-create-project-field.ts`
- Create: `apps/web/src/hooks/mutations/project-field/use-update-project-field.ts`
- Create: `apps/web/src/hooks/mutations/project-field/use-delete-project-field.ts`
- Create: `apps/web/src/hooks/mutations/project-field/use-reorder-project-fields.ts`
- Create: `apps/web/src/hooks/mutations/project-field/use-set-project-field-value.ts`
- Create: `apps/web/src/hooks/mutations/project-field/use-set-project-field-value.test.tsx`
- Create: `apps/web/src/hooks/mutations/project-field/project-field-definition-mutations.test.tsx`
- Modify: `apps/web/src/hooks/mutations/project/use-create-project.ts`
- Modify: `apps/web/src/hooks/mutations/project/use-update-project.ts`
- Modify: `apps/web/src/hooks/mutations/project/use-delete-project.ts`
- Modify: `apps/web/src/hooks/mutations/project/use-move-project.ts`
- Modify: `apps/web/src/hooks/mutations/project/use-reorder-projects.ts`
- Create: `apps/web/src/hooks/mutations/project/project-field-table-invalidation.test.tsx`

**Interfaces:**
- Consumes: Task 2–5 typed Hono routes via `@kaneo/libs`.
- Produces: stable query-key factories, typed project-field models, query hooks, definition mutations, optimistic value mutation, and a CSV `Blob` fetcher.

- [x] **Step 1: Write failing query-key/mutation tests**

Pin these keys:

```ts
projectFieldKeys.definitions(workspaceId); // ["project-fields", workspaceId]
projectFieldKeys.values(projectId);        // ["project-field-values", projectId]
projectFieldKeys.table(workspaceId, params); // ["project-field-table", workspaceId, normalizedParams]
```

For value mutation, seed one project-values query and two table pages for the workspace. Assert `onMutate` updates the target project's `values[fieldId]` in every page (including an explicit `null` clear), snapshots all affected entries, rollback restores every snapshot, and `onSettled` invalidates values/table. Formula maps remain unchanged optimistically and refresh after success.

For definition mutations, assert definitions/table/all project-value prefixes are invalidated and create/update never touch task custom-field keys.

For existing project mutations, assert create/update/delete/reorder invalidates the affected workspace's project-field table; move invalidates source (when recoverable from cached project data) and target, falling back to the table prefix when source scope is unknown. Delete/move also invalidates the moved/deleted project's value key. This keeps the new table current without changing existing project cache behavior.

- [x] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 \
  src/hooks/mutations/project-field/use-set-project-field-value.test.tsx \
  src/hooks/mutations/project-field/project-field-definition-mutations.test.tsx \
  src/hooks/mutations/project/project-field-table-invalidation.test.tsx
```

Expected: FAIL because the project-field web modules do not exist.

- [x] **Step 3: Add structural web types and query keys**

Mirror API response types without redefining request bodies that `InferRequestType` can infer. Export `isInlineProjectField(field)` narrowing to `text | number | date | dropdown | multiselect | boolean`; `long_text` and `formula` are not inline-editable in the aggregate table.

Normalize table params before keying: default/empty filters and sorts become empty arrays, page defaults to 0, limit to 50, and archived to false. This prevents duplicate caches for equivalent URLs.

- [x] **Step 4: Implement one-purpose fetchers and hooks**

Each fetcher calls only its typed `client["project-field"]` route and converts non-OK responses with `HttpError.fromResponse`. `exportProjectFieldTable` returns `{ blob, filename }`, reading `Content-Disposition` defensively and falling back to `projects-<workspaceId>.csv`.

Definition mutations use targeted invalidation. Value mutation implements the tested optimistic snapshots/rollback and sends only `{ fieldId, value }` to the project route. Extend existing project mutation hooks with the tested table/value invalidations; do not duplicate those calls in modal/settings components.

- [x] **Step 5: Run data-layer tests**

Run the Step 2 command.

Expected: PASS.

- [x] **Step 6: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/web/src/components/project-fields/types.ts apps/web/src/lib/project-field-query-keys.ts apps/web/src/fetchers/project-field apps/web/src/hooks/queries/project-field apps/web/src/hooks/mutations/project-field apps/web/src/hooks/mutations/project
git commit -m "feat(web): add project field data layer"
```

### Task 8: Add workspace project-field settings

**Files:**
- Create: `apps/web/src/components/settings/project-fields/project-fields-page.tsx`
- Create: `apps/web/src/components/settings/project-fields/project-field-list.tsx`
- Create: `apps/web/src/components/settings/project-fields/project-field-row.tsx`
- Create: `apps/web/src/components/settings/project-fields/project-field-dialog.tsx`
- Create: `apps/web/src/components/settings/project-fields/project-field-form.ts`
- Create: `apps/web/src/components/settings/project-fields/project-field-form.test.ts`
- Create: `apps/web/src/components/settings/project-fields/project-field-type-picker.tsx`
- Create: `apps/web/src/components/settings/project-fields/project-field-formula-editor.tsx`
- Create: `apps/web/src/components/settings/project-fields/project-field-delete-dialog.tsx`
- Create: `apps/web/src/components/settings/project-fields/project-fields-page.test.tsx`
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/project-fields.tsx`
- Modify: `apps/web/src/components/settings/nav/build-settings-nav.ts`
- Modify: `apps/web/src/components/settings/nav/build-settings-nav.test.ts`
- Modify: `apps/web/src/routeTree.gen.ts` (generated by TanStack Router)
- Modify: `i18n/en-US.json`
- Modify: `i18n/schema.json` (generated)
- Modify: other `i18n/*.json` files only as generated by `pnpm i18n:check:fix`

**Interfaces:**
- Consumes: Task 7 hooks/types and existing sortable/settings/field-option/default controls.
- Produces: `/dashboard/settings/workspace/project-fields`, definition CRUD/reorder/formula UI, and a workspace settings nav entry.

- [x] **Step 1: Write failing pure form tests**

`project-field-form.test.ts` covers payloads for all eight types, option minimums, hidden options, required/default validation, strict formula shapes, compatible-source filtering, edit preserving formula ids, and formula mode forcing `required=false`, `defaultValue=null`, `options=undefined`.

Assert there is no preset/template action or hard-coded discovery field name.

- [x] **Step 2: Write failing page tests**

Mock Task 7 hooks and assert loading/error/empty/list states, read-only rendering without `canManageSettings`, create/edit/reorder calls, and delete opening the usage-backed impact dialog. A 409 dependent-formula delete displays the server message and leaves the dialog open.

- [x] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 \
  src/components/settings/project-fields/project-field-form.test.ts \
  src/components/settings/project-fields/project-fields-page.test.tsx \
  src/components/settings/nav/build-settings-nav.test.ts
```

Expected: FAIL because the settings modules/route/nav link do not exist.

- [x] **Step 4: Implement form and focused UI components**

Reuse existing option editor, sortable list, setting-row, date/default, dialog, and confirmation primitives; do not copy their behavior. Keep project-field form state separate from task-field state because only project fields support `long_text` and `formula`.

Formula editor modes:

- date difference: two date sources + day/month;
- date addition: one date source + finite integer amount + day/month;
- arithmetic: two number sources + add/subtract/multiply/divide.

Do not offer formula fields as sources. Type stays locked after creation; dropdown/multiselect remains one visual kind with an “allow several” switch.

- [x] **Step 5: Add route, nav entry, permissions, and copy**

Add `workspace-project-fields` after Labels in settings nav. Everyone with workspace read can open the page; only `canManageSettings()` sees write controls. Use `settings:workspaceProjectFields.*` keys and explicit copy distinguishing fields on projects from custom fields on tasks.

- [x] **Step 6: Generate router/i18n artifacts and run tests**

Run `pnpm i18n:check:fix && pnpm i18n:schema`, then run the Step 3 command. The focused route test/Vite Router plugin generates `routeTree.gen.ts`; inspect that it adds only the new workspace settings route.

Expected: PASS; `pnpm i18n:check` also exits 0.

- [x] **Step 7: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/web/src/components/settings/project-fields apps/web/src/routes/_layout/_authenticated/dashboard/settings/workspace/project-fields.tsx apps/web/src/components/settings/nav apps/web/src/routeTree.gen.ts i18n
git commit -m "feat(web): manage workspace project fields"
```

### Task 9: Edit project field values on project settings

**Files:**
- Create: `apps/web/src/components/custom-fields/editable-field.ts`
- Modify: `apps/web/src/components/custom-fields/text-field-editor.tsx`
- Modify: `apps/web/src/components/custom-fields/option-field-editor.tsx`
- Modify: `apps/web/src/components/custom-fields/custom-field-popover.tsx`
- Modify: `apps/web/src/components/custom-fields/format-custom-field-value.ts`
- Create: `apps/web/src/components/settings/project-general/project-field-values-section.tsx`
- Create: `apps/web/src/components/settings/project-general/project-field-value-row.tsx`
- Create: `apps/web/src/components/project-fields/project-field-boolean-editor.tsx`
- Create: `apps/web/src/components/settings/project-general/project-field-value-row.test.tsx`
- Create: `apps/web/src/components/settings/project-general/project-field-values-section.test.tsx`
- Modify: `apps/web/src/components/settings/project-general/project-general-page.tsx`
- Modify: `i18n/en-US.json`

**Interfaces:**
- Consumes: Task 7 values query/mutation and existing task custom-field editor primitives.
- Produces: structural `EditableFieldDefinition` accepted by shared editors and a Project fields section in project General settings.

- [x] **Step 1: Write failing row tests**

Assert each stored type renders its current value and control; formulas render canonical results read-only with localized day/month labels; `long_text` uses a textarea; optional booleans offer Unset/No/Yes while required booleans offer only No/Yes; required values cannot clear; optional values can clear; a rejected save leaves the editor/value usable and shows the server/fallback error toast; and `canEdit=false` exposes no interactive editor.

Pin keyboard behavior for shared inline editors: Enter commits text/number, Escape cancels without a mutation, date/choice commits selection, boolean toggles once.

- [x] **Step 2: Write failing section tests**

Mock query states and assert loading, retryable error, zero-definition explanation linking to workspace Project fields settings, ordered rows, and one mutation payload:

```ts
expect(setValue).toHaveBeenCalledWith({
  workspaceId: "workspace-1",
  projectId: "project-1",
  fieldId: "customer",
  value: "Acme",
});
```

- [x] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 \
  src/components/settings/project-general/project-field-value-row.test.tsx \
  src/components/settings/project-general/project-field-values-section.test.tsx
```

Expected: FAIL because the section/row do not exist.

- [x] **Step 4: Generalize only the shared editor type boundary**

Move the minimal editable shape to `editable-field.ts`:

```ts
export type EditableFieldType =
  | "text" | "number" | "date" | "dropdown" | "multiselect" | "boolean";
export type EditableFieldDefinition = {
  name: string;
  type: EditableFieldType;
  required: boolean;
  defaultValue: string | null;
  options: string[] | null;
  hiddenOptions: string[];
};
```

Change existing task editor props to this structural interface without changing task behavior. Add/retain existing task editor tests to prove the refactor is neutral.

- [x] **Step 5: Implement project settings rows and section**

Use `CustomFieldPopover` for text/number/date/choice fields, a textarea that saves on blur for `long_text`, the shared project boolean editor with an explicit optional Unset state, and read-only text for formulas. Editors send `null` for an optional clear and never issue a clear for required fields. Show required markers and “Defined in workspace settings” copy. Insert the section before task behavior/danger sections in `ProjectGeneralPage`.

- [x] **Step 6: Run focused project and task editor tests**

Run the Step 3 command plus:

Run: `pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 src/components/custom-fields`

Expected: PASS.

- [x] **Step 7: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/web/src/components/custom-fields apps/web/src/components/settings/project-general i18n/en-US.json
git commit -m "feat(web): edit project field values"
```

### Task 10: Add the Projects view switch and dynamic table shell

**Files:**
- Create: `apps/web/src/components/project-list/project-overview.tsx`
- Create: `apps/web/src/components/project-list/sortable-project-row.tsx`
- Create: `apps/web/src/components/project-table/projects-view-switch.tsx`
- Create: `apps/web/src/components/project-table/project-table-preferences.ts`
- Create: `apps/web/src/components/project-table/project-table-preferences.test.ts`
- Create: `apps/web/src/components/project-table/project-table-column-menu.tsx`
- Create: `apps/web/src/components/project-table/project-fields-table.tsx`
- Create: `apps/web/src/components/project-table/project-fields-table-row.tsx`
- Create: `apps/web/src/components/project-table/project-field-cell.tsx`
- Create: `apps/web/src/components/project-table/project-fields-table.test.tsx`
- Modify: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/projects.tsx`
- Create: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/projects.test.tsx`
- Modify: `i18n/en-US.json`

**Interfaces:**
- Consumes: Task 7 table query/value mutation/types, `@tanstack/react-virtual`, current overview implementation, and `Route.useSearch()`.
- Produces: reserved URL shape `ProjectsSearch = { view?: "overview" | "fields"; filters?: string; sort?: string; page?: number; includeArchived?: boolean }` where Task 11 owns filter/sort decoding; per-user column preferences; Overview and Fields table views. Task 10 requests the default first table page only.

- [x] **Step 1: Write failing preference reconciliation tests**

Export:

```ts
type ProjectTablePreferences = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
};
reconcileProjectTablePreferences(raw, definitions): ProjectTablePreferences;
```

Assert corrupt JSON returns defaults; stale ids drop; new fields append in definition order; `long_text` starts hidden only on first sight; user-hidden state survives; widths clamp to 120–600 px; and duplicate ids collapse.

- [x] **Step 2: Write failing table/render tests**

Assert sticky project-name column and header, dynamic definition order, hidden/reordered columns, formula read-only output, long-text truncated preview, required marker, read-only cells without `project:update`, project-name links, loading/error/no-definition states, optimistic edit rollback plus error toast, and only virtual rows in the DOM for a large page fixture. Resize handles must expose an accessible label and support ArrowLeft/ArrowRight as well as pointer drag.

- [x] **Step 3: Write failing route/view tests**

Assert an invalid `view` normalizes to `overview`; switching to Fields table updates URL search; current Overview still supports drag reorder; no grid view is introduced; and the no-project empty state remains unchanged. Full filter/sort/page/archive normalization is pinned in Task 11.

- [x] **Step 4: Run tests and verify failure**

Run:

```bash
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 \
  src/components/project-table/project-table-preferences.test.ts \
  src/components/project-table/project-fields-table.test.tsx \
  'src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/projects.test.tsx'
```

Expected: FAIL because the table/view modules do not exist.

- [x] **Step 5: Extract the current Overview without behavior changes**

Move `SortableProjectRow`, drag sensors/order state, and the four existing summary columns into the two `project-list` files. Keep navigation, permissions, trial callout, create/import actions, and empty state behavior in the route or explicit props. Run the route test before building the new table.

- [x] **Step 6: Implement search validation, view switch, and preferences**

Use URL search as the source of truth for view/filter/sort/page/archive. Enable the existing projects query only for Overview and the aggregate query only for Fields table, so switching views does not keep two workspace-sized reads active. Store only presentation preferences at `kaneo:project-table:<userId>:<workspaceId>`. Do not read or write preferences until both ids are known. Read storage in an effect/lazy initializer guarded for unavailable storage; a storage exception must fall back without breaking render.

- [x] **Step 7: Implement the table shell**

Render fixed project/progress columns plus visible dynamic fields, sticky first column/header, horizontal scroll, resize handles, and the column menu. Virtualize rows with `useVirtualizer`; use semantic table roles/headers and buttons rather than clickable rows. Cell editing uses Task 9 shared editors (including the optional boolean Unset state) and Task 7 optimistic mutation; `long_text` links to project settings and formula is read-only.

- [x] **Step 8: Run table and route tests**

Run the Step 4 command.

Expected: PASS.

- [x] **Step 9: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/web/src/components/project-list apps/web/src/components/project-table 'apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/projects.tsx' 'apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/projects.test.tsx' i18n/en-US.json
git commit -m "feat(web): add project fields table view"
```

### Task 11: Add filters, multi-sort, pagination, archive toggle, and export

**Files:**
- Create: `apps/web/src/components/project-table/project-table-search.ts`
- Create: `apps/web/src/components/project-table/project-table-search.test.ts`
- Create: `apps/web/src/components/project-table/project-table-filter-bar.tsx`
- Create: `apps/web/src/components/project-table/project-table-filter-dialog.tsx`
- Create: `apps/web/src/components/project-table/project-table-sort-control.tsx`
- Create: `apps/web/src/components/project-table/project-table-pagination.tsx`
- Create: `apps/web/src/components/project-table/project-table-toolbar.tsx`
- Create: `apps/web/src/components/project-table/project-table-toolbar.test.tsx`
- Modify: `apps/web/src/components/project-table/project-fields-table.tsx`
- Modify: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/projects.tsx`
- Modify: `i18n/en-US.json`

**Interfaces:**
- Consumes: Task 4 query semantics, Task 5 export, Task 7 hooks, Task 10 `ProjectsSearch`.
- Produces: `decodeProjectTableSearch(raw): ProjectTableSearchState` and `encodeProjectTableSearch(state): ProjectsSearch`; accessible filter/sort controls, server pagination/archive toggle, and CSV download for visible columns.

- [x] **Step 1: Write failing search-state tests**

`project-table-search.ts` exports parse/serialize helpers and operator choices by type. Assert round-trip preservation of values containing commas, colons, quotes, Unicode, and newlines; max 20 filters/two sorts; formula fields unavailable; unknown/stale field ids discarded client-side; and changing filters/sort/archive resets page to 0.

Pin operator menus to the API contract and enforce `limit=50` in the UI.

- [x] **Step 2: Write failing toolbar interaction tests**

Assert users can add/edit/remove filter chips, configure primary and secondary sort independently, include archived projects, hide/show columns, clear all filters, move pages, and export. If a refetch makes the current page exceed the new last page, URL state clamps to that last page. Export must pass current filters/sort/archive and visible field ids, call `saveAs(blob, filename)`, show pending state, and toast on failure.

- [x] **Step 3: Run tests and verify failure**

Run:

```bash
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 \
  src/components/project-table/project-table-search.test.ts \
  src/components/project-table/project-table-toolbar.test.tsx \
  src/components/project-table/project-fields-table.test.tsx
```

Expected: FAIL because toolbar/search modules do not exist.

- [x] **Step 4: Implement filter and sort state**

Keep decoded arrays as component state derived from the URL; `encodeProjectTableSearch` serializes non-empty arrays with `JSON.stringify` and omits defaults before Router URL-encodes them. Filter controls depend on definition type: text input, numeric input, date picker, choice picker, or boolean picker. Formula definitions are visible columns but never selectable as filters/sorts.

The sort control displays at most two rows, each with a project/field key and asc/desc direction. Prevent duplicate sort keys and expose remove/reorder controls with accessible labels.

- [x] **Step 5: Implement pagination/archive/export wiring**

Request exactly one server page. Disable previous/next at bounds computed from `total`; retain table preferences across pages. The export mutation always sends visible dynamic ids; progress is not an export field. Use `file-saver`, not a temporary anchor.

- [x] **Step 6: Run interaction tests**

Run the Step 3 command.

Expected: PASS.

- [x] **Step 7: Conditional checkpoint**

If commits were authorized:

```bash
git add apps/web/src/components/project-table 'apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/projects.tsx' i18n/en-US.json
git commit -m "feat(web): filter and export project fields"
```

### Task 12: Wire web realtime, cache eviction, OpenAPI, docs, and final proof

**Files:**
- Modify: `apps/web/src/hooks/use-user-websocket.ts`
- Modify: `apps/web/src/hooks/use-user-websocket-lifecycle.test.tsx`
- Modify: `apps/web/src/lib/evict-workspace-cache.ts`
- Modify: `apps/web/src/lib/evict-workspace-cache.test.ts`
- Modify: `apps/docs/openapi.json` (generated)
- Modify: `apps/docs/core/functional/create-workspace-and-project.mdx`
- Modify: `i18n/schema.json` and locale files (generated)
- Modify: all project-field files only as required by focused lint/type feedback

**Interfaces:**
- Consumes: Task 6 user-socket messages and Task 7 query-key factories.
- Produces: live cache invalidation, revocation-safe cache eviction, committed OpenAPI contract, user documentation, and final verification evidence.

- [x] **Step 1: Write failing user-socket invalidation tests**

In the existing lifecycle test, send:

```ts
{ type: "PROJECT_FIELD_DEFINITIONS_CHANGED", workspaceId: "workspace" }
{ type: "PROJECT_FIELD_VALUES_CHANGED", workspaceId: "workspace" }
```

Definitions message invalidates definitions, every table page, and project-value keys for cached projects belonging to that workspace (use `collectCachedProjects`). Values message invalidates table pages and the same known workspace project-value keys, but not task custom-field keys or another workspace's table/value queries.

- [x] **Step 2: Write failing eviction tests**

Seed `project-fields`, `project-field-values`, and `project-field-table` caches for revoked and active workspaces/projects. Assert `evictWorkspaceCache` removes revoked/unscoped private data while preserving positively scoped active-workspace data.

- [x] **Step 3: Run realtime/cache tests and verify failure**

Run:

```bash
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 \
  src/hooks/use-user-websocket-lifecycle.test.tsx \
  src/lib/evict-workspace-cache.test.ts
```

Expected: FAIL because the new messages/prefixes are not handled.

- [x] **Step 4: Implement sanitized invalidation and eviction**

Handle only messages with string `workspaceId`; value messages also require string `projectId`. Use the shared key factories. Add all three private prefixes to eviction and make table cache payloads contribute project/workspace scope discovery.

- [x] **Step 5: Generate public contracts and documentation**

Run: `pnpm openapi:check:fix`

Inspect `apps/docs/openapi.json` for every `/project-field` route, formula union, permissions/descriptions, table query params, CSV response, and no task endpoint changes.

Add a concise “Track project details” section to `create-workspace-and-project.mdx`: admins define fields in Workspace settings; values live on each project; Projects → Fields table filters/edits/exports them; formulas are derived; task custom fields are separate.

Run: `pnpm i18n:check:fix && pnpm i18n:schema && pnpm i18n:check`

Expected: both exit 0.

- [x] **Step 6: Run the focused regression set one job at a time**

Before each heavy job run `free -h`; proceed only with at least ~1.5 GB available.

```bash
pnpm --filter @kaneo/api exec vp test run src/project-field --maxWorkers=1
pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts project-field --maxWorkers=1
pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts custom-field project-list --maxWorkers=1
pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts --maxWorkers=1 src/components/settings/project-fields src/components/settings/project-general/project-field* src/components/project-table src/hooks/mutations/project-field src/hooks/use-user-websocket-lifecycle.test.tsx src/lib/evict-workspace-cache.test.ts
```

Expected: all PASS. Do not replace these with the full web suite on this WSL machine.

- [x] **Step 7: Run type and static checks sequentially**

```bash
pnpm --filter @kaneo/api typecheck
pnpm --filter @kaneo/libs typecheck
pnpm --filter @kaneo/web typecheck
pnpm exec vp check $(git ls-files --modified --others --exclude-standard)
pnpm openapi:check
pnpm i18n:check
```

Expected: all exit 0. Run one command at a time; if the web typecheck hits the documented WSL memory ceiling, report that exact limitation rather than claiming it passed.

- [ ] **Step 8: Browser acceptance pass**

Using a local development database only:

1. Create text, long text, date, dropdown, multiselect, boolean, number, date-difference, date-add, and arithmetic fields in Workspace → Project fields.
2. Confirm another project and a newly created project expose those definitions/defaults.
3. Edit short fields inline in Projects → Fields table; edit long text on project General settings; confirm a second browser/session updates through realtime.
4. Exercise filters, two sorts, archived toggle, column hide/reorder/resize, pagination, formula recomputation, required-clear rejection, and read-only permissions.
5. Export CSV and inspect Vietnamese text, visible headers, current filtered rows, formula values, embedded newline/quote escaping, and formula-injection neutralization.
6. Confirm task details, task cards, task filters, task creation, and task custom-field settings are unchanged.

- [x] **Step 9: Final diff review**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Confirm no credentials/production data, no new required environment variable/dependency, no unrelated formatting, and no hard-coded discovery-field template.

- [x] **Step 10: Conditional final checkpoint**

If commits were authorized, make the final docs/generated-artifact commit; otherwise leave the verified worktree uncommitted and report changed files/tests.

```bash
git add apps/web/src/hooks/use-user-websocket.ts apps/web/src/hooks/use-user-websocket-lifecycle.test.tsx apps/web/src/lib/evict-workspace-cache.ts apps/web/src/lib/evict-workspace-cache.test.ts apps/docs/openapi.json apps/docs/core/functional/create-workspace-and-project.mdx i18n
git commit -m "docs: document project fields"
```

## Self-review record

- **Spec coverage:** Tasks 1–3 cover storage, types, formulas, defaults, values, permissions, and project lifecycle; Tasks 4–6 cover table query, filters/sort/access, CSV, and realtime; Tasks 7–11 cover typed client, settings, project values, dynamic table, inline edit, filter/sort/preferences/export; Task 12 covers cache eviction, OpenAPI/docs, regressions, and browser acceptance.
- **Step scan:** Setup is folded into the task that first needs it; every task has a red/green focused test cycle and an independently reviewable deliverable. Conditional commits preserve the repository rule not to commit without authorization.
- **Type consistency:** `ProjectFieldType`, `ProjectFieldFormula`, `ProjectFieldWithValue`, `TableFilter`, `TableSort`, query-key names, event names, and routes are defined once and referenced consistently by later tasks.
- **Review focus coverage:** concurrency → Task 2; malformed dynamic/legacy data → Task 4; CSV injection → Task 5; access/move/realtime → Tasks 3 and 6; stale preferences → Task 10.
- **Proportion:** The plan identifies exact interfaces/tests and leaves controller/component bodies to the implementer; only calendar arithmetic and SQL safety choices are prescribed where a reasonable alternative could violate the approved spec.
