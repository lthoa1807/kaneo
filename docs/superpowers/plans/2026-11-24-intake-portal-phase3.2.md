# Intake portal Phase 3.2 — turning intake on for a project

**Spec:** `docs/superpowers/specs/2026-11-24-intake-portal-design.md` §8 (data model, `project.intakeEnabled`), §9 (edge case "intakeEnabled toggled off").
**Predecessors:** `2026-11-24-intake-portal-phase3.md`, `2026-11-24-intake-portal-phase3.1.md`.

## Why this exists

`project.intakeEnabled` defaults to `false` and **nothing in the repository ever writes it**:

```
apps/api/src/database/schema.ts                      .default(false)
apps/api/src/intake/controllers/list-intake-projects  WHERE intake_enabled = true
apps/api/src/intake/controllers/create-intake-request if (!intakeEnabled) throw
```

Three read sites, zero write sites: no update route field, no project settings toggle, no seed. Every project therefore has `intake_enabled = false`, so `GET …/intake-projects` answers `[]` for everyone. A guest who has been given project access submits nothing, and the staff intake tab is empty on every real installation. Integration tests missed it because their fixtures set the column with raw SQL.

The spec defines the flag and its "toggled off" edge case but never says how a project is switched on. This phase adds that switch.

## Global constraints

- No migration: the column already exists.
- No new endpoint: `intakeEnabled` rides on the existing `PUT /project/{id}`, like `includeSubtasks`.
- Only `project:update` can change it (the existing middleware already requires it).
- Turning the flag off stops new requests but never touches existing ones (spec §9).
- All copy through i18n keys with `i18n/en-US.json` as the source.

## Task 1: The API accepts and returns the flag

**Files:** `apps/api/src/project/schema.ts`, `apps/api/src/project/controllers/update-project.ts`, `apps/api/src/project/index.ts`, `apps/api/src/project/response.ts`, `tests/api-integration/project-intake-flag.test.ts`

- [ ] **Step 1: Write the failing integration test.** New file `project-intake-flag.test.ts`: create a project through the API, assert `intakeEnabled` is `false` in the create/GET response; `PUT /project/{id}` with `intakeEnabled: true`; assert the response and a fresh `GET /project/{id}` both say `true`. Then flip it back with `false` and assert again.
- [ ] **Step 2: Declare the field on the response.** `projectSchema` gains `intakeEnabled: z.boolean()`. `toPublicProject` already passes every non-background column through, so no mapping change is needed.
- [ ] **Step 3: Accept it on update.** `updateProjectBody` gains `intakeEnabled: z.boolean().optional()`; the controller takes it as a trailing optional argument and spreads it into the update exactly like `includeSubtasks`; the route handler destructures and forwards it.
- [ ] **Step 4: Run the test.** `pnpm --filter @kaneo/api exec vp test run --config vitest.integration.config.ts ../../tests/api-integration/project-intake-flag.test.ts` — passes.
- [ ] **Step 5: Commit.** `feat(api): let a project turn intake on`

## Task 2: The project settings switch

**Files:** `apps/web/src/components/settings/project-general/{project-details-section.tsx,project-form-values.ts,use-project-autosave.ts}`, `apps/web/src/fetchers/project/update-project.ts`, `i18n/en-US.json`

The switch follows the `includeSubtasks` precedent, so it rides the existing autosave: one field in the form values, one dirty check, one payload key.

- [ ] **Step 1: Carry the value through the form.** `ProjectFormValues` and `NormalizedProjectValues` gain `intakeEnabled?: boolean`; `normalizeProjectValues` maps `data.intakeEnabled ?? false`; `getProjectFieldChanges` compares `(last?.intakeEnabled ?? false) !== (next.intakeEnabled ?? false)`.
- [ ] **Step 2: Send it.** `use-project-autosave.ts` seeds the form from `project.intakeEnabled ?? false`, includes it in the reset values and in the `updateProject` payload only when it changed, and lists it in the callback dependencies. `update-project.ts` forwards `intakeEnabled`.
- [ ] **Step 3: Render the row.** In `project-details-section.tsx`, a `SettingsFormRow` above "include subtasks": label `settings:projectGeneral.acceptIntake`, description `settings:projectGeneral.acceptIntakeHint`, `Switch` bound to the field, `disabled={!canEdit}`.
- [ ] **Step 4: Add the two keys** by editing `i18n/en-US.json` in place, then `pnpm i18n:check:fix && pnpm i18n:schema && pnpm i18n:check`.
- [ ] **Step 5: Commit.** `feat(web): enable intake from project settings`

## Task 3: Guest-facing copy

**Files:** `i18n/en-US.json`

- [ ] **Step 1: Stop calling a guest a team member.** `invitations:toast.acceptSuccess` and `auth:invitation.toast.acceptSuccess` currently read "Invitation accepted! Welcome to the team." A guest joins no team and reaches no board. Replace both with "Invitation accepted — you can start from the sidebar." so the wording is true for every role.
- [ ] **Step 2: Sync and commit.** `pnpm i18n:check:fix && pnpm i18n:schema && pnpm i18n:check`, then `fix(i18n): neutral invitation-accepted copy`.

## Verification

- Integration: `project-intake-flag.test.ts` as above.
- Web typecheck: `node …/tsc.js -p apps/web/tsconfig.app.json --noEmit` (alone).
- `pnpm openapi:check:fix` — `apps/docs/openapi.json` changes because the project schema gained a field.
- `pnpm exec vp check`, then Fork CI green on the pushed commit.
- Manual: project settings → **Accept guest requests** on → the guest's New-request picker lists the project → a request can be submitted; switch off → the picker is empty again and an existing request stays readable.

## Review focus

1. **The flag is independent of project access** — access grants visibility, the flag gates submission (spec §8). Do not make one imply the other.
2. **Off is not a delete** — turning intake off must leave existing requests, their activity and any attached tasks untouched.
3. **`includeSubtasks` behaviour stays identical** — the new field must not disturb its dirty tracking or its default.
