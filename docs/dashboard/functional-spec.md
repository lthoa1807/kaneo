# Kaneo Dashboard — Functional Specification (Phase 1)

> Phase: 1 – Architecture and Functional Specification
> Status: Implemented (Phase 3–5, `feature/ui-development`); awaiting final review.
> Page: "Overview" at `/dashboard/workspace/$workspaceId/overview`
> Companion docs: `architecture.md`, `data-model.md`, `api-contract.md`

## 1. Purpose

One workspace-scoped page that answers, at a glance:

- What is at risk of slipping (overdue and due-soon work)?
- What is not owned by anyone?
- Which projects are close to finished?

It does not replace Home. Home stays the personal greeting/up-next page.
Overview is the workspace health page.

## 2. Page structure

```
Overview                                    [workspace name]
────────────────────────────────────────────────────────────
[tile] Projects  [tile] Members  [tile] My open  [tile] My overdue
────────────────────────────────────────────────────────────
[card] Deadline risk                 | [tile] Unassigned tasks
  overdue & urgent: N                |
  due in 3 days: N (urgent: N)       |
────────────────────────────────────────────────────────────
[donut] By priority | [columns] Due load | [bars] By project
────────────────────────────────────────────────────────────
[card] Intake queue
  Waiting (N)                | In progress (N)
  title · REQ · project · age| title · REQ · project · age
────────────────────────────────────────────────────────────
```

Order is fixed; widgets never reorder themselves when a count changes.

## 3. Widget specification

| # | Widget | Value | Definition | Source |
| --- | --- | --- | --- | --- |
| 1 | Projects | count | active projects the caller can read | `GET /project` |
| 2 | Members | count | workspace members | `GET /workspace/{id}/members` |
| 3 | My open tasks | count | open tasks assigned to the caller | `GET /task/assigned` → `total` |
| 4 | My overdue | count | caller's open tasks with `dueDate < now` | dashboard endpoint |
| 5 | Overdue & urgent | count | open tasks `dueDate < now`, priority `urgent` or `high` | dashboard endpoint |
| 6 | Due in 3 days | count (+ urgent share) | open tasks `now <= dueDate < now+3d`; urgent share uses `urgent`/`high` | dashboard endpoint |
| 7 | Unassigned | count | open tasks with no assignee | dashboard endpoint |
| 8 | Intake queue | two lists + counts | requests with status `new`/`triaged` ("Waiting") and `in_progress`; each row: title, `REQ-n`, project, requester, age | `GET /workspaces/{id}/intake-requests?status=new` + `?status=in_progress` |
| 9 | Open tasks by priority | donut + legend | open task count per priority, five fixed values | dashboard endpoint |
| 10 | Due load · next 7 days | column chart | open tasks bucketed by `dueDate` day, today + 6 days | dashboard endpoint |
| 11 | Open tasks by project | horizontal bars | open task count per readable project, sorted desc | dashboard endpoint |

"Open" means status is not `done` and not `archived` (see `data-model.md`).
"Urgent" always means priority `urgent` or `high`; the UI writes "urgent"
because that is the product word, and the definition is in the hint text.

Widget 8 uses the existing intake endpoint three times (one per status) and
renders at most 4 rows per group; `total` stays the exact count. `triaged` is
grouped with `new` because both are waiting on the team, and the header says so.
If `intakeRequest:read` is missing, the card shows its own error state and the
rest of the page is unaffected.

Charts 9–11 are drawn from the same aggregate as the counts they sit next to,
so a headline number cannot disagree with its chart. They are not a new source
of truth and do not add a chart dependency.

### Drilldown

The task-backed widgets (3–7 and 9–11) are drill triggers, not decoration:

- Clicking a count, legend row, column or project bar opens a modal list of
  the exact tasks behind that number.
- The list shows title, task key, project, assignee, priority and relative due
  date, sorted by due date then priority.
- Each bucket is capped at 50 rows; when the count is higher the dialog footer
  says "Showing the first N of M." There is no "open in Tasks" link: My Tasks
  is assignment-scoped and no other view accepts these task filters, so the
  link would drop rows.
- Intake rows are links, not drill triggers: they open the request detail in
  its project, because that is where triage happens.
- Widgets that are not task-backed (Projects, Members) are not clickable, so
  "clickable" keeps meaning "there is a list behind it".

## 4. States

| State | Behaviour |
| --- | --- |
| Loading | Skeleton grid matching the final layout. No spinner-only page. |
| Empty (projects) | "No projects yet" with a link to create one when the caller can (`canCreateProjects`). |
| Empty (intake) | A group with no rows says "No intake requests in this group."; when both groups are empty the card keeps one message instead of two empty headings. |
| Zero count | The tile shows `0`; it is data, not an empty state. |
| Widget error | That widget shows "Couldn't load" + Retry; other widgets stay. |
| Guest | Page is not reachable from the sidebar and its queries are disabled; a direct URL hits the API 403 and shows the error state, not zeros. |

## 5. Interactions

- Every task-backed widget opens the drilldown dialog described above. The
  dialog is a native `<dialog>` opened with `showModal()`: the browser supplies
  the focus trap, `Esc`, backdrop and focus return, so no manual ARIA or focus
  code is added.
- The dialog is the end of the drilldown. My Tasks lists only the caller's
  assigned tasks and no other view accepts priority/due/project task filters,
  so the footer reports truncation and offers no link.
- Project bars (widget 11) open that project's open tasks in the dialog.
- "My open" and "My overdue" open their task lists in the dialog. They do not
  link to `/my-tasks`; the dialog is the shorter path.
- No filters, no date picker, no workspace switcher on the page: the route
  already scopes the workspace, and the sidebar switches it.
- No mutation is possible from this page; it is strictly read-only.

## 6. Responsive behaviour

| Width | Layout |
| --- | --- |
| < 640 px | one column; tiles stack; cards full width |
| 640–1279 px | two columns; the four tiles form 2×2 |
| >= 1280 px | four tiles per row; deadline card spans 2 columns, unassigned tile 1 |
| >= 1536 px | same as above; lists use the extra width, not new columns |

The page must not scroll horizontally at 320 px. Widget values use tabular
numbers so counts do not jump width when polling updates them.

## 7. Copy (i18n)

New namespace `dashboard` in `i18n/en-US.json`:

```
dashboard:title                        "Overview"
dashboard:subtitle                     "{{workspace}} at a glance"
dashboard:tiles.projects               "Projects"
dashboard:tiles.members                "Members"
dashboard:tiles.myOpen                 "My open tasks"
dashboard:tiles.myOverdue              "My overdue"
dashboard:tiles.unassigned             "Unassigned tasks"
dashboard:risk.title                   "Deadline risk"
dashboard:risk.overdue                 "Overdue and urgent"
dashboard:risk.dueSoon                 "Due in {{days}} days"
dashboard:risk.urgentShare             "{{count}} urgent"
dashboard:risk.hint                    "Open tasks only · urgent = high or urgent priority"
dashboard:intake.title                 "Intake queue"
dashboard:intake.hint                  "Requests waiting for triage or already being worked on"
dashboard:intake.waiting               "Waiting"
dashboard:intake.inProgress            "In progress"
dashboard:intake.age.today             "today"
dashboard:intake.age.days              "{{count}} days"
dashboard:intake.viewAll               "View all intake requests"
dashboard:intake.empty                 "No intake requests in this group."
dashboard:charts.byPriority            "Open tasks by priority"
dashboard:charts.byPriorityHint        "{{count}} open tasks · click a priority"
dashboard:charts.dueLoad               "Due load · next 7 days"
dashboard:charts.dueLoadHint           "Open tasks by due date, today onward"
dashboard:charts.byProject             "Open tasks by project"
dashboard:charts.byProjectHint         "Where the work sits right now"
dashboard:drill.title                  "Tasks"
dashboard:drill.empty                  "No tasks match this filter right now."
dashboard:drill.cap                    "Showing the first {{shown}} of {{total}}."
dashboard:drill.close                  "Close"
dashboard:drill.loading                "Loading tasks…"
dashboard:error.title                  "Couldn't load"
dashboard:error.retry                  "Retry"
```

Add `navigation:sidebar.overview` = "Overview".

## 8. Accessibility

- Page has one `h1` ("Overview"); each card has an `h2`.
- Counts are text, announced normally by screen readers; the tile label is
  associated with the value through the accessible name, not only visually.
- Progress bars: native `<progress>` with `aria-label`, value visible as text.
- Every drill trigger is a `<button>` with a visible label and a focus ring.
  SVG chart geometry is `aria-hidden`; the legend/columns carry the values, so
  nothing depends on reading a shape.
- The drilldown is a native `<dialog>` named by its `h1`; no `role="dialog"`,
  `aria-modal`, manual focus trap or `Esc` handler.
- Urgency is stated in words; color is a secondary cue only.
- Polling updates do not steal focus and do not reorder the DOM.
- Contrast follows existing tokens, verified in light, dark and `modern`.

## 9. Known limitations shown in the UI

- Completion uses Kaneo's existing project statistics (status `done` or
  `archived`), not `column.isFinal`; a workspace with a custom final column
  reports the same number as the project cards, which may differ from its
  board's "final" column.
- "Due in 3 days" is counted from the server's clock at request time; the page
  does not recompute it client-side between polls.
