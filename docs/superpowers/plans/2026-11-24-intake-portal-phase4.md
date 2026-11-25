# Intake portal — phase 4: notifications

## Goal

The one MVP item still unbuilt: section 11 of the design spec. Staff learn that
a guest filed or answered a request, and the guest learns that their request was
rejected, delivered, or reopened — without sitting on a page that polls.

Everything runs through the existing notification pipeline
(`persistNotification` → `dispatchNotification` → preference gate → email).
No new table, no new endpoint, no new preference surface.

## Scope

In (bold rows of the spec's matrix):

| Event | Recipients | Channel |
| --- | --- | --- |
| request created by a guest | workspace members holding `intakeRequest:manage` with access to the project | in-app |
| status → `rejected` / `delivered` | the requester (`createdById`) | in-app + email (transactional) |
| guest requests a revision / confirms | the same staff group | in-app |

Out: reminders for requests sitting in `new` (scheduler work), per-event
preferences for guests (they get transactional mail only), any WebSocket change
(spec section 10 keeps intake on polling).

## Constraints

- Guests hold no `workspace:read` and no `task:read`. Today
  `canReceiveResourceNotification` requires `workspace:read` for any non-`task`
  resource, so every intake notification would be silently dropped. The
  `intake_request` branch must require `intakeRequest: ["read"]` instead, and
  must resolve the workspace from the request's project.
- `notificationResourceAccess` decides existence *and* visibility. One branch
  for `intake_request`: the reader is a member of the request's workspace, has
  project access to the request's project, and the workspace is not archived.
- Recipients are computed, never trusted from the event payload. The event
  carries ids only.
- A guest must never receive a notification about another guest's request, and
  must never receive one for a status it cannot see (anything except the three
  guest-facing transitions).
- Staff recipients exclude the actor who caused the event.
- Copy lives in `i18n/*.json` under `notifications.events.*`, like every other
  event: 20 locales, `pnpm i18n:check` enforces parity.

## Task 1 — access for an intake resource

Test first: `tests/api-integration/intake-notification-access.test.ts`

- [x] A guest with project access can be given a notification whose
      `resourceType` is `intake_request` and `resourceId` is their own request.
- [x] A guest cannot be given a notification for another guest's request.
- [x] A staff member without project access cannot be given one.
- [x] A guest reading `GET /notification` sees only their own intake row.

Then:

- [x] `apps/api/src/notification/resource-access.ts`: add the
      `intake_request` branch to `notificationResourceAccess` (join
      `intake_request` → `project` → `workspace_member`, plus
      `projectAccessCondition`).
- [x] `canReceiveResourceNotification`: resolve `workspaceId` for
      `intake_request` in the existing `CASE`, and require
      `{ intakeRequest: ["read"] }` instead of `{ workspace: ["read"] }`.
- [x] Commit: `feat(api): let intake requests carry notifications`.

## Task 2 — who gets one

Test first: unit test beside the helper,
`apps/api/src/intake/shared/intake-notification-recipients.test.ts`

- [x] Managers of the project's workspace with `intakeRequest:manage` are
      returned; a member without that permission, a guest, and the actor are
      not.
- [x] A manager without project access is not returned.

Then:

- [x] `apps/api/src/intake/shared/intake-notification-recipients.ts`:
      `staffRecipientsForIntake({ projectId, workspaceId, excludeUserId })` —
      one query over membership + roles + `projectAccessCondition`, reusing the
      permission-check helpers the intake routes already use.
- [x] Commit: `feat(api): find the staff who should hear about a request`.

## Task 3 — the three events

Test first: `tests/api-integration/intake-notifications.test.ts`

- [x] Guest creates a request → every manager has one unread `intake_request`
      notification; the guest has none.
- [x] Staff rejects it → the guest has one, the staff member does not.
- [x] Guest asks for a revision → managers have one; guest does not.
- [x] Staff delivering and the guest confirming produce exactly the rows above,
      once each (no duplicates when a transition is retried).

Then:

- [x] `apps/api/src/notification/index.ts`: three `subscribeToEvent` blocks, in
      the file's existing shape:
      `intake_request.created`, `intake_request.updated` (branch on the new
      status: `rejected`/`delivered` → owner; `needs_revision`/`confirmed` →
      staff), with `resourceType: "intake_request"`.
- [x] Publish the two missing events if they are not already there — the
      transition and create services publish `intake_request.created` /
      `intake_request.updated` with `fromStatus`, `toStatus`, `createdById`,
      `projectId`, `workspaceId`, `actorId`, `requestNumber`, `title`.
- [x] Commit: `feat(api): notify staff and guests about intake events`.

## Task 4 — copy in 21 locales

- [x] `notifications.events.intake_request_created`,
      `intake_request_status_changed`, `intake_request_guest_reply` in
      `i18n/en-US.json` (tab-indented, exact edits — never re-dump the file).
- [x] Run `pnpm i18n:check:fix`, then `pnpm i18n:schema`, then
      `pnpm i18n:check`.
- [x] `apps/api/src/notification-preferences/delivery-copy.ts`: map the three
      types to their bundle keys, including the status name from
      `intake.status.*` rather than a raw slug.
- [x] Commit: `feat(i18n): intake notification copy`.

## Task 5 — the guest's mail

- [x] `packages/email`: one template, `intake-status-changed`, in the style of
      the existing invitation mail (request title, new status, project name, a
      link to the request).
- [x] `apps/api/src/notification-preferences/delivery.ts`: intake types are
      transactional — sent regardless of preference rows, only when SMTP is
      configured and the recipient has an address. Record the reason in a
      comment; the portal has no preference UI for guests.
- [x] Test: with preferences all off, the guest status mail still resolves; the
      staff in-app row still respects preferences.
- [x] Commit: `feat(email): tell a guest when their request changes`.

## Task 6 — docs and the PR

- [x] `apps/docs/core/functional/account-notifications.mdx`: one paragraph
      naming the intake events, and which of them a guest receives.
- [x] `apps/docs/core/functional/guest-requests.mdx`: replace "There is no live
      push yet" with what the guest actually gets (mail on reject/deliver, the
      page refreshing on its own).
- [x] Update the PR body: notifications shipped, realtime still polling by
      design.
- [x] Commit: `docs: intake notifications`.

## Review focus

- The access branch decides existence and visibility. Getting it wrong leaks
  either a guest's request to staff who should not see the project, or drops
  every notification silently — both look like "nothing happened".
- Recipient computation must not include the actor, or every staff action
  notifies the person who took it.
- `canReceiveResourceNotification` also runs at delivery time for scheduled
  mail, so the `intake_request` branch must survive a recipient whose role
  changed after the row was written.
- Email must stay out of the loop when SMTP is unset — the local dev stack and
  most self-hosted trials have none.

## Gates

`vp check` on changed files, `tsc -p apps/api`, focused `vp test` for the new
files, integration suite for the two new files against `kaneo_test`, and
`pnpm openapi:check` (no route change expected; regenerate if the event payloads
leak into a schema). `apps/web` typecheck stays in CI.
