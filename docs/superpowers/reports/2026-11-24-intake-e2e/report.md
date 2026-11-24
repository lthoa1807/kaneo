# Intake portal — end-to-end run, 2026-11-24

Branch `feature/intake-portal`, first commit of the run `1e1a5508`.
Environment: local dev (API `http://localhost:1337`, web `http://localhost:5173`,
Postgres in `kaneo-dev-pg`). Driven with `agent-browser` in two browser sessions,
one per account, so the guest and staff sides stay independent.

Accounts: `e2e-staff@test.local` (owner of workspace "E2E Intake", project
"Portal E2E"), `e2e-guest@test.local` (guest, selected-project access to
"Portal E2E"). Nothing from production was used.

## What the run covered

1. Staff signs up, creates a workspace and a project.
2. Staff turns on **Accept guest requests** in project settings.
3. Staff invites a guest through **Invite guest**, with "Selected projects".
4. Guest accepts the invitation, lands in the portal, files a request.
5. Staff triages → approves → attaches a task → starts work → delivers.
6. Guest sees the delivery and confirms it.
7. Second request follows the reject path with a written reason.
8. Authorization probe: the guest opens the project board directly.

## Result

Both paths completed. Six defects turned up and were fixed in this branch; a few
smaller wording and layout issues are listed at the end and left for a follow-up.

| Step | Expected | Observed |
| --- | --- | --- |
| Guest files a request | Appears in "My requests" as New | Yes — `16-guest-request-created.png` |
| Staff sees it | "Needs triage" group in the project Intake tab | Yes — `17-staff-intake-list.png` |
| Triage | New → Triaged, activity line added | Yes — `20-staff-request-triaged.png` |
| Approve | Approved, actions become Start work / Attach task | Yes — `21-staff-request-approved.png` |
| Attach task | Task created from the request text, linked to it | Yes — `22-attach-task-dialog.png`, `23-request-task-linked.png` |
| Start work / Deliver | In progress → Delivered | Yes — `24-staff-request-delivered.png` |
| Guest confirms | Delivered → Confirmed | Yes — `27-guest-request-confirmed.png` |
| Reject with a note | Rejected, note visible to the guest | Yes — `29-reject-note-dialog.png`, `31-guest-rejected-detail.png` |
| Guest opens the board | Blocked, no task data | Blocked — `32-guest-board-blocked.png` |
| Members table | Guest row marked Guest, project count | Yes — `33-members-guest-badge.png` |

## Defects found and fixed

Each one was seen in the browser first, then fixed, then re-checked in the same
session.

### 1. The intake switch could not be turned on in practice — `02a20be5`

The project settings screen reads the board payload (`GET /task/tasks/:projectId`),
which listed its fields by hand and had no `intakeEnabled`. So the switch always
rendered off, and turning it on wrote the column but the refetch put it back to
off. Evidence: `04-intake-switch-off.png` (before), `05-intake-switch-on.png`
(after the click), `06-intake-switch-persisted.png` (after a reload, now on).
Fixed by returning `intakeEnabled` from that payload and declaring it in
`boardSchema`; an integration assertion covers it.

### 2. A guest could not reach the portal at all — `90152de4`

After accepting the invitation the guest landed on the staff home dashboard with
an almost empty sidebar. `/organization/list` returns nothing for a guest (the
guest role deliberately has no `workspace:read`), so `useActiveWorkspace()` had
no workspace and every guest surface stayed shut. Evidence:
`13-guest-lands-on-home.png`. Fixed by falling back to the workspace id the route
already carries; `14-guest-portal-empty.png` shows the portal after the fix.

### 3. The Intake tab bounced to the board on a hard load — `fe20306b`

`IntakeAccessGate` navigated away on its first render, before membership and
capabilities had answered. Clicking the tab worked (capabilities were cached);
opening or reloading the URL did not. Evidence: `18-intake-tab-bounces.png`.
The gate now waits for `ready` before it can redirect.

### 4. Request details never rendered — `05e22afa`

`intake.$requestId_.tsx` and `requests.$requestId_.tsx` were nested under
`intake.tsx` / `requests.tsx`, which render no `<Outlet/>`. Opening a request
changed the URL and kept the list on screen. Fixed by moving the lists to index
routes and leaving the details flat; `19-staff-request-detail.png` and
`26-guest-request-detail.png` are the same steps after the fix.

### 5. Every new request claimed one task — `53ca6ee0`

`count()` counted the null row of the left join, so a request with no task still
read "0 of 1 tasks done" (`16-guest-request-created.png`). Now counts
`task.id`; the same request shows no progress until a task exists.

### 6. A rejection reason was invisible to the guest — `25647d7d`

The reject dialog stores the note on the `status_changed` activity, but the
activity list only printed "New → Rejected" and dropped the content
(`30-guest-sees-rejected.png`). The note now renders under the status line —
`31-guest-rejected-detail.png`.

## Smaller issues, not fixed

- Guest sidebar still offers **Search** and an empty **Projects** group, and the
  workspace switcher has no label (the guest has no workspace name to show).
  Visible in `14-guest-portal-empty.png`.
- **Invite guest** disables "All projects" with the text "Your own access is
  limited, so you can only give access to selected projects." That reason is
  about the inviter, not about the guest, and reads wrong for an owner.
  `08-invite-guest-dialog.png`.
- The linked task shows its bare number (`6 · Add a dark-mode toggle…`) instead
  of the project key (`PE-6`). `23-request-task-linked.png`.
- The blocked board says "You don't have access to this project" although the
  guest does have project access; what is missing is task read.
  `32-guest-board-blocked.png`.
- The Attach task dialog lists the status as the raw value `to-do` rather than
  the board's label. `22-attach-task-dialog.png`.

## Screenshots

33 files in `screenshots/`, in the order the run happened: `01` landing, `02-04`
sign-up and the first project, `04-06` the intake switch, `07-10` the guest
invitation, `11-16` the guest side, `17-24` the staff side, `25-27` confirmation,
`28-31` rejection, `32-33` the authorization probe and the members table.

## What this run did not check

Runs on a phone or a second browser, notifications and email, the standalone
portal URL (planned for phase 5), and the mobile app. Typecheck and the full
integration suite are left to Fork CI.
