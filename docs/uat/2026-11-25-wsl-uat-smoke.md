# UAT smoke test — WSL developer machine, 2026-11-25

First run of a CI-built image through the real UI before an official deploy.
Driven with `agent-browser` against the UAT stack, logged in as a seeded user.

## Environment

| | |
| --- | --- |
| Image | `ghcr.io/lthoa1807/kaneo-fork:sha-796f4093d8a3` (fork `main`) |
| Digest | `sha256:96df398ea0c19bb519efdcb8464b7081ac0607a25ef37214b20e37b1a2a838fe` |
| App version | 2.50.0 (shown in the sidebar) |
| Compose project | `kaneo-uat`, port 5174, own Postgres volume `kaneo-uat_postgres_data` |
| Host | WSL, mirrored networking, dev environment (API 1337) still running alongside |
| Data | synthetic prod-like dataset: 4 users, 8 projects, 600 tasks, 130 labels, 112 comments, 680 activity rows |
| Started | 2026-11-25T07:23:16Z |

Brought up with `scripts/stack/up.sh uat <image>`, data loaded with
`scripts/stack/seed-uat.sh`.

## Result: pass

| Step | Result | Evidence |
| --- | --- | --- |
| Container health | pass | both containers `healthy`, `GET /api/health` → `{"status":"ok"}` |
| Migration on a populated database | pass | container restarted on the seeded DB, log `✅ Database migrated successfully!`, `API is ready` |
| Sign in with password | pass | `/dashboard/workspace/…`, no redirect loop |
| Workspace sidebar | pass | 8 projects listed, Inbox 8, My tasks 99+ |
| Board with volume | pass | 75 tasks in 4 columns `Backlog:17 To Do:19 In Progress:20 Done:19`, labels and due dates rendered |
| Board API | pass | `GET /api/task/tasks/<project>` 200, 57 ms, 30 KB payload |
| Task detail | pass | title, description editor, sub-tasks, relations, time tracking, resources, activity all present |
| Add comment | pass | appears in activity; stored as `activity.type='comment'` |
| Change status | pass | `Backlog → In Progress → Done`, activity records `changed status from … to …`, DB row matches |
| Realtime between two tabs | pass | second tab changed status, first tab (no reload) went `In Progress:20 Done:19` → `In Progress:19 Done:20` in under 2 s |
| Reload persistence | pass | status and comment survive a full page reload |
| Search | pass | query matches task plus its activity entries, clicking a result opens the task |
| My tasks (144 tasks) | pass | grouped by due date, first paint ~430 ms, first 100 of 144 listed |
| Console and page errors | pass | `agent-browser errors` and `console` empty after the whole run |

## Findings

1. **Accessibility — 4 axe violations on the board** (axe 4.12.1, 35 passes):
   - `nested-interactive` [serious] — 75 nodes: interactive controls nested inside each other (task cards wrap buttons).
   - `color-contrast` [serious] — 14 nodes; axe reports "could not parse color string `oklch(0.97 0 none)`", so this is partly axe's parser, not proven low contrast.
   - `page-has-heading-one` [moderate] — 1 node: no `<h1>` on the board page.
   - `region` [moderate] — 2 nodes: content outside a landmark.

   These come from `main`, not this run's setup. `nested-interactive` is the one
   worth a real ticket: it breaks keyboard and screen-reader navigation of cards.

2. **Wrong table for comments in the seed script — fixed.** Comments are stored
   as `activity` rows with `type='comment'`; the `comment` table is not read by
   the app. The first seed wrote 112 rows nobody displays. Corrected in
   `scripts/stack/seed-uat.sql`, reloaded, confirmed through `GET /api/comment/<task>`.

3. **Sidebar counts (`Inbox 8`, `My tasks 99+`) come from live data**, so seeded
   rows produce a realistic, slightly noisy badge — expected, not a bug.

## Screenshots

Vision review of `01-board.png` (1024 px wide viewport): clean layout, no
overlapping text, no missing avatars, consistent spacing. Two things that are
viewport size, not defects: only three of the four columns fit (the board scrolls
horizontally) and the last row of cards is clipped at the bottom edge.

| File | Shows |
| --- | --- |
| `screenshots/uat-2026-11-25/01-board.png` | board, 75 tasks across 4 columns |
| `screenshots/uat-2026-11-25/02-task-detail.png` | task detail with activity log |
| `screenshots/uat-2026-11-25/03-board-after-status.png` | board after a status change |
| `screenshots/uat-2026-11-25/04-my-tasks.png` | My tasks, 144 tasks grouped by due date |
| `screenshots/uat-2026-11-25/05-realtime-board.png` | board updated by a second tab without reload |

## Not covered

- OAuth/OIDC and GitHub App flows (no client secrets in `.env.uat`).
- SMTP, notifications delivery, webhooks, Slack/Gitea integrations.
- Intake, time tracking, file upload, MCP, API keys, mobile app.
- Migration from a **real** production dump: this ran on synthetic data. The
  check that matters before an official deploy is a dump restored from prod
  (`pg_dump -Fc`) with PII scrubbed.
- Load beyond one browser: no concurrency test, no slow-network test.
- Accessibility of the other pages (only the board was audited).
