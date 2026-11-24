# Intake portal Phase 3.1 — the guest invitation entry

**Spec:** `docs/superpowers/specs/2026-11-24-intake-portal-design.md` §8 ("Inviting guests"), §12 MVP item 6.
**Predecessor:** `docs/superpowers/plans/2026-11-24-intake-portal-phase3.md`, whose scope table wrongly claimed the existing member modal already offered the `guest` role.

## Why this exists

Phase 3 shipped everything about guests except the way to create one. `invite-team-member-modal.tsx` hardcodes `role: "member"` and the members-table role `Select` filters `guest` out of its options (`guest` is in `DEFAULT_ROLE_NAMES`, which is excluded from the custom-role tail). The API has accepted guest invitations since Phase 2 (`resolveProjectAccessRequest` rejects `all` access for a guest role), so the only missing piece is the entry that posts `role: "guest"` with `projectAccess: "selected"`.

Until this ships, a guest can only be created by editing `workspace_member.role` in the database.

## Global constraints

- Guest invitations are **always** `projectAccess: "selected"` with at least one project. No code path may send `all` for a guest; the API rejects it with 400 as a backstop.
- The member invitation keeps its current behaviour, including the `all` default for a full-access inviter.
- No new API route, no database change.
- All copy through i18n keys with `i18n/en-US.json` as the source.
- `useInviteWorkspaceUser` may accept `role: "guest"`; the server validates role names against the seeded workspace roles.

## Design decision

Add a `mode` prop to the existing modal instead of a second component. The two dialogs differ only in the role sent, the default project access, the disabled "all projects" option and the title; duplicating ~140 lines of form, error handling and invitation-link display would drift. The spec's "separate entry, member modal stays untouched" is about the *entry point*, which this keeps: a separate button, a separate dialog instance, and member mode unchanged.

## Task 1: Guest mode in the invitation modal

**Files:** `apps/web/src/components/team/invite-team-member-modal.tsx`, `apps/web/src/hooks/mutations/workspace-user/use-invite-workspace-user.ts`, `apps/web/src/components/team/invite-team-member-modal.test.tsx`

- [ ] **Step 1: Write the failing test.** Extend `invite-team-member-modal.test.tsx` with a `guest invitations` block:
  - `mode="guest"` renders the "all projects" radio as `aria-disabled="true"` and the "selected projects" radio as `aria-checked="true"`.
  - submitting without a project shows `team:projectAccess.selectAtLeastOne` and does not call `inviteMember`.
  - after checking one project, submitting calls `inviteMember` with `role: "guest"`, `projectAccess: "selected"` and that project's id.

  Run: `pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts invite-team-member-modal` — expect the three new tests to fail.

- [ ] **Step 2: Widen the hook's role union.** In `use-invite-workspace-user.ts`: `role: "admin" | "member" | "owner" | "guest"`. The value is passed straight to `authClient.organization.inviteMember`.

- [ ] **Step 3: Add `mode` to the modal.** `Props` gains `mode?: "member" | "guest"`. Then:
  - `const isGuest = mode === "guest";`
  - default access: `chosenAccess ?? (isGuest || inviterLimited ? SELECTED_PROJECTS_ACCESS : ALL_PROJECTS_ACCESS)`
  - `allowAll={!isGuest && !inviterLimited}`
  - invitation payload: `role: isGuest ? "guest" : "member"`
  - dialog title: `t(isGuest ? "team:inviteGuest.title" : "team:inviteModal.title")`
  - keep the `canInvite` guard and the invitation-link step unchanged.

- [ ] **Step 4: Re-run the test file.** All cases pass, including the four existing project-access cases.

- [ ] **Step 5: Commit.** `feat(web): invite guests with selected project access`

## Task 2: The entry point and its copy

**Files:** `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/members.tsx`, `i18n/en-US.json`

- [ ] **Step 1: Add the second button.** Next to "Invite member", render "Invite guest" (`UserPlus`, `variant="outline"`, `size="xs"`) behind the same `canInvite` gate, opening a second `<InviteTeamMemberModal mode="guest" />` with its own open state.

- [ ] **Step 2: Add the two keys** by editing `i18n/en-US.json` in place (tab-indented, never re-dumped):
  - `team:members.inviteGuest` — "Invite guest"
  - `team:inviteGuest.title` — "Invite a guest"

- [ ] **Step 3: Sync the schema and check.** `pnpm i18n:check:fix && pnpm i18n:schema && pnpm i18n:check`.

- [ ] **Step 4: Commit.** `feat(web): add the invite-guest entry to workspace members`

## Verification

- `pnpm --filter @kaneo/web exec vp test run --config vitest.config.ts invite-team-member-modal` — the modal suite, including the new guest cases.
- `node …/tsc.js -p apps/web/tsconfig.app.json --noEmit` — alone (WSL memory).
- `pnpm exec vp check`.
- Fork CI green on the pushed commit; `ci.yml` of the upstream stays disabled.
- Manual: Settings → Members → **Invite guest** → the "all projects" option is unavailable, one project is required, the guest accepts the link and lands on `/my-requests` with a Guest badge in the members table.

## Review focus

1. **No path sends `all` for a guest** — neither the default value nor a stale `chosenAccess` can restore it, because the `all` radio is disabled and `allowAll` is false in guest mode.
2. **Member invitations are unchanged** — the existing four project-access tests must stay green without edits.
3. **One project is required** — `isProjectAccessComplete` still gates submission, so an empty selection cannot reach the API.
