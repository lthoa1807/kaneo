# Code review: P1 — API counts, group filter, list order

| Item | Content |
|---|---|
| Round | 1 |
| Tool | OCR unavailable (no LLM configured: `ocr_health` reports "no valid LLM endpoint"), so review ran in delegation mode with an independent subagent, plus the checklist below. |
| Scope reviewed | `apps/api/src/intake/intake-groups.ts` (new), `controllers/list-intake-requests.ts`, `schema.ts`, `response.ts`, `index.ts`, `apps/docs/openapi.json`, `tests/api-integration/intake-list-and-detail.test.ts` |

Checklist: correctness, security, performance, maintainability, duplication, architecture compliance, test coverage, requirement compliance.

## Findings

### Critical

None.

### High

None.

### Medium

| # | Finding | Resolution |
|---|---|---|
| M1 | Guest scope candidates came from every request the user owns, without `workspaceId`: `GET /workspaces/A/...` included the guest's requests (and now counts) from workspace B. Own data only, but it breaks BR-01/BR-02 scoping. | **Fixed.** Guest path inner-joins `projectTable` and filters `projectTable.workspaceId = workspaceId` before the accessibility check. Existing access-loss test now asserts `counts.all` drops the hidden project. |
| M2 | Conditional counts re-hardcoded the status lists from `intake-groups.ts`, so `group` filtering and `counts` could drift when a status is added. | **Fixed.** `groupCount(group)` builds every count from `groupStatuses(group)`; schema enum now imports `INTAKE_GROUP_VALUES`. |
| M3 | Tests asserted counts only for one guest alone, so dropping `createdById` from the guest scope would still pass; manager counts were unasserted; `in_progress`, `group=all`, invalid group, status-filter independence and pagination independence were uncovered. | **Fixed.** Added assertions: guest counts exclude another user's request; manager counts across accessible projects; `group=in_progress`; `group=all`; `group` invalid → 400; counts unchanged under `status` filter and `limit=1`; counts after access loss. |

### Low

| # | Finding | Resolution |
|---|---|---|
| L1 | `sql<number>` for `count(*) filter` is unsound (pg returns int8 as string). | **Resolved by construction.** Counts now use drizzle `count(sql\`case when … then 1 end\`)`, and the response maps every value through `Number()` (same as existing `total`). |
| L2 | No unique final tie-break: equal `(createdAt, number)` across projects could reorder between pages. | **Fixed.** `orderBy` ends with `id`. |
| L3 | `emptyCounts` object shared by reference between empty paths. | **Fixed.** `emptyCounts()` returns a fresh object. |
| L4 | Group vocabulary in several places; `INTAKE_GROUPS` exported but unused, and the web staff page names the middle group `progress`. | **Partly fixed.** API now has one source (`INTAKE_GROUP_VALUES` + `groupStatuses`). The web side is P2 scope; noted there. |
| L5 | New `group` query param had no OpenAPI description. | **Fixed.** Added description; `apps/docs/openapi.json` regenerated and diffed. |

## Verification after fixes

- `apps/api` typecheck: clean (native `tsc` binary; the pnpm wrapper hits the known `execve EBUSY` on this machine).
- Integration test `tests/api-integration/intake-list-and-detail.test.ts`: **11 passed / 0 failed**.
- `apps/docs/openapi.json`: regenerated from `apps/api` and byte-diffed; only `group` + `counts` additions.

Outstanding: L4 web naming duplication is scheduled for P2. No other open findings.
