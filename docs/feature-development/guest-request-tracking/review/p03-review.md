# Code Review: P3 - Guest detail stepper, activity copy, Need feedback loop

Reviewer: independent self-review in OCR **delegation mode**
(`ocr delegate preview` + `ocr delegate rule`; no LLM endpoint, no key).
Scope: working tree vs base `5506af9e`, paths `apps/web/src/components/intake/**`, `i18n/**`.
Verdict after fixes: **APPROVED** (4 findings fixed, 5 accepted with reasons).

## Round 2 (user-requested rework)

The gate returned the diff with "open code review the change"; a second independent pass found two copy bugs in the delivered branch, both fixed here.

| ID | Severity | Verdict | Finding | Action |
|---|---|---|---|---|
| F1 | Medium | Confirmed, introduced by P3 | The staff dialog invites a reply on every delivery, but the activity only rendered `content` for the **second** delivery; a first-delivery note was stored and never shown to the guest. | `delivered` with a note now uses `intake:activity.deliveredWithNote` (`…for your review: {{note}}`). |
| F2 | Medium | Confirmed, introduced by P3 | The deliver note is optional, so a repeat delivery without a note rendered `"Team delivered this request again: "` with a dangling colon. | Added `intake:activity.deliveredAgainNoNote` and the code picks the copy from the note. |
| F3 | Low | Pre-existing, not P3 | Types without a copy key (`revision_requested`, `note_added`) fall back to `intake:detail.<type>`, showing the raw key. The API never writes those types today. | Left as-is; recorded for a later cleanup. |

## Findings

Raw delegate record: `review/p03-ocr.json`.

| ID | Severity | Verdict | Finding | Action |
|---|---|---|---|---|
| P03-1 | Medium | Confirmed, introduced by P3 | The delivery-order counter was reassigned inside the render callback; React Compiler refused to optimize and `vp check` failed the immutability rule. | Delivery ordinals are precomputed in a `Map` with a plain loop before returning; `vp check` is clean. |
| P03-2 | Low | Confirmed | An unmapped `status_changed` without a note returned `null`, so a future transition would silently vanish from the guest timeline. | Falls back to `intake:detail.status_changed`. |
| P03-3 | Low | Confirmed | The loading state had no line reserved for the stepper (ui-spec Loading row). | One `h-4 w-1/2` skeleton added to the guest detail loading block. |
| P03-4 | Low | Intended design | The rejected branch shows Submitted + Received done even when the request is rejected straight from `new`. | `ui-spec.md` v14 and the prototype prescribe the three-step branch; the detail payload has only the current status. Changing this needs a design change. |
| P03-5 | Low | Accepted, flag for the gate | `task_linked` is filtered for staff too, because the activity component is shared; requirement §9 allows only the optional-note staff change. | P3 plan says to hide it, the guest API already filters it, and staff still see the linked-tasks section. Guest-only filtering would need an extra prop; left for the reviewer to confirm. |
| P03-6 | Low | Accepted | `authClient.useSession()` now runs inside the shared detail to resolve the You/Team actor. | Better-auth serves the session from its store; the intake response only carries `createdById`, so there is no other source. |
| P03-7 | Low | Accepted | Guest dialog keys remain `revisionTitle`/`revisionDescription` though the copy is "Need feedback"; `i18n/schema.json` was stale after new keys. | Keys kept to avoid churn across 20 locales (values only); `pnpm i18n:schema` regenerated the schema. |

## What was checked

- **Correctness:** mapping of the eight intake statuses to stepper states; `confirmed` draws five done steps; `needs_revision` stays on step 3 with the note; `rejected` draws three steps; confirm writes both a `status_changed` and a `confirmed` row, so only the `confirmed` entry renders; "delivered again" uses list order (newest first) to number deliveries.
- **Security/privacy:** activity notes render as React text with `whitespace-pre-wrap` (no HTML), no staff names or internal ids added; actor is role-level; `task_linked` never reaches the guest.
- **Performance:** O(n) filters/maps over one request's activity; no new queries; session read comes from the existing auth store.
- **Maintainability:** stepper and activity copy live in their components, following existing intake patterns; no new token, dependency, or shared abstraction.
- **Test coverage:** `intake-stepper.test.tsx` (5 statuses, `aria-current`, rejected/revision), `intake-activity-list.test.tsx` (You/Team, purpose copy, first vs repeated delivery, note vs no note, single confirmation, `task_linked` hidden), plus updated guest/staff detail tests (stepper rendered, deliver dialog optional, reject still required).
- **Requirement compliance:** FR-06, FR-07, FR-12; BR-10, BR-11, BR-12; AC-08…AC-11, AC-18.

## Verification run

`pnpm exec vp test --config vitest.config.ts run src/components/intake` → 11 files / 61 tests pass.
Focused four files → 7 files / 36 tests pass.
`pnpm exec vp check apps/web/src/components/intake i18n/en-US.json i18n/schema.json` → clean.
`pnpm i18n:check` → all locales in sync. `pnpm i18n:schema` → regenerated.

No Critical or High findings. Web typecheck left to CI (WSL memory trap).
