# Project custom fields — deferred follow-ups and open decisions

- **Status:** Deferred (not in the first PR)
- **Date:** 2026-11-24
- **Branch:** `feature/project-custom-fields`
- **Related:** `docs/superpowers/specs/2026-11-23-project-custom-fields-table-design.md`,
  `docs/superpowers/plans/2026-11-23-project-custom-fields.md`
- **Purpose:** keep the decisions and dead ends from the review discussion so
  the next spec does not re-derive them.

Everything below is intentionally **out of scope** for the current branch.
Nothing here blocks the first PR.

## 1. Activity and audit for project field changes

Today a field value change only publishes a realtime event
(`project-field.value_changed` → `PROJECT_FIELD_VALUES_CHANGED`). Nothing is
recorded, so nobody can answer "who set Received Date to 2026-11-23 and when".
Project rename and description changes also log nothing today, so this is not
a regression — it is a missing feature that matches the current spec.

Do **not** reuse the task `activity` table
(`apps/api/src/database/schema.ts:845`): `task_id` is `NOT NULL` with a FK to
`task`. A project has no task to attach to.

Smallest shape that would work: a separate `project_activity` table
(`id, project_id, user_id, field_id, old_value, new_value, created_at`) written
inside the existing `db.transaction` in
`apps/api/src/project-field/controllers/set-project-field-value.ts`, and a
settings page listing it. Deferred by the user to a later spec.

## 2. "My projects" / "assigned projects" screen

Not in any spec. What exists today:

- `apps/web/src/components/home/home-projects.tsx` shows at most 3 workspace
  projects and links to the workspace.
- `apps/web/src/routes/.../workspace/$workspaceId/my-tasks.tsx` is assigned
  **tasks**, not projects.
- `GET /api/project` requires `?workspaceId=`, so there is no cross-workspace
  project list.
- `workspace_member_project` (`id, workspace_id, user_id, project_id,
  created_at`) is only a permission grant — no role, no "lead" meaning.
- The `project` table has **no** owner / lead / creator column.

Decisions needed before building: what "phụ trách" means (access grant vs.
named owner), whether the list is cross-workspace, and how
`projectAccessCondition` (`apps/api/src/utils/workspace-access-middleware.ts`)
applies outside a workspace context.

## 3. Entering field values while creating a project

Two paths exist today: inline editing in the Fields table, and Project
settings → General (`ProjectFieldValuesSection`, needs `project:update`).
Defaults are seeded by `seedProjectFieldDefaults` inside the create
transaction (`apps/api/src/project-field/project-field-defaults.ts:59`).

Options discussed, cheapest first:

- **B1 (~5 lines, no API change).** After creating a project, if the workspace
  has any field, navigate to
  `dashboard/settings/projects/$projectId/general` instead of the board
  (`apps/web/src/components/shared/modals/create-project-modal.tsx:80`).
  Filling fields still happens in settings, but right after creation.
- **B2 (~25 lines, no API change).** B1 plus a read-only preview of the field
  chips (name + default) in the modal with a "edit after creating" link.
- **B3 (~150–200 lines).** Real entry in the modal, porting the task pattern.

### Why B3 is not a copy-paste of task custom fields

The task pattern (`apps/api/src/task/controllers/create-task.ts`): one
`POST /task` carrying `customFields: [{fieldId, value}]`, dedupe by `fieldId`,
validate with `assertRequiredCustomFields`
(`apps/api/src/task/validate-task-fields.ts:126`), and write task + values in
one transaction. The web modal gates required fields before sending
(`findMissingRequiredFields` + focus on the first missing chip,
`apps/web/src/components/shared/modals/create-task-modal.tsx:542`).

Four things do not carry over to projects:

1. **Interaction with defaults.** Tasks do not seed defaults at create; the
   project path already seeds every field that has one. A client-supplied value
   must either skip the seed for that field or upsert over it — a change inside
   `insertProject` / `seedProjectFieldDefaults`.
2. **Types do not match.** `CustomFieldChip` takes `CustomFieldDefinition`
   (task types only, no `long_text` / `formula`, no `workspaceId`); project
   fields are `ProjectFieldDefinition` (`apps/web/src/components/project-fields/types.ts`)
   and include read-only formula fields that must not appear in a create form.
3. **Definitions are workspace-scoped**, so validation must filter by the
   body's `workspaceId`, and other projects in the workspace share them.
4. **`required` is not enforced at create time** (see §4), so B3 would drag
   in that work too.

### Precedent worth remembering

Quick-create paths for tasks do not send custom fields
(`apps/web/src/components/task/task-subtasks.tsx:247`). If a required task field
has no default, those paths get a 400 from the API and only show a toast. Kaneo
already accepts "one path enforces required, the fast paths fail" for tasks.

## 4. `required` is half enforced for project fields

What is enforced today:

- Saving an empty value for a required field is rejected with 400 by
  `normalizeProjectFieldValue`
  (`apps/api/src/project-field/validate-project-field-value.ts:122`), so the UI
  cannot clear one either (`project-field-cell.tsx` mirrors the check).
  Integration test: "rejects invalid values, required clears, and hidden picks".

What is not enforced:

- **Nothing fills a required field at creation time.** `POST /project`, Planka
  import and `move-project` only seed fields that carry a default
  (`seedProjectFieldDefaults`), so a project can exist with a required field
  empty. The only visible cue is the asterisk in the table header.
- A project that already sits in that state keeps it until someone opens the
  field and sets a value; any other field on that project still saves fine.

Closing the gap means, together:

- enforce it in **every** create path: `POST /project`, Planka import,
  `move-project`, API keys, MCP;
- add the modal gate from B3 if the value is meant to be entered at create time;
- decide whether an existing project with an empty required value should be
  blocked from anything else.

Decide soft vs. hard before writing any of it.

## 5. Sorting by due date in the Fields table

Sorting by `dueDate` was **removed** from the Fields view (`BASE_SORTS` in
`project-table-sort-control.tsx`, `validSort` in `project-table-search.ts`).
The column still renders. Reason: due date is `min(task.due_date)` computed in
`apps/api/src/project/controllers/get-project-statistics.ts`, not a `project`
column, so `buildOrdering` in `apps/api/src/project-field/table-query.ts`
cannot sort it without a correlated subquery.

If it comes back, sort server-side in `buildOrdering` with a correlated
subquery over `task` (index `task_projectId_idx` already supports it). Old
saved links (`?sort=[{"key":"dueDate"}]`) are now silently dropped by
`validSort` instead of producing a 400, so no cleanup is needed.

## 6. Discoverability of the Fields view (shipped, one open point)

Shipped on this branch: the view switcher shows `Fields (2)` with a count, an
accent dot, an accent text color and a tooltip
(`apps/web/src/components/project-table/projects-view-switch.tsx`), plus an
accent band on the custom field column headers and a faint tint on their cells.

Open point: the accent uses theme tokens (`--primary`), which are **neutral**
in the default palette, so with `data-palette` unset the accent reads as grey.
If a real color is wanted regardless of palette, switch those classes to a
fixed accent (e.g. `--chart-1`) — two short edits, no logic change.

## 7. Review findings deferred from this branch

- Test the `setProjectFieldValue` branches directly: clearing a value, a
  foreign-workspace `fieldId` (404), and the realtime payload on each branch.
  The clear branch already had a real bug in this branch (it published
  `projectWorkspaceId` instead of `workspaceId`, so WebSocket clients ignored
  the event); the integration test now covers that one case.
- Revisit `fillEmptyProjectFieldValues` (`project-field-defaults.ts:36`): it runs
  on every save of a required field that has a default, rewriting all empty
  values in the workspace. Cheap today; worth changing if a workspace ever has
  thousands of projects.
- Checked, no action: the placeholder `statistics` object in
  `table-query.ts:262` was suspected to be dead. It is not —
  `getProjectStatisticsForIds` only returns projects that have tasks, so the
  `?? project.statistics` fallback in `get-project-field-table.ts:95` is what
  gives a project with zero tasks its 0% / no-due-date row. Leave it.

## 8. Column visibility and width preferences

Per-user and client-side only (`localStorage`, see
`apps/web/src/components/project-table/project-table-preferences.ts`). Other
members of the workspace see the default columns. Server-side preferences are
not planned; revisit only if people ask to sync columns across devices.
