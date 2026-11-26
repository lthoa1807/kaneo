# Intake requests → Telegram project notifications — design spec

- **Status:** Draft (pending review)
- **Date:** 2026-11-26
- **Area:** API plugin layer, web project settings, i18n, docs, tests
- **Builds on:** `2026-11-24-intake-portal-design.md` (§11 notifications),
  Telegram plugin in `apps/api/src/plugins/telegram`
- **Terminology:** the requester is a **Guest** (role `guest`). The Telegram
  target is a **project integration**, not a workspace setting.

## 1. Intent

A team that already routes task activity into a Telegram group still has to
watch the app to notice a new guest request, because the Telegram plugin only
knows task events. Intake is the one queue where speed matters: a request that
sits unread for a day is a guest left without an answer.

This spec adds one thing: when a guest submits an intake request in a project
whose Telegram integration is connected and has the new event enabled, the
project's Telegram chat gets a message with the request title, number,
requester, and a link straight into the staff intake detail page.

Out of scope on purpose (section 10): status changes, other chat providers,
localized messages.

## 2. Decisions already made

These are not open questions; the plan is written against them.

1. **Reuse the existing Telegram integration.** No new integration type, no
   workspace-level bot, no second configuration surface. A project either has a
   connected Telegram integration or it does not.
2. **A dedicated plugin hook, not a task event.** Intake requests are a queue in
   front of the board; borrowing `task.created` would either lie about the
   payload or force every plugin to special-case it. `IntegrationPlugin` gains
   `onIntakeRequestCreated`.
3. **New event key `intakeRequestCreated`, default `true`.** It mirrors
   `taskCreated: true`: a chat that already announces new tasks wants to hear
   about new requests. `normalizeTelegramConfig` fills the missing key from the
   defaults, so existing connected integrations start sending intake messages
   without being re-saved — that behaviour change is intended and must be in the
   PR description.
4. **Only `created` in this phase.** Rejections and deliveries already reach the
   guest by mail and in-app; staff hearing about guest replies is a separate,
   smaller follow-up (section 11).
5. **The message is English**, like every other Telegram message in the plugin.
   Plugin copy is not localized today; inventing localization for one line
   would be the only localized message in the file.
6. **Dispatch reuses the existing event bus.** `intake_request.created` is
   already published by `create-intake-request.ts`; the registry subscribes and
   broadcasts to active integrations of that project. Same fire-and-forget
   semantics as tasks: a Telegram failure logs and never blocks the request.
7. **The link points at the staff detail page**
   `/dashboard/workspace/{workspaceId}/project/{projectId}/intake/{requestId}`,
   not at the guest portal: the reader is staff.

## 3. Event payload

`intake_request.created` already carries the whole row plus `currentUserId`
(see `apps/api/src/intake/controllers/create-intake-request.ts`). The hook takes
what the message needs and nothing else:

```ts
export type IntakeRequestCreatedEvent = {
  requestId: string;
  projectId: string;
  number: number;
  title: string;
  status: string;
  sourceType: string;
  requesterName: string | null;
  requesterEmail: string | null;
  createdById: string;
};
```

`projectId` bounds the fan-out: only integrations of that project fire. The
requester fields come from the row itself — no extra user lookup, and they
survive the future API-key channel where `createdById` is an integration user
and the human is only in `requesterName`/`requesterEmail`.

## 4. Message

Plain HTML, escaped, following the existing `sendTelegramMessage` conventions
(`parse_mode: "HTML"`, `message_thread_id` for forum topics):

```
New intake request
<the title>

Request:    REQ-3 Dashboard CSV export fails on large workspaces   (linked)
Requester:  Guest One (guest@example.com)
Project:    UAT Project 1
Status:     New
```

Rules:

- Title truncated to 120 characters, newlines collapsed, HTML-escaped — a guest
  writes this text and it must not be able to inject markup.
- Requester shows `name (email)`, or whichever of the two exists, or `a guest`.
  The email is included because staff need a way to answer outside Kaneo; it is
  data the same staff already see in the intake detail page.
- The link is omitted when `KANEO_CLIENT_URL` is unset or does not parse, and the
  request label then renders unlinked. No link is ever built from a request
  field.
- `Status:` is `New` for this event; it is printed rather than hardcoded so the
  same builder can serve later events.

## 5. Where the code goes

| File | Change |
| --- | --- |
| `apps/api/src/plugins/types.ts` | `IntakeRequestCreatedEvent`, `IntakeRequestEventHandler`, `onIntakeRequestCreated?` |
| `apps/api/src/plugins/registry.ts` | `broadcastIntakeRequestCreated(event)`, plus a `subscribeToEvent("intake_request.created")` block in `initializeEventSubscriptions()` |
| `apps/api/src/plugins/telegram/config.ts` | event key `intakeRequestCreated`, default `true` |
| `apps/api/src/plugins/telegram/events.ts` | `handleIntakeRequestCreated` + the intake URL helper |
| `apps/api/src/plugins/telegram/index.ts` | register the handler |
| `apps/web/src/components/project/integrations/chat-webhook/chat-events.ts` | telegram-only extra checklist item (section 6) |
| `apps/web/src/components/project/integrations/telegram/*` | carry `intakeRequestCreated` through form values and the request body |
| `i18n/en-US.json` | `settings:chatIntegrations.events.intakeRequestCreated` |
| `apps/docs/core/functional/guest-requests.mdx` | one paragraph: who hears about a new request, and that Telegram must be connected per project |

The handler mirrors the existing task handlers: validate config → check the
event flag → one query joining project and workspace → post. It does not touch
`intake_request` state and writes no activity row: the request was already
created before the notification is dispatched.

## 6. Web settings UI

`CHAT_EVENT_ITEMS` is shared by Telegram **and** the generic chat webhook, whose
backend has no intake handler. Adding the item to the shared list would offer a
toggle that does nothing. Instead:

- `chat-events.ts` gains `TELEGRAM_EVENT_ITEMS = [...CHAT_EVENT_ITEMS,
  { id: "intakeRequestCreated", labelKey: "settings:chatIntegrations.events.intakeRequestCreated" }]`
  and `TelegramEvents = ChatEvents & { intakeRequestCreated?: boolean }`.
- The Telegram settings form passes `TELEGRAM_EVENT_ITEMS` and defaults the new
  key from the loaded config; the request builder sends it like the others.
- The generic webhook keeps `CHAT_EVENT_ITEMS`, so its UI is unchanged.

Existing Telegram integrations without the key show the toggle **on** (the
server default), and saving the form writes it explicitly.

## 7. i18n

One key, English source, propagated to all locales with
`pnpm i18n:check:fix`:

```json
"intakeRequestCreated": "Guest request received"
```

Notification copy for the in-app channel is untouched: this feature only sends
Telegram messages.

## 8. Tests

1. **API integration** (new case, existing outbound-mock pattern):
   - a project with a connected Telegram integration and the flag on, when a
     guest creates a request, produces exactly one outbound Telegram POST whose
     body contains the request number, the title and the intake detail URL;
   - with the flag off, no POST is made;
   - the request itself still succeeds when the Telegram call throws (failure is
     logged, not propagated).
2. **Web** (`telegram-integration-settings.test.tsx`): the checklist shows the
   new item for Telegram, and saving sends `events.intakeRequestCreated`;
   `chat-webhook-settings.test.tsx` proves the generic webhook did **not** gain
   the item.
3. **Config** (`plugins/telegram/config.ts` has no test today): a stored config
   without the key normalizes to `true`.

## 9. Edge cases

- Integration inactive/archived: `getActiveIntegrations()` already filters, so
  nothing is sent.
- Invalid stored config: logged with the hashed target identifier, no throw —
  same as task handlers.
- Project archived: no new requests can be created there, so no message.
- Request created through a future API-key channel: same hook, `Requester`
  comes from the requester fields; nothing in this spec assumes a human
  `createdById`.
- Rate: one message per request, no digest, no retry. A flood of requests means
  a flood of messages, exactly as a flood of tasks does today.

## 10. Out of scope

- Intake **status** changes to Telegram (`rejected`, `delivered`, guest replies).
- Slack, Mattermost, Discord, Teams and the generic webhook.
- Localized message text.
- Retries, batching or digests.
- Any change to the in-app, email or ntfy channels.

## 11. Later, in the order they are worth doing

1. **Guest replies and closures to Telegram** — the same hook shape
   (`onIntakeRequestStatusChanged`), so a group that triages from the chat sees
   "needs revision" without opening Kaneo.
2. **Auto-close a delivered request nobody confirms** — needs
   `intake_request.delivered_at`, a scheduled job under
   `apps/api/src/scheduler/` (leader lock already exists) writing
   `confirmed_via = 'timeout'`, and one new notification type. Separate spec.
3. **Generic webhook intake events** — cheap once the hook exists, but no
   requester has asked for it.
