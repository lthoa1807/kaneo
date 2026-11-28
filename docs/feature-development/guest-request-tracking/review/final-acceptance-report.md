# Final Acceptance Report: guest-request-tracking

Date: 2026-11-28 | Branch: `feature/guest-request-tracking` | PR: #18 (draft, open)

## Phase summary

| Phase | Status | Commit |
|---|---|---|
| P1 - API counts, group filter, list order | APPROVED | `5967b22f` |
| P2 - Guest portal summary, group filter, show all | APPROVED | `5506af9e` |
| P3 - Guest detail stepper, activity copy, Need feedback loop | APPROVED | `5b6aee2a` |

## Overall testing

| Type | Result | Notes |
|---|---|---|
| Integration | Pass | Fork CI run `46136950509` on `5b6aee2a`: API integration shards 1-4 all `success`. Includes `tests/api-integration/intake-list-and-detail.test.ts` (counts, group filter, pagination order, guest/project isolation) and the transition suite. |
| Regression | Pass | Same run: lint, i18n:check, openapi:check, typecheck, build all `success` (repo-wide, GitHub-hosted runner). Local P3 scope: `vp test` intake folder 11 files / 61 tests, `vp check` clean, `i18n:check` all locales in sync. |
| End-to-End | Pass (manual, local) | Real browser run on 2026-11-28 with owner, member and guest accounts; covered creation, triage, delivery, feedback loop, confirm, reject, filter chips, 153-request pagination, realtime updates, task linking/assignment and 375px layout. Details and screenshots: `dogfood-output/guest-request-tracking-20261128/`. No automated browser suite exists for the portal. |
| Security | Pass (review + tests) | Guest isolation and workspace/project boundaries covered by API integration tests (AC-04, AC-05). Guest activity is role-level only; no staff names, avatars, or internal ids; `task_linked` never reaches the guest API payload. Notes render as React text (`whitespace-pre-wrap`), no HTML. |

## Acceptance Criteria

| ID | Result | Evidence |
|---|---|---|
| AC-01 | Met | `guest-portal-page.test.tsx` "renders the overview with server counts and the five-column list" (counts from server, open-only chart). |
| AC-02 | Met | `guest-portal-page.test.tsx` "filters by group without changing the counts" (`aria-pressed` on active chip). |
| AC-03 | Met | Same test: selecting "All" clears the group filter. |
| AC-04 | Met | API integration `intake-list-and-detail.test.ts` (guest B cannot see A's counts/items, direct API). |
| AC-05 | Met | API integration: project-scoped counts only include that project's requests. |
| AC-06 | Met | `guest-portal-page.test.tsx` "hides the overview when there are no requests at all". |
| AC-07 | Met | `guest-portal-page.test.tsx` "loads the remaining pages from the show-all button" + "drops appended pages when the group changes" + dedupe test; server count stays the full total. |
| AC-08 | Met | `intake-stepper.test.tsx` "marks earlier steps done and later steps upcoming" (`aria-current="step"` on step 3). |
| AC-09 | Met | `intake-stepper.test.tsx` "puts the current step at 4 when the request is delivered"; `guest-request-detail.test.tsx` confirm + Need feedback actions still work. |
| AC-10 | Met | `intake-stepper.test.tsx` "keeps step 3 current on needs_revision and adds the feedback note"; activity list shows the guest note. |
| AC-11 | Met | `intake-stepper.test.tsx` "ends the line on rejected instead of drawing steps 4 and 5"; rejected text shown with the timeline. |
| AC-12 | Met | Confirm mutation updates summary counts/chart via query invalidation (P2 review + `guest-request-detail.test.tsx` "confirms a delivered request in one click"). |
| AC-13 | Met (live) | Guest list and detail updated without a reload after every staff/member action (three separate deliveries observed); summary counts settled one poll later. E2E run 2026-11-28. |
| AC-14 | Met (live) | 375px viewport: no horizontal overflow on the portal or detail, chips 291px full-width, all five stepper steps stacked at 325px. E2E run 2026-11-28. |
| AC-15 | Met (review + test) | Chips are buttons with `aria-pressed`, stepper exposes `aria-current="step"`; focus-visible comes from the shared button styles. No keyboard-only automated test. |
| AC-16 | Met (review) | Colors come from existing tokens (primary/success/muted); state is never color-only (labels + `aria-current`). |
| AC-17 | Met | `staff-request-detail.test.tsx` (deliver dialog, optional note) + `intake-activity-list.test.tsx` (repeat delivery with note, no new request). |
| AC-18 | Met | `intake-activity-list.test.tsx`: You/Team actor, purpose copy, notes both directions, `task_linked` hidden; `guest-request-detail.test.tsx` "never renders linked task internals". Live: member delivered after the owner linked and assigned a task; the guest saw the delivery note and only task counts, no task title/assignee/`task_linked`. |

## Documentation

- `apps/docs/openapi.json` regenerated in P1 and enforced by `openapi:check` (CI green).
- 23 intake keys added/changed in `i18n/en-US.json`; all 20 other locales synced by `i18n:check:fix` (values fall back to English until translated); `i18n/schema.json` regenerated.
- No database migration required.
- No README or deployment change needed; feature is additive and scoped to the intake portal.

## Git history

- Three phase commits, one per phase, each green in Fork CI.
- Out-of-scope files in the commits: only generated `i18n/*.json` locales and `i18n/schema.json` (scope expanded to `i18n/**` with the user's explicit decision on 2026-11-28).
- Pre-existing dirty files `AGENTS.md` and `REPO_MAP.md` were never staged or committed.
- `state.json` / `feature-progress.md` changes are wf bookkeeping written after each commit.

## Outstanding issues and risks

- P03-4: a `rejected` request always shows "Submitted" and "Received" as done — prescribed by the approved ui-spec v14; the detail payload has no history to know where the rejection happened.
- P03-5: `task_linked` activity entries are hidden for staff too, because the activity component is shared; the P3 plan asked for this and staff still see the linked-tasks section.
- P03-6: the shared detail mounts `authClient.useSession()` to resolve You/Team; served from better-auth's store.
- P03-7 / F3: guest dialog keys keep the `revision*` names (values now "Need feedback"); unknown activity types would fall back to `intake:detail.<type>` (pre-existing, API never writes them today).
- Translations for the 20 non-English locales are English copies; they need a real translation pass before release if the product ships localized intake copy.
- Group filter and "Show all" polling can briefly show a request twice; it is deduped by id (covered by test).

## E2E acceptance run (2026-11-28, local dev)

Real browser run through the guest flow with three accounts in three `agent-browser` sessions (owner, member, guest) against local API `:1337` / web `:5173` and `kaneo-dev-pg`. Screenshots in `dogfood-output/guest-request-tracking-20261128/screenshots/`.

Verified live:

- Guest empty state, then request creation (REQ-1..4) and server counts on the summary.
- Owner triage: Mark reviewed (status reads "Reviewed"), Approve, Start work, deliver with note.
- Realtime: guest list and detail moved to "Awaiting your confirmation" without a reload after each staff action, and again after the member delivered (AC-13).
- Guest detail stepper: step 4 current on delivered, all steps done on confirmed, step 3 current with the feedback note on needs_revision, timeline ends at "Rejected" for a rejected request; `aria-current="step"` present/absent accordingly (AC-08..AC-11).
- Need feedback requires a non-empty note (Confirm disabled) and returns the request to staff; staff re-delivers with a new note and the guest sees "Team delivered this request again: <note>" (AC-17).
- Confirm removes the guest actions, writes one "You confirmed this request" entry (no duplicate from the paired status change), and updates summary counts to All 3 / 0 active (AC-12).
- Group chips filter the list without changing counts and expose `aria-pressed`; "All" restores the list (AC-02, AC-03).
- Pagination: with 153 requests the guest list renders 100 rows plus "Show all 153 requests"; after loading, 153 rows, scroll position preserved, button gone, count unchanged (AC-07).
- Task link: owner creates the task from "Attach a task" and assigns it to a member on the task; the member then starts work and delivers the same request. Guest activity never shows `task_linked` or staff names/avatars; the detail only shows task counts (AC-18).
- 375px viewport: no horizontal overflow on the portal or the detail; chips and stepper stack vertically (AC-14).

Follow-ups found during the run (recorded, not fixed — outside the approved scope):

- The "Attach a task" dialog has no assignee field, so assigning the work to a staff member requires opening the created task. Consistent with the approved ui-spec ("intake request has no assignee", guests see "Handled by the {project} team"), but worth considering an assignee shortcut in the dialog later.
- On the staff surface the shared activity component labels guest actions as "Team" ("Team created this request", "Team sent feedback"), because the copy only distinguishes current user vs everyone else. Correct on the guest surface; misleading for staff. Needs a third role label or a per-surface copy.
- Summary counts settled one poll behind the list after a realtime delivery (list showed "Awaiting your confirmation" while the counts still said "In progress" for a few seconds). Self-corrected without a reload.

## Recommendation

Ready for acceptance: all phases approved and committed, CI green on the exact HEAD, acceptance criteria covered by tests or explicit documented review evidence. The listed risks are design-accepted or follow-ups outside this feature's scope.
