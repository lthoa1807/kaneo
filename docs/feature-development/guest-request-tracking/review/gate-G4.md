# Gate G4: Final acceptance

Feature: guest-request-tracking | Prepared on 2026-11-28 | Version: 1

**Review:** `review/final-acceptance-report.md` (evidence per AC, CI run `46136950509`, three phase commits)

**Summary:** All three phases (P1 API, P2 guest portal, P3 detail stepper/feedback loop) are APPROVED and committed on `feature/guest-request-tracking`; Fork CI is green on the exact HEAD `5b6aee2a` (lint, i18n, openapi, typecheck, build, API integration shards 1-4). A real browser E2E pass on 2026-11-28 (owner + member + guest accounts) exercised creation, triage, delivery, the feedback loop, confirm, reject, chips, 153-request pagination, realtime updates, task linking/assignment and the 375px layout. Every acceptance criterion is covered by a test or live evidence; no migration and no new configuration. PR #18 is open as a draft and is yours to mark ready and merge.

**Open points:**
- 20 non-English locales currently hold the English copy for the new keys.
- P03-4 and P03-5 remain as documented, design-accepted behavior.
- Follow-ups found in the E2E run, recorded in the report: "Attach a task" has no assignee field (assignment happens on the task), and the staff surface labels guest actions as "Team".

---

## Decision

**Approve this gate?**  Approve  /  Refuse

(Approve = feature accepted; the PR and merge stay your decision. Refuse = tell the agent what to change.)
