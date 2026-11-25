# UAT smoke test — intake branch, 2026-11-25

Second run, this time against the image built from `feature/intake-notifications`
so the phase 4 notification work (design spec section 11) is actually in the
binary under test.

## Environment

| | |
| --- | --- |
| Image | `ghcr.io/lthoa1807/kaneo-fork:uat-intake` |
| Source | branch `feature/intake-notifications` @ `bb00a263182e` |
| Build | CI `fork-images.yml` run [45571945750](https://github.com/lthoa1807/kaneo/actions/runs/45571945750), success in 5m32s |
| Stack | compose project `kaneo-uat`, port 5174, database kept from the previous run (600 tasks, 8 projects) |
| Delegated | database under test is the seeded prod-like dataset, not production |

Deployed with `scripts/stack/up.sh uat <image>` — this was also the first
re-deploy on top of an existing database, and the entrypoint re-ran the
migrations cleanly (`✅ Database migrated successfully!`, `API is ready`, no
schema loss: 600 tasks still present afterwards).

## Result: pass, and phase 4 works

| Step | Result | Evidence |
| --- | --- | --- |
| Project settings → **Accept guest requests** | pass | PUT `/api/project/<id>` 200, `intake_enabled = t` |
| Invite guest from Members | pass | invitation `pending`, `project_access=selected`, `project_ids={project 1}` |
| Guest signs up from the invite link and joins | pass | lands on **My requests**, sidebar has only My requests and Settings |
| Guest sees only the invited project in the picker | pass | one option, `UAT Project 1` |
| Guest submits REQ-1 | pass | `intake_request` number 1, status `new` |
| **Staff notified on create** | pass | `intake_request_created` ×4 (uat1–uat4), guest 0 rows |
| Staff rejects REQ-1 with a note | pass | activity `New → Rejected` + note, guest reads the note |
| **Guest notified on reject** | pass | `intake_request_status_changed` to the requester only, staff 0 rows |
| Approve → Start work | pass | statuses `approved` → `in_progress`, activity lines correct |
| Attach task | pass | task `u1-76` created and linked, guest sees "0 of 1 tasks done" |
| Mark delivered | pass | guest gets a second `intake_request_status_changed` |
| **Guest confirms → staff notified** | pass | `intake_request_guest_reply` ×4 at confirm, guest 0 rows |
| Guest cannot reach the board | pass | page says "You don't have access to this project", `GET /api/task/tasks/<project>` 403 |
| Guest request list is scoped | pass | `total=2`, only REQ-1 and REQ-2 |

### Copy actually rendered

| Where | String |
| --- | --- |
| Staff inbox, request created | "New request from a guest — Export the board as CSV was submitted" |
| Staff inbox, guest acted | "Guest replied to a request — Add a dark mode toggle to the board is now Confirmed" |
| Guest inbox | "Request status changed — Export the board as CSV is now Rejected" |

The status name comes from `intake.status.*`, not a raw slug, as the plan asked.

## Findings

1. **Signing in as an invited guest lands on `/onboarding`, not on their
   workspace.** The guest already is a `workspace_member` with role `guest`
   (verified in the DB), yet a fresh sign-in shows "This is where your projects
   live… Workspace name / Continue", which invites them to create a second
   workspace. Navigating to `/dashboard/workspace/<id>/my-requests` by hand works
   and shows their requests. Worth a ticket: the redirect should go to the guest's
   workspace, or straight to My requests.

2. **Project settings autosave is silently blocked by form validation.** This is
   not a regression from the branch — it reproduces identically on the `main`
   image — and the cause is the seeded data: slugs like `uat-project-1` exceed
   `slug.max(8)` in `create-project-form-schema.ts`, so `form.trigger()` fails and
   the debounced save never fires. With a valid slug (`u1`) the toggle saved
   immediately. Two follow-ups: the seed now uses short slugs
   (`scripts/stack/seed-uat.sql`), and the UI could say why nothing is being
   saved when the form is invalid — right now it looks like a dead switch.

3. Notification rows are written with an empty `title`/`content`; the copy is
   resolved client-side from the event. Fine for the inbox, but anything that
   reads notifications server-side (digest mail, exports) will see blanks.

## Not covered

- Revision path (`Delivered → Needs revision`): only the confirm edge was walked.
  Both edges use the same `intake_request_guest_reply` event, so the staff
  notification is expected to be identical, but it was not observed.
- Cross-guest isolation: needs a second guest; the API answers 404 for a request
  the caller did not send, and `tests/api-integration/intake-notification-access.test.ts`
  covers it, but it was not exercised through the UI here.
- Email to the guest (no SMTP in `.env.uat`) and the in-app polling refresh
  (~30 s) were not timed.
- Notification preferences off/on for staff intake rows, attachments, and
  intentional double-submit races.

## Screenshots

| File | Shows |
| --- | --- |
| `06-intake-settings.png` | project settings with Accept guest requests |
| `07-guest-request-confirmed.png` | guest's request page after confirming |
| `08-staff-inbox-intake.png` | staff inbox with both intake notifications |
| `09-guest-inbox.png` | guest inbox, reject and deliver rows |
| `10-guest-my-requests.png` | guest's request list, scoped to their two rows |
