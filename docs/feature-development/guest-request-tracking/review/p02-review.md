# Code Review: P2 - Guest portal summary, group filter, show all

Reviewer: independent subagent, then a second round in OCR **delegation mode**
(`ocr delegate preview` + `ocr delegate rule`; no LLM endpoint, no key).
Scope: working tree vs base `5967b22f`, paths `apps/web/src/{components,fetchers,hooks,types}`, `apps/web/src/routes`, `i18n/**`.
Verdict after round-2 fixes: **APPROVED**.

## Round 2 (OCR delegation mode)

Raw OCR delegate output: `review/p02-ocr.json`. Each finding was re-checked
against the code and the approved spec before acting.

| ID | Severity | Verdict | Finding | Action |
|---|---|---|---|---|
| P02-1 | Medium | Confirmed, introduced by P2 | `placeholderData` in the shared hook also applied to staff tabs (`StaffIntakePage`) and the dashboard queue, which never render `isPlaceholderData`: the previous filter's rows showed as the new one. | `placeholderData` is now only set when `group` is defined; staff and dashboard keep true loading state. |
| P02-2 | Low | Confirmed, introduced by P2 | Page 1 and pages 2..N poll independently, so one request could appear in both halves of the merge (duplicate row and React key). | `GuestPortalPage` dedupes the merged list by id; covered by a new test. |
| P02-3 | Low | Not a bug | "All requests" has no percent. | Approved spec says so: `ui-spec.md` "All requests không có %" and % is computed over open work. No change. |
| P02-4 | Low | Confirmed, repo convention | `i18n/schema.json` was not regenerated after adding keys (`intake.portal.required` stale). | Ran `pnpm i18n:schema`; schema now includes the new keys. |
| P02-5 | Low | Intended design | At <640px the list header wraps in 2 columns while rows flex-wrap. | `ui-spec.md` prescribes exactly that ("list header wrap 2 cột, row flex wrap"). No change; changing approved UX during implementation is out of scope. |
| P02-6 | Low | Confirmed | Comment in `intake-status.ts` said the label always comes from `intake:status.*`. | Comment now says the guest list overrides the label. |
| P02-7 | Low | Partly | Page 2..N failures had no message; the show-all button did re-enable and retry on click. | `combine` exposes `isError`; the portal shows `intake:list.loadError` above the retry button. |
| P02-8 | Low | Confirmed | No direct test for the pages merge. | Added a page-1/page-2 duplicate-id test. The page-range arithmetic is `Math.max(totalPages - 1, 0)` and already exercised by the show-all test; no extra unit test added. |

## Round 1 findings and resolutions

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| M1 | Medium | Cached page 2..N results kept rendering after a group switch while their queries were disabled, so rows froze and stopped polling. | `guest-portal-page.tsx` appends extra pages only while `showAll` is true; returning to a group shows page 1 + the button again, and clicking re-enables the cached pages. |
| M2 | Medium | A new group key had no data, so the whole portal swapped to skeleton: counts, banner and the focused legend button disappeared (violates FR-03 and the focus rule). | `useGetIntakeRequests` uses `placeholderData: previousData`; the list dims with `isPlaceholderData`, and "Show all" is hidden until the new page lands. |
| M3 | Medium | Independent page polls could show the same request twice (duplicate rows and React keys) when pagination shifts. | Pages hook dedupes by request id before appending. |
| L1 | Low | Banner was a `<section>` with no heading. | Added a visually hidden `h2` + `aria-labelledby`. |
| L2 | Low | Banner used info tint and an outline button; prototype uses a neutral surface and a quiet action. | Neutral `border bg-secondary/40` + `variant="ghost"`. |
| L3 | Low | Legend accessible name dropped the noun ("In progress: 1"). | New `intake:portal.legendName` plural key ("{{label}}: {{count}} requests"). |
| L4 | Low | Legend focus ring lacked `outline-offset`; 32px rows lacked a touch hitbox. | Added `focus-visible:outline-offset-2` and `touch-hitbox`. |
| L5 | Low | Summary skeleton height differed from the loaded card. | Skeleton rows are `h-8`, `gap-0.5`, with a divider spacer. |
| L6 | Low | `new` and `triaged` shared the guest label "Waiting for review" but had different badge tones (outline vs info), against the design table. | `INTAKE_STATUS_TONES.triaged` is now `outline` (spec table is the source). |
| L7 | Low | Tests did not assert list content changes, show-all reset, or the group helper. | Added list-content and reset assertions + `intake-groups.test.ts`. |

## Nits accepted as-is

- `Show all {{total}} requests` has no plural form: it only renders when more than 100 rows exist, so "1 requests" is unreachable.
- The fetcher keeps a local group union and `PAGE_LIMIT = 100` mirrors the API cap; sharing the API type would couple the fetcher to the controller module.

## Checks run by the reviewer and the agent

- Round 2 OCR delegation: `ocr delegate preview --format json --exclude 'docs/feature-development,AGENTS.md,REPO_MAP.md'` and `ocr delegate rule --format json <P2 paths>`; output in `review/p02-ocr.json`.
- `vp test run src/components/intake src/components/dashboard/intake-queue.test.tsx` → 7 files / 36 tests pass.
- `vp check` on all touched source files → clean.
- `pnpm i18n:schema` → `i18n/schema.json` regenerated; `pnpm i18n:check` → all locales in sync.
- Web typecheck not run locally (AGENTS.md: full-app `tsc` on WSL exhausts memory); left to CI.
- No browser render at 375px/960px; responsive findings are from classes and spec math.
