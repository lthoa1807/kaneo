# Project custom fields and workspace project table — design spec

- **Status:** Approved
- **Date:** 2026-11-23
- **Branch:** `feature/project-custom-fields`
- **Area:** API, web, database migration, docs, OpenAPI
- **Implementation notes:** `docs/superpowers/notes/project-field-data-flow.md`
- **Supersedes:** `2026-11-21-workspace-custom-fields-design.md`. This document
  incorporates the retained storage, lifecycle, and permission decisions and
  adds formula fields, the aggregate table, inline editing, and export. Use
  this document as the implementation source of truth.

## 1. Intent

A team currently tracks software delivery projects in a spreadsheet. The
field list supplied during discovery illustrates the kinds of data they may
track; it is not a schema or preset that Kaneo must install. In production,
each workspace admin defines the fields, types, options, and formulas that
their workspace actually needs.

The working surface is an **aggregate table**: one row per project, one
column per configured field, with filtering, sorting, comparison, and CSV
export. Short values are edited inline, spreadsheet-style. Long text is
edited on the project page.

This is not a task custom-field feature. Task custom fields keep working
exactly as they do today.

## 2. Decisions already made with the user

1. Project fields are defined once per workspace; every project in the
   workspace has them.
2. The aggregate table lives on the existing workspace Projects page as a
   view beside the current project overview. No new sidebar entry and no new
   grid view are required.
3. Reference columns (customer, staff, province, …) are fixed option lists
   managed by an admin, not free text and not new domain entities.
4. Some columns support formulas derived from other fields, so changing a
   date updates the derived column.
5. Values are stored dynamically. Adding or removing a field never changes
   the database schema.
6. The discovery list is not shipped as a template. A new workspace starts
   with no project-field definitions; admins configure fields manually.
7. CSV is the only export format in v1. Native `.xlsx` is a later feature.

## 3. Baseline in the codebase

- `apps/api/src/custom-field/` implements **task** custom fields: definitions
  per project, values per task, validation, defaults, option lifecycle,
  reorder, filters.
- `apps/web/src/components/project/custom-fields/` and
  `dashboard/settings/projects/$projectId/custom-fields.tsx` are the task
  field UI.
- `apps/web/.../dashboard/workspace/$workspaceId/projects.tsx` currently
  renders one reorderable project overview using the shared `Table`
  primitives. It has no grid/list toggle on this branch.
- `apps/api/src/project/controllers/get-projects.ts` lists projects for a
  workspace with `projectAccessCondition` and aggregated task statistics.
- `apps/web` already depends on `@tanstack/react-virtual` and `file-saver`.
- Task filters already have a field/operator/value model worth copying in
  shape, not in code.

## 4. Goals

1. An owner/admin defines project fields once in workspace settings:
   name, type, required, default, options, position, and optional formula.
2. Every project, including projects created later, has those fields.
3. A project table shows all projects with those fields as columns, with
   per-field filters, multi-key sorting, pagination, and configurable
   visible columns.
4. Short field types are editable inline in the table and saved immediately.
5. Formula columns recompute from their source fields on read.
6. The table exports to a spreadsheet file that respects the current
   filters, sort, and visible columns.
7. Task custom fields, boards, task filters, and the create-task modal are
   untouched.
8. The feature works on a single instance with no Redis.

## 5. Non-goals (v1)

- Nesting a formula inside another formula, or any expression language.
- Formula columns that are sortable or filterable.
- Dependent dropdowns (province → district cascade).
- Per-project opt-out or per-project overrides of a workspace field.
- Per-project custom field sets; definitions stay workspace-wide.
- Row creation from the table; it lists projects that already exist.
- Importing values or field definitions from Excel/CSV.
- A built-in field template or hard-coded delivery field names.
- Native `.xlsx` export; v1 exports UTF-8 CSV that Excel can open.
- Password, credential, or encrypted-secret fields.
- Mobile project-field UI and MCP tools.
- Storing file attachments in a field.

## 6. Anti-goals

- Do not reuse `custom_field_value` for project values.
- Do not add one table column per tracked field.
- Do not let `project:update` change a definition shared by all projects.
- Do not evaluate formulas as JavaScript source.
- Do not return field values for projects the caller cannot access.
- Do not log project-field values.
- Do not load every project and value into memory to sort or filter.
- Do not encode the discovery spreadsheet's field names or count in product
  code, migrations, seed data, or tests.

## 7. Approaches considered

### A. Workspace definitions + project value rows + derived formulas (chosen)

- `workspace_custom_field_definition` holds each field once per workspace.
- `project_custom_field_value` holds `(project_id, field_id, value)`.
- Formula fields are computed on read and never stored.
- The table endpoint queries projects and joins values for the current page.

Pros: dynamic at the data level, no migration per field; filters and sorts
push down to SQL; task fields are untouched; one additive migration.

Cons: no per-field database type or index; application-level validation;
a join per filtered or sorted field.

### B. A JSONB `metadata` column on `project` (rejected)

Faster to start, but filtering and sorting across arbitrary keys needs JSONB
expression indexes and still scans badly; there is no referential integrity
for options; validation is duplicated; and it contradicts the existing
spec. Not worth the shortcut.

### C. A first-class `contract`/`delivery` entity (rejected)

Cleaner domain modelling — these columns read like contract data — but it
introduces a new object with its own permissions, routes, UI, mobile, MCP,
and lifecycle. The user asked for project custom fields, and v1 should not
carry two project-like objects.

**Decision: A.**

Sub-decisions inside A:

- **Storage:** one row per value, not a wide JSONB blob per project. Rows
  filter and sort with ordinary SQL and can be constrained per field.
- **Formula:** a small set of declarative operations, not an expression
  parser. A formula may reference only non-formula fields, which removes
  cycles and makes evaluation a single pass in field order.
- **Table placement:** a second view on the Projects page beside the current
  project overview, reusing its project query shape.

## 8. Data model and migration

One additive migration. No existing table changes.

### 8.1 `workspace_custom_field_definition`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | `createId()` |
| `workspace_id` | text NOT NULL | FK workspace, cascade |
| `name` | text NOT NULL | |
| `type` | text NOT NULL | `text`, `long_text`, `number`, `date`, `dropdown`, `boolean`, `multiselect`, `formula` |
| `required` | boolean NOT NULL default false | |
| `default_value` | text NULL | |
| `options` | jsonb NULL | dropdown / multiselect |
| `hidden_options` | jsonb NOT NULL default `[]` | |
| `formula` | jsonb NULL | required when `type = formula`, null otherwise |
| `position` | integer NOT NULL default 0 | workspace order |
| `created_at`, `updated_at` | timestamp NOT NULL | repo conventions |

Index: `(workspace_id)`. Unique: `(workspace_id, name)` to stop two columns
with the same header in the table and export.

### 8.2 `project_custom_field_value`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | |
| `project_id` | text NOT NULL | FK project, cascade |
| `field_id` | text NOT NULL | FK definition, cascade |
| `value` | text NULL | text, JSON array for multiselect, ISO date for date |
| `created_at`, `updated_at` | timestamp NOT NULL | |

Indexes: `(project_id)`, `(field_id, project_id)`, unique
`(project_id, field_id)`. The composite field-first index supports table
filters without adding an index per dynamic field.

### 8.3 Relations

Workspace → definitions; definition → workspace and values; project →
values; value → project and definition. Archived projects keep their
values.

## 9. Field types and formula model

### 9.1 Types

| Type | Stored value | Inline in table | Notes |
| --- | --- | --- | --- |
| `text` | string | yes | single-line text |
| `long_text` | string | no | textarea on project page; hidden in table by default |
| `number` | numeric string | yes | validated as finite number |
| `date` | `YYYY-MM-DD` | yes, date picker | timezone-free |
| `dropdown` | one option | yes, select | option must exist and not be hidden |
| `multiselect` | JSON array string | yes, multi-select | |
| `boolean` | `"true"` / `"false"` | yes, checkbox | |
| `formula` | not stored | read-only | derived |

### 9.2 Formula

```ts
type Formula =
  | { kind: "date_diff"; fromFieldId: string; toFieldId: string; unit: "day" | "month" }
  | { kind: "date_add"; fromFieldId: string; amount: number; unit: "day" | "month" }
  | { kind: "number"; op: "add" | "subtract" | "multiply" | "divide"; leftFieldId: string; rightFieldId: string };
```

Rules:

- Source fields must belong to the same workspace, must not be `formula`,
  and must have a compatible type (`date` for date operations, `number` for
  arithmetic).
- Formula fields cannot be required and cannot have a default or options.
- `date_add.amount` must be a finite integer; fractional calendar days/months
  are rejected.
- The API rejects a formula that violates those rules at create/update time
  and re-checks on read only for defensive purposes.
- Formula results use canonical, non-localized strings: `date_diff` returns
  a signed numeric string without a unit label, `date_add` returns
  `YYYY-MM-DD`, and `number` returns a numeric string rounded to two decimal
  places. The definition carries the unit; the web formats it for display.
  CSV keeps the canonical value so it remains sortable in Excel. Missing
  source values produce `null`.
- `date_diff` in days uses signed whole calendar days. In months it uses
  signed complete calendar months; its result is `toFieldId - fromFieldId`.
  Number formulas evaluate `leftFieldId op rightFieldId`. `date_add` uses
  calendar arithmetic and clamps to the last valid day of the target month
  (for example, January 31
  plus one month becomes February 28 or 29). Division by zero produces
  `null`.
- Evaluation lives in `apps/api/src/project-field/formula.ts`, a pure
  function over `Map<fieldId, string | null>`, with unit tests.
- The web renders formula columns read-only. Sorting and filtering on
  formula columns are out of scope for v1.

### 9.3 Definition lifecycle

- A field type is immutable after creation except for
  `dropdown` ↔ `multiselect`. That conversion follows the existing task-field
  rules and rewrites compatible stored values; all other type changes require
  creating a new field.
- A formula's operation and sources may be edited while it remains a
  `formula` field.
- Deleting a source field returns 409 while a formula references it. The
  response lists dependent formula ids and names; the admin must update or
  delete them first.
- The usage response includes `dependentFormulaCount` and
  `dependentFormulas` in addition to project/value counts. This avoids
  dangling JSON field-id references.

### 9.4 Defaults and project lifecycle

- Creating a definition assigns the next workspace position. A non-empty
  default is inserted for existing projects in bounded chunks. Required
  fields must have a valid non-empty default so existing projects never
  become invalid.
- Project creation, including projects created by the existing import path,
  seeds non-empty defaults in the same transaction as the project row.
- Turning `required` on requires a valid default and fills missing/empty
  values. Changing a default does not overwrite values already entered.
- Choice option removal/retirement and dropdown ↔ multiselect conversion
  follow the existing task custom-field rules, including hidden options and
  conversion of compatible stored values.
- Deleting a definition cascades its values after the dependent-formula check.
- Moving a project to another workspace deletes source-workspace project
  field values and seeds destination defaults in the move transaction. Task
  custom fields remain attached to the project.
- Archiving a project preserves values; deleting a project or workspace
  cascades them.

## 10. API

New module `apps/api/src/project-field/`. Routes are registered next to the
existing modules in `apps/api/src/index.ts`. Do not add these routes to
`custom-field/`.

### 10.1 Definitions

| Endpoint | Permission | Behaviour |
| --- | --- | --- |
| `GET /project-field/workspace/{workspaceId}` | `workspace:read` | Definitions ordered by position |
| `POST /project-field/` | `workspace:manage_settings` | Body `{ workspaceId, name, type, required?, defaultValue?, options?, formula? }` |
| `PUT /project-field/{id}` | `workspace:manage_settings` | Partial definition update |
| `DELETE /project-field/{id}` | `workspace:manage_settings` | Cascades values |
| `PUT /project-field/reorder/{workspaceId}` | `workspace:manage_settings` | `{ fields: [{ id, position }] }` |
| `GET /project-field/{id}/usage` | `workspace:manage_settings` | Project/value counts and dependent formulas |

### 10.2 Project values

| Endpoint | Permission | Behaviour |
| --- | --- | --- |
| `GET /project-field/project/{projectId}` | `project:read` | Definitions + this project's values + computed formulas |
| `PUT /project-field/project/{projectId}/value` | `project:update` | `{ fieldId, value: string \| null }` upsert/clear; rejects formula writes |

Value validation mirrors task field values: type checks, dropdown option
must be active, multiselect is a JSON array of active options, required
fields cannot be cleared, and `null`, blank text, or `[]` clears an optional
field by deleting its sparse value row. `long_text` follows text validation but is not inline-editable in the
aggregate table.

### 10.3 Table

```
GET /project-field/table/{workspaceId}
  filters=<URL-encoded JSON array>  AND semantics
  sort=<URL-encoded JSON array>     "name", "createdAt", "position", or field ids
  limit=50                          default 50, max 200
  offset=0
  includeArchived=false
```

Operators by type: `eq`, `neq`, `contains`, `startsWith` (`text` and
`long_text`), `gt`, `gte`, `lt`, `lte` (number/date), `empty`, `notEmpty`
(all), `in` (a string array for dropdown/multiselect).

```ts
type TableFilter = {
  fieldId: string;
  operator: string;
  value?: string | string[]; // arrays are used by `in`
};
type TableSort = {
  key: "name" | "createdAt" | "position" | string;
  direction: "asc" | "desc";
};
```

The API parses and validates both JSON arrays with Zod, caps filters at 20
and sort keys at two, and returns 400 for an unsupported operator or any
formula filter/sort. JSON avoids delimiter ambiguity in user-entered values.

Response:

```ts
{
  definitions: ProjectFieldDefinition[];   // ordered, formulas included
  projects: Array<{
    id: string; name: string; slug: string; icon: string | null;
    archivedAt: string | null;
    createdAt: string;
    statistics: { completionPercentage: number; totalTasks: number; dueDate: string | null };
    values: Record<string, string | null>;   // fieldId -> stored value
    formulas: Record<string, string | null>; // fieldId -> canonical derived value
  }>;
  total: number;
}
```

Project visibility always applies `projectAccessCondition(userId, ...)`.
Definitions are workspace-scoped; a value row whose definition belongs to
another workspace is ignored.

### 10.4 Export

```
GET /project-field/table/{workspaceId}/export
  same filter/sort params
  columns=<fieldId,fieldId,...>    optional; absent means all definitions
```

- Returns `text/csv; charset=utf-8` with a UTF-8 BOM so Excel opens the
  Vietnamese diacritics correctly. Fields are quoted; embedded quotes are
  doubled.
- Header row: `Project` followed by the selected field names in definition
  order.
- The web always sends its currently visible field ids. Direct API callers
  that omit `columns` receive every definition.
- Formula columns are included using canonical values. Native `.xlsx` is
  explicitly deferred until after v1.
- CSV neutralizes spreadsheet-formula control prefixes in user-authored
  headers and text-like cells; valid negative number/formula cells remain
  numeric.
- Streaming is not required at v1 scale; a hard cap of 20,000 rows returns
  400 with a clear message rather than exhausting memory.

## 11. Query and performance rules

- **Page listing:** one query for the project page (existing project list
  shape), one query for values `WHERE project_id IN (...)` restricted to the
  workspace's definition ids, then formulas computed in memory from those
  values.
- **Filtering:** each filter adds an `EXISTS` subquery against
  `project_custom_field_value` with its own `field_id`, never a join that
  duplicates project rows.
- **Sorting by a field:** a `LEFT JOIN` on the single value row for that
  field. Multiple field sorts are allowed but the API caps them at two.
- **Sorting by project columns:** `name`, `createdAt`, and `position` are
  first-class.
- **Counting:** `total` uses the same filters and access condition;
  statistics stay as they are today (aggregated in SQL).
- **Archived projects:** excluded unless `includeArchived=true`; the table
  has a toggle.

## 12. Web UI

### 12.1 Workspace settings

New page `dashboard/settings/workspace/project-fields`, linked from the
workspace settings nav.

- Lists fields with drag-to-reorder, add, edit, delete.
- The field dialog covers name, type, required, default, options, and
  formula. Formula mode swaps the value inputs for source-field, operation,
  amount, and unit selects. Only compatible fields are offered.
- Delete confirmation shows project count and non-empty value count.
- Dropdown and multiselect options are entered manually in the field dialog;
  no customer, product, location, or other option list is preloaded.

### 12.2 Projects page: table view

`projects.tsx` gains a two-option view selector:

- **Overview:** the current reorderable project list, unchanged.
- **Fields table:** the new aggregate table described below.

- Sticky first column (project name, link to the project) and sticky header.
- Dynamic columns from definitions, in definition order.
- Column control: show/hide, reorder, width. Persisted per user per
  workspace in `localStorage` under
  `kaneo:project-table:<userId>:<workspaceId>`.
- Inline editing for `text` (single-line), `number`, `date`, `dropdown`,
  `multiselect`, `boolean`. Click a cell to edit, `Enter`/blur saves, `Esc`
  cancels. Optimistic update with rollback and a toast on failure.
- `formula` cells are read-only. `long_text` cells show a truncated preview
  and open the project page for editing.
- Cells are disabled for users without `project:update`; values remain
  visible per the permission rules.
- Required cells show a marker and cannot be cleared.
- Filter bar: add a filter chip per field, operator list depends on type,
  values for dropdown come from active options. Filters, sort, and page
  live in the URL search params so the view can be shared and reloaded.
- Rows are virtualized with `@tanstack/react-virtual`.
- Empty state when the workspace has no definitions, linking to workspace
  settings.
- Pagination footer using the existing table pagination patterns.

### 12.3 Project page

A "Project fields" section on project general settings renders the same
controls for all types, including a textarea for `long_text`, for users with
`project:update`. It states that fields are defined at workspace level;
there is no edit-definition link here.

### 12.4 Cache keys

- `["project-fields", workspaceId]` — definitions
- `["project-field-values", projectId]` — one project
- `["project-field-table", workspaceId, searchParams]` — table page

Mutations invalidate the matching keys; inline edits update the table cache
optimistically. Add all three to
`apps/web/src/lib/evict-workspace-cache.ts`.

## 13. Realtime

Publish through `publishEvent()`:

- `project-field.definition_changed` — `{ workspaceId, fieldId?, action }`;
  reorder omits `fieldId` because it changes the whole ordered set
- `project-field.value_changed` — `{ workspaceId, projectId, fieldId? }`;
  project move/default reseed may omit `fieldId` when several values changed

The WebSocket handler invalidates the definitions and table keys for the
workspace. Definition changes also invalidate cached project-value queries
for known projects in that workspace because defaults, required-fill,
choice conversion, or deletion can rewrite values; a value event invalidates
known project-value keys for that workspace. Wire messages carry only
`workspaceId` plus whether definitions or values changed; they omit
`projectId`, `fieldId`, definitions, and values so restricted project ids are
not exposed through user-scoped sockets/API keys. Single-instance deployments
without Redis keep working.

## 14. Security and permissions

| Action | Permission |
| --- | --- |
| Read definitions | `workspace:read` |
| Create/update/delete/reorder definitions | `workspace:manage_settings` |
| Read values for a project | `project:read` |
| Set or clear a value | `project:update` |
| Read the table | `project:read`, scoped by project access |
| Export | `project:read`, scoped by project access |

- Definition updates resolve the owning workspace from the row, never from
  the body alone.
- Project value writes resolve the workspace through the project and reject
  a field from another workspace with 404, not 403.
- The table never returns projects outside `projectAccessCondition`.
- Project-field values are never logged or included in realtime payloads.
- The UI is never the authorization boundary.

## 15. Dynamic configuration

- A new workspace starts with zero project fields.
- Admins create only the definitions they need, in any supported type. The
  application does not assume a minimum or maximum field count.
- The spreadsheet column list supplied during discovery is requirement
  input only. Its names, order, duplicate names, and tentative formulas are
  not migrations, seed data, defaults, or acceptance criteria.
- Dropdown/multiselect lists start with no product-provided options. The
  admin supplies valid options when creating the field. Creation retains the
  existing task-field validation rule: at least one dropdown option and at
  least two multiselect options.
- Passwords and credentials are outside this feature and should stay in a
  dedicated secret manager.

## 16. Migration and compatibility

1. One migration adds two tables and one enum-free text column set; no
   existing table or row changes.
2. Task custom fields keep their tables, endpoints, and UI.
3. No new environment variable.
4. No Redis dependency, no Helm or Docker change.
5. OpenAPI is regenerated with `pnpm openapi:check:fix` and
   `apps/docs/openapi.json` is committed.
6. `@kaneo/libs` types are added for the new endpoints.

## 17. Test plan

### API integration

- Owner/admin CRUD and reorder definitions; member and non-admin project
  manager get 403.
- Definitions appear on existing projects and on a project created later.
- Default backfills existing projects in the create transaction; project
  creation seeds defaults.
- Required field rejects clear; optional clears; types validated per field.
- Hidden options: existing value kept, new pick rejected.
- Formula: valid source validation, date_diff signed result, date_add month
  rollover, missing source yields empty, formula referencing a formula is
  rejected.
- A source field referenced by a formula cannot be deleted; usage reports
  the dependent formulas. Type changes follow the lifecycle rules in §9.3.
- Table: pagination, filter per operator and type, sort by project column
  and field, archived toggle, total count, and `projectAccessCondition`
  respected.
- Export: BOM present, quoting correct, respects filters/columns, uses
  canonical formula values, and enforces the row cap.
- Definition in workspace A cannot be read or written through a project in
  workspace B (404).
- Deleting a definition cascades values; deleting a workspace cascades both.
- Moving a project to another workspace removes source values and seeds
  destination defaults.
- Task custom-field endpoints reject a project field id.
- Existing task custom-field tests pass unchanged.

### Web

- Table view renders definitions, hides long text by default, persists
  column config, and shares filters through the URL.
- Inline edit saves each type; failure rolls back; `Esc` cancels.
- Formula cells are read-only; long text is truncated and edited on the
  project page.
- Read-only rendering without `project:update`.
- Task detail, board, filters, and create-task modal never show project
  fields.
- Realtime events invalidate definitions/table/values only.

### Repo checks

- `pnpm --filter @kaneo/api test`
- Affected web tests only (WSL memory constraint)
- `pnpm typecheck`
- `pnpm openapi:check:fix`

## 18. Acceptance criteria

- [ ] An admin can define any number of project fields in workspace settings
      using every supported type, without a schema migration.
- [ ] The Projects page table shows every project with those columns on one
      screen, filterable and sortable, with the configuration persisted.
- [ ] A short cell can be edited inline and the value survives a reload.
- [ ] Changing a source date or number updates a configured formula column
      without storing or separately saving the result.
- [ ] Export produces an Excel-openable file with correct Vietnamese text,
      the visible columns, and the current filters.
- [ ] Adding or removing a field requires no migration and no restart.
- [ ] Users without `project:update` see the table read-only.
- [ ] Users cannot see projects or values they lack access to.
- [ ] Task custom fields behave exactly as before.
- [ ] Typecheck, API tests, affected web tests, and OpenAPI check pass.

## 19. Risks

| Risk | Mitigation |
| --- | --- |
| EAV filtering gets slow with many rows | Filters use indexed `field_id` plus `EXISTS`; sort joins one field; page size capped; revisit with a covering index on `(field_id, project_id)` if measurements demand |
| Wide table is unusable on small screens | Virtualized rows, sticky first column, column show/hide, horizontal scroll; mobile not targeted in v1 |
| Users confuse project fields with task fields | Separate settings page and API module; explicit copy |
| Formula surprises (negative, month rollover) | Pure function, unit tests, documented rounding, empty when a source is missing |
| Inline edit races between users | Optimistic update plus realtime invalidation; last write wins, same as task fields |
| Duplicate field names break CSV headers | Unique `(workspace_id, name)` |
| Formula source is deleted or retyped | Reject the mutation while dependent formulas exist; include them in usage response |

## 20. Implementation order

1. Schema, relations, migration.
2. Shared validation extraction from `custom-field` where it fits; the
   project-field definition controllers and routes.
3. Project value read/write, formula module, project creation and move
   seeding.
4. Table endpoint, filters, sort, pagination, access scoping.
5. Export endpoint.
6. Web: workspace settings page, definition dialog with formula mode,
   fetchers, hooks, query keys.
7. Web: table view, inline editing, filter bar, column config, URL state.
8. Project page values section.
9. Realtime events and invalidation.
10. OpenAPI, docs, `@kaneo/libs` types.
11. Integration tests and acceptance checks.

## 21. Decisions resolved during review

1. The discovery spreadsheet is illustrative. The product ships no preset
   definitions and does not require the admin to recreate every sample
   column.
2. Tentative fields and business formulas from that sheet — including the
   repeated date, warranty, handover difference, data-entry checkbox, user,
   and password columns — are not part of this spec. The admin may model
   ordinary non-secret fields later using the supported types.
3. Export is UTF-8 CSV in v1. Native `.xlsx` is deferred.
4. Option lists contain no product-provided starter data and are configured
   manually by the workspace admin.
