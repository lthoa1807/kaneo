# Project fields: what changes, and what happens when a field is added

Developer notes for the project custom fields feature. Design lives in
`docs/superpowers/specs/2026-11-23-project-custom-fields-table-design.md`;
open work lives in `docs/superpowers/specs/2026-11-24-project-custom-fields-follow-ups.md`.

## Storage

Two new tables. No column is added to `project`, so an existing installation
carries no row for a field until someone sets a value.

| Table | Holds |
| --- | --- |
| `workspace_custom_field_definition` | Field per workspace: `name`, `type`, `required`, `default_value`, `options` (jsonb), `hidden_options` (jsonb), `formula` (jsonb), `position`. Unique on `(workspace_id, name)`. |
| `project_custom_field_value` | Sparse value per `(project, field)`: `value text`. Unique on `(project_id, field_id)`, foreign keys cascade on both sides. Indexed on `(project_id)` and `(field_id, project_id)`. |

Formula fields store nothing. Their value is computed on read by
`apps/api/src/project-field/formula.ts`.

## Adding a field

`POST /api/project-field` runs `apps/api/src/project-field/controllers/create-project-field.ts`
in one transaction:

1. `lockProjectOrdering(tx, workspaceId)` serializes concurrent creates so two
   people cannot produce the same `position`.
2. `normalizeProjectFieldDefinition` plus `assertValidProjectFieldDefinition`
   check the name, the type and the formula. A formula must resolve to fields in
   the same workspace and must not form a cycle.
3. `SELECT max(position)` then insert the definition at `max + 1`.
4. When the definition has a default value, `backfillProjectFieldDefault` inserts
   a value row for every project in the workspace, in chunks of 500, with
   `onConflictDoNothing`. When the field is also required,
   `fillEmptyProjectFieldValues` fills rows that are null, empty or `[]`.
5. After commit, `publish("project-field.definition_changed", { workspaceId })`.

Cost, in the order a reader cares about:

- One row in `workspace_custom_field_definition`.
- **Zero value rows when there is no default.** With a default, N rows, N being
  the number of projects in the workspace. This is the heaviest write in the
  feature: it happens inside the transaction that holds the ordering lock.
- No table rewrite, no lock on `project`.

## What each layer does with the new field

**Backend.** Definitions are served by `get-project-fields-by-workspace.ts` and
`get-project-fields-by-project.ts`. Mutations go through
`update-project-field.ts`, `delete-project-field.ts` (cascade removes values) and
`reorder-project-fields.ts` (single `PUT`, the whole ordered id list). Every
definition route requires `workspace: ["manage_settings"]`; value routes require
`project: ["update"]`; reads pass through `projectAccessCondition`. The access
middleware gained a `projectField` lookup that resolves a definition id to its
workspace and then still runs `assertProjectAccess`.

**Realtime.** `apps/api/src/ws/index.ts` maps the two events to
`PROJECT_FIELD_DEFINITIONS_CHANGED` and `PROJECT_FIELD_VALUES_CHANGED`. Only the
`workspaceId` travels on the wire, never a project id or a value, so a restricted
member learns nothing about a project it cannot read. Recipients are every
workspace member plus instance admins
(`project-field-recipients.ts`).

**Frontend.** `apps/web/src/hooks/use-user-websocket.ts` turns a definitions
event into an invalidation of `projectFieldKeys.definitions(ws)`,
`projectFieldKeys.tableAll(ws)` and `projectFieldKeys.valuesAll`. The new column
appears in the Fields table, in the filter and sort pickers, in workspace
settings and on the project General page without a reload.

## Reading a value

`PUT /api/project-field/value` (`set-project-field-value.ts`) locks the project
row with `FOR UPDATE` first, which keeps a concurrent project move and a value
write from interleaving. It then loads the definition scoped to that project's
workspace, normalizes the input with `validate-project-field-value.ts`, and
either deletes the row (value cleared, keeping the table sparse) or upserts it.
It publishes `project-field.value_changed`, and the client invalidates
`valuesAll` and `tableAll`.

## The Fields table

`GET /api/project-field/table/:workspaceId` (`table-query.ts`) makes three
queries: definitions, a count, and one page. The page selects from `project` and
`LEFT JOIN`s `project_custom_field_value` through an alias for each field that is
sorted, so unsorted fields cost nothing. Filters compile to SQL in
`table-filters.ts`. Ordering always ends with `(position, createdAt, id)` so
pagination stays deterministic when names repeat.

CSV export (`export-project-field-table.ts`) reads in a repeatable-read,
read-only transaction, caps at 20k rows and neutralizes formula injection while
keeping negative numbers numeric. `content-disposition` is exposed through CORS
so the browser keeps the server-chosen filename.

## Known costs

- A default value on a workspace with many projects is the most expensive
  operation here; it is N inserts under the ordering lock.
- Formula fields cannot be indexed, so filtering or sorting by one is computed
  per row and slows with project count.
- Deleting a definition cascades away every value. Workspace settings call
  `get-project-field-usage` first so the dialog can warn with a real number.

These three are recorded, not solved, in the follow-ups spec.
