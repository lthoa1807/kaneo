# Approvals: guest-request-tracking

> Decisions of the human (the user) are recorded here. Two ways to record one:
> 1. The user ticks the box in an editor: change `[ ]` to `[x]`, write your name after `by:` and the date after `date:`.
> 2. The user approves in chat (or by clicking Approve in Plannotator) and the agent records it with
>    `wf record <ID> --by "<user name>" --via chat --quote "<the user's own words>"`.
> The agent may record a decision ONLY after the user has explicitly said it in this conversation. The agent must never decide for the user.
> New items are added at the bottom. Run `wf status` to see what is waiting.
> User: HOALT


## G1 · Requirements approval
Review: requirement-spec.md (review sheet: review/gate-G1.md)
- [x] **APPROVE G1** | by: HOALT | date: 2026-11-27 | via: plannotator | quote: "Approve" <!-- gate:G1 -->

## G2 · UX/UI design approval
Review: design/ (ux-spec.md, ui-spec.md, user-flow.md, prototype/) (review sheet: review/gate-G2.md)
- [x] **APPROVE G2** | by: HOALT | date: 2026-11-27 | via: plannotator | quote: "Approve" <!-- gate:G2 -->

## G3 · Implementation plan approval
Review: implementation-plan.md (review sheet: review/gate-G3.md)
- [x] **APPROVE G3** | by: HOALT | date: 2026-11-27 | via: plannotator | quote: "Approve" <!-- gate:G3 -->

## G4 · Final acceptance
Review: review/final-acceptance-report.md (review sheet: review/gate-G4.md)
- [ ] **APPROVE G4** | by: ________ | date: ____-__-__ <!-- gate:G4 -->

## P1 · API counts, group filter, list order · authorization (attempt 1)
Scope: apps/api/src/intake/**, tests/api-integration/intake-list-and-detail.test.ts, apps/docs/openapi.json
- [x] **AUTHORIZE the agent to start P1** | by: HOALT | date: 2026-11-27 | via: chat | quote: "ok hãy triển khai" <!-- gate:P1.authorize.1 -->

## P3 · Guest detail stepper, activity copy, Need feedback loop · authorization (attempt 1)
Scope: apps/web/src/components/intake/**, i18n/en-US.json
- [ ] **AUTHORIZE the agent to start P3** | by: ________ | date: ____-__-__ <!-- gate:P3.authorize.1 -->

## P1 · API counts, group filter, list order · review round 1
Report: execution/p01.md · diff: review/p01-diff.md · code review: review/p01-review.md
- [x] **APPROVE P1** | by: HOALT | date: 2026-11-27 | via: plannotator | quote: "Code review completed — no changes requested." <!-- gate:P1.review.1.approve -->
- [ ] **REQUEST CHANGES on P1** (write what to change in notes) | by: ________ | date: ____-__-__ | notes: ________ <!-- gate:P1.review.1.changes -->
- [x] **ALLOW THE AGENT TO COMMIT P1** (optional: leave unticked to commit yourself) | by: HOALT | date: 2026-11-27 | via: chat | quote: "commit phase 1" <!-- gate:P1.review.1.commit -->

## P2 · Guest portal summary, group filter, show all · authorization (attempt 1)
Scope: apps/web/src/components/intake/**, apps/web/src/fetchers/intake/**, apps/web/src/hooks/queries/intake/**, apps/web/src/routes/**, i18n/en-US.json
- [x] **AUTHORIZE the agent to start P2** | by: HOALT | date: 2026-11-28 | via: chat | quote: "ok hãy thực hiện P2" <!-- gate:P2.authorize.1 -->

## P2 · Guest portal summary, group filter, show all · review round 1
Report: execution/p02.md · diff: review/p02-diff.md · code review: review/p02-review.md
- [x] **APPROVE P2** | by: HOALT | date: 2026-11-28 | via: chat | quote: "approve P2" <!-- gate:P2.review.1.approve -->
- [ ] **REQUEST CHANGES on P2** (write what to change in notes) | by: ________ | date: ____-__-__ | notes: ________ <!-- gate:P2.review.1.changes -->
- [x] **ALLOW THE AGENT TO COMMIT P2** (optional: leave unticked to commit yourself) | by: HOALT | date: 2026-11-28 | via: chat | quote: "ok" <!-- gate:P2.review.1.commit -->
