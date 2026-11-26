# Kaneo Dashboard — Data Model and Metric Definitions (Phase 1)

> Phase: 1 – Architecture and Functional Specification
> Status: Implemented (Phase 3–5, `feature/ui-development`); awaiting final review.
> Rule: every number comes from a named column and predicate below. No metric
> is estimated, sampled or fabricated.

## 1. Entities used

| Entity | Table | Fields used |
| --- | --- | --- |
| project | `project` (`schema.ts:500`) | `id`, `workspaceId`, `archivedAt`, `position` |
| task | `task` (`schema.ts:690`) | `projectId`, `userId`, `status`, `priority`, `dueDate` |
| activity | `activity` (`schema.ts:945`) | `type`, `createdAt`, `eventData` |
| workspace member | `workspace_member` (`schema.ts:327`) | `workspaceId`, `userId` |

No schema change. `completedAt` and status history stay absent; metrics that
would need them are out of v1.

## 2. Definitions

| Term | Definition | Why |
| --- | --- | --- |
| **Open task** | `task.status NOT IN ('done','archived')` | Matches the terminal statuses Kaneo already uses when it counts completed work (`project/controllers/get-project-statistics.ts:33-36`). |
| **Overdue** | `task.dueDate IS NOT NULL AND task.dueDate < now()` | `dueDate` is `timestamp` without time zone in UTC (`schema.ts:718`). |
| **Due soon** | `now() <= task.dueDate < now() + interval '3 days'` | Window confirmed by the owner. Displayed in the UI. |
| **Urgent** | `task.priority IN ('urgent','high')` | Priority vocabulary `no-priority|low|medium|high|urgent` (`task/validate-task-fields.ts:229`). Product copy says "urgent"; the hint names both values. |
| **Unassigned** | `task.userId IS NULL` | `assignee_id` is nullable with `ON DELETE SET NULL` (`schema.ts:706-710`). |
| **Readable project** | project not archived **and** `projectAccessCondition(userId, project.id)` | Same predicate the project list uses, so the dashboard cannot count a project the caller cannot see. |
| **Completed task** | status `done` or `archived` | Existing Kaneo statistics; **not** `column.isFinal`. Documented divergence. |

`now()` is the database clock at request time. The page displays the window
("3 days") so the number is interpretable without recomputation.

## 3. Metrics

| ID | Metric | Predicate | Source |
| --- | --- | --- | --- |
| M1 | Project count | readable projects | `GET /project` |
| M2 | Member count | workspace membership rows | `GET /workspace/{id}/members` |
| M3 | My open tasks | open ∧ `userId = caller` | `GET /task/assigned` → `total` |
| M4 | My overdue | M3 ∧ overdue | new endpoint |
| M5 | Overdue & urgent | open ∧ overdue ∧ urgent ∧ readable project | new endpoint |
| M6 | Due soon | open ∧ due soon ∧ readable project | new endpoint |
| M6a | Due soon, urgent | M6 ∧ urgent | new endpoint |
| M7 | Unassigned | open ∧ `userId IS NULL` ∧ readable project | new endpoint |
| M8 | Intake waiting | `intake_request.status IN ('new','triaged')` in readable projects | `GET /workspaces/{id}/intake-requests?status=new` (and `status=triaged`) |
| M9 | Intake in progress | `intake_request.status = 'in_progress'` in readable projects | `GET /workspaces/{id}/intake-requests?status=in_progress` |

M8 and M9 use the existing intake list endpoint (one request per status); no
new query is needed.

## 4. Aggregation query shape

One grouped statement per count family; no per-project loop.

```sql
select
  count(*) filter (where t.due_date < now() and t.priority in ('urgent','high'))
    as overdue_urgent,
  count(*) filter (where t.due_date >= now()
                     and t.due_date < now() + interval '3 days')
    as due_soon,
  count(*) filter (where t.due_date >= now()
                     and t.due_date < now() + interval '3 days'
                     and t.priority in ('urgent','high'))
    as due_soon_urgent,
  count(*) filter (where t.assignee_id is null) as unassigned,
  count(*) filter (where t.assignee_id = :caller
                     and t.due_date < now()) as mine_overdue
from task t
join project p on p.id = t.project_id
where p.workspace_id = :workspaceId
  and p.archived_at is null
  and t.status not in ('done','archived')
  and project_access_condition(:caller, t.project_id);
```

`projectAccessCondition` is a Drizzle `SQL` fragment
(`apps/api/src/project-access/project-access-condition.ts`), so it goes into
the `where` clause of the Drizzle query rather than as raw text. The `filter`
clauses translate to `count(case when ... then 1 end)` through Drizzle `sql`,
the same style as `get-project-statistics.ts`.

Indexes: the existing `task_projectId_idx` covers the join. If workspace sizes
make the scan visible, add a partial index on `(project_id, due_date)` for open
tasks — a separate, approval-gated migration, not part of v1.

## 5. Counting rules and edge cases

| Case | Rule |
| --- | --- |
| Task with no due date | Never overdue, never due soon; still counts in M3 and M7. |
| Subtask | Counted as a task; Kaneo stores subtasks as `task` rows plus a `task_relation` row. Same behaviour as project statistics. |
| Task in an archived project | Excluded from M5–M7 (project filter). Project statistics excludes the project entirely. |
| Task with status `archived` | Excluded from all "open" counts. |
| Custom final column | Its tasks are **not** treated as done unless their status is literally `done`/`archived`. Documented limitation. |
| Member limited to selected projects | Counts only their readable projects. |
| Guest | 403; no counts returned. |
| Workspace with 0 projects | Counts are `0`; the UI shows the projects empty state. |

## 6. What v1 deliberately does not compute

- workspace-wide status/priority distribution (needs per-project fan-out or a
  second endpoint)
- throughput / "completed this week" (no `completedAt`)
- cycle time / lead time (no status history)
- per-member workload (no aggregation endpoint; would expose cross-member
  data that a limited member may not be allowed to see)
- time tracked (per-task only)

These stay unrendered rather than approximated.
