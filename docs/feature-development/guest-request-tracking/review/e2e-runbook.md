# Intake portal E2E runbook (reusable)

Last run: 2026-11-28 against `feature/guest-request-tracking` (`5b6aee2a`).
Local dev only. Never reuse these accounts or this data outside a dev database.

## Environment

```sh
docker start kaneo-dev-pg                      # Postgres on 127.0.0.1:5432
# pnpm dev fails at build:dependencies on this WSL box (tsc EBUSY); build packages directly:
for p in permissions email importers editor mcp; do (cd packages/$p && ../../node_modules/.bin/tsc --noEmit false) || exit 1; done
nohup pnpm --filter @kaneo/api dev > /tmp/opencode/kaneo-dev/api.log 2>&1 &
nohup pnpm --filter @kaneo/web dev > /tmp/opencode/kaneo-dev/web.log 2>&1 &
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/        # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:1337/api/health  # 200
```

Root `.env` must have `DATABASE_URL`, `AUTH_SECRET` (32+ chars), `KANEO_CLIENT_URL`,
`KANEO_API_URL`; see `DEV_RUNBOOK.md`.

## Accounts and IDs (dev database, created by this run)

| Role | Email | Password |
|---|---|---|
| owner (staff) | `finalqa-staff@test.local` | `FinalQA-2026!` |
| member (staff) | `finalqa-member@test.local` | `FinalQA-2026!` |
| guest | `finalqa-guest@test.local` | `FinalQA-2026!` |

- Workspace: `Final QA Workspace` — `7MHHRlRPU2vLDk5OmWe0dxFGXmZpZYAh`
- Project: `Final QA Portal` (key FQP) — `rvok162ahynkxtxs6z8iug5s`
- Guest project access: one `workspace_member_project` row for the guest.
- Guest requests must be enabled: project settings → General → `Accept guest requests`.

Recipes:

```sh
# sign up staff (onboarding: workspace name, "My team", first project, finish)
http://localhost:5173/auth/sign-up
# invite member: Members → "Invite member", All projects; invite link appears in the modal
# sign up the invitee: open the invitation link → Create account → Join workspace
# invite a guest: Members → "Invite guest" (role=guest), Selected projects → the portal project

# the plain "Invite people" modal creates role=member; a guest invited that way must be promoted:
docker exec kaneo-dev-pg psql -U kaneo -d kaneo -c \
  "update workspace_member set role='guest' where user_id=(select id from \"user\" where email='finalqa-guest@test.local') and workspace_id='7MHHRlRPU2vLDk5OmWe0dxFGXmZpZYAh';"
```

## Browser sessions (one per role, stream visible while testing)

```sh
agent-browser --session e2e-kaneo-staff  --restore open http://localhost:5173/
agent-browser --session e2e-kaneo-member --restore open http://localhost:5173/
agent-browser --session e2e-kaneo-guest  --restore open http://localhost:5173/
agent-browser --session <name> stream status --json    # -> .data.port
# live viewer (serve the template once):
cp ~/.config/opencode/skills/e2e-browser-handoff/templates/stream-viewer.html /tmp/opencode/
(cd /tmp/opencode && python3 -m http.server 7332 --bind 0.0.0.0)
# open: http://localhost:7332/stream-viewer.html?port=<port>
```

Useful primitives: `snapshot`, `snapshot -i`, `click @ref`, `fill @ref "text"`,
`eval "<js>"` (read `aria-current`, `aria-pressed`, row counts, `scrollWidth - innerWidth`),
`set viewport 375 812` (mobile), `screenshot <path>`.

## Scenario script and what to assert

1. Guest `my-requests`: empty state, no summary (AC-06); `New request` → project, title, details, send.
2. Summary appears with server counts; chart only counts open requests (AC-01).
3. Chips: click a group, list filters, counts unchanged, `aria-pressed="true"`; `All` restores (AC-02, AC-03).
4. Owner intake list → request: `Mark reviewed` (status reads `Reviewed`) → `Approve` → `Start work` → `Mark delivered` (dialog note optional).
5. Guest page without reload shows `Awaiting your confirmation`; detail stepper has `aria-current="step"` on step 4 (AC-08, AC-09, AC-13).
6. Guest `Need feedback`: Confirm disabled until a note exists; after send the stepper returns to step 3 with the feedback note and no actions (AC-10).
7. Staff delivers again with a note → guest sees `Team delivered this request again: <note>`; no new request (AC-17).
8. Guest `Looks good, confirm` → one `You confirmed this request` entry, actions gone, counts update, no current step (AC-12).
9. Staff `Reject` with note → guest timeline ends at `Rejected`, note in activity (AC-11).
10. Task link: staff `Attach a task` (title/details/status/priority) → open the task on the board → set Assignee to the member → member starts work and delivers. Guest must not see `task_linked`, task title or assignee; only task counts (AC-18).
11. 375px: `set viewport 375 812`, portal and detail have no horizontal overflow (`scrollWidth - innerWidth === 0`), chips and stepper stack (AC-14).

## Pagination data (AC-07)

```sh
# 150 extra requests for the guest, numbers above 100 so they sort first
docker exec kaneo-dev-pg psql -U kaneo -d kaneo -c "insert into intake_request (id, project_id, number, title, description, status, created_by_id, requester_name, requester_email, source_type, created_at, updated_at) select 'seedqa'||g, 'rvok162ahynkxtxs6z8iug5s', 100+g, 'Seeded request '||g, 'Generated for pagination check', 'new', u.id, 'Final QA Guest', 'finalqa-guest@test.local', 'guest_portal', now() at time zone 'utc' - (g||' minutes')::interval, now() at time zone 'utc' - (g||' minutes')::interval from generate_series(1,150) g cross join (select id from \"user\" where email='finalqa-guest@test.local') u;"
# cleanup
docker exec kaneo-dev-pg psql -U kaneo -d kaneo -c "delete from intake_request where id like 'seedqa%';"
```

Expected: guest list renders 100 rows plus `Show all <total> requests`; after the click the row
count equals the total, the button disappears and the scroll position is unchanged.

## Gotchas

- Seeded rows get high numbers, so REQ-1..N are buried in the staff list; open the detail by id
  (`intake_request.id`) instead of scrolling.
- `Attach a task` has no assignee field (intake requests have no assignee by design); assignment
  happens on the task drawer/board.
- Staff surface labels guest actions as `Team` (`Team created this request`, `Team sent feedback`)
  because the shared activity copy only knows current user vs everyone else. Known follow-up.
- Summary counts can trail the list by one poll after a realtime delivery; they settle without a reload.
- Plannotator's default port 19432 can be held by another session; use `PLANNOTATOR_PORT=19433`.

## Evidence from the last run

`dogfood-output/guest-request-tracking-20261128/screenshots/` (01 workspace … 21 guest detail 375px),
summarised in `review/final-acceptance-report.md`.
