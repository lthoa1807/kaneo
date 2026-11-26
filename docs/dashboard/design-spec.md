# Kaneo Dashboard — Design Specification (Phase 2)

> Phase: 2 – UI/UX Design and Prototype
> Status: Implemented (Phase 3–5, `feature/ui-development`); awaiting final review.
> Prototype: `docs/dashboard/prototype/overview.html` (fixture data, no dependency)
> Reference implementation: Phase 3 uses existing Kaneo components only.

## 1. Visual direction

"Quiet data." The page is read, not operated. Numbers carry the hierarchy;
chrome stays out of the way.

- Same shell as the rest of Kaneo: sidebar, `SidebarInset`, page title block.
- Cards use the existing `card` surface, 1 px `--border`, `--radius` (0.625 rem).
- One decorative layer, borrowed from Dusk: a fixed afterglow behind the page
  (cool glow left, warm glow right, both from `--info`/`--warning` via
  `color-mix`) with a 48 s drift, disabled under `prefers-reduced-motion`.
  Gradients are light, never a surface: cards keep an opaque-enough glass fill
  (`color-mix(card 72–84%)`) so text contrast does not depend on the glow.
  The layer is `aria-hidden`, `pointer-events: none` and has no layout cost.
- No illustration, no oversized hero, no per-widget shadows.
- Density: one screen at 1440×900 shows all count widgets plus the top of the
  project list, with page scroll only for the lists.

## 2. Tokens (existing only)

| Purpose | Token |
| --- | --- |
| Page / card surface | `--background`, `--card`, `--card-foreground` |
| Body / secondary text | `--foreground`, `--muted-foreground` |
| Hairlines | `--border` |
| Overdue / urgent | `--destructive` |
| Due soon | `--warning` |
| Unassigned | `--info` |
| Progress fill | `--primary` (single series, so one color, not 1–5) |
| Focus | `--ring` |
| Skeleton | `--muted` |

Light, `.dark` and `[data-palette="modern"]` already define all of these; the
Dashboard adds no color. Urgency is never color-only: the label states it.
The modern palette is the intended look (owner review, 2026-11-26); the
prototype opens in it, and the default palette stays supported, not default.

## 3. Typography

| Role | Size / weight | Notes |
| --- | --- | --- |
| Page title | 20 px / 600 | `h1`, one per page |
| Card title | 14 px / 600 | `h2` |
| Metric value | 28 px / 600, `font-variant-numeric: tabular-nums` | the focal element |
| Metric label | 12 px / 500, `--muted-foreground` | |
| List row text | 14 px / 500 | project name |
| Meta / hint | 12 px / 400, `--muted-foreground` | window, caps, definitions |

Font: Geist Variable with the existing system fallback. No new font.

## 4. Layout

```
[ page header: h1 "Overview" · workspace name · prototype note ]

[ 4 tiles ]                         grid: 1 / 2 / 4 columns
[ deadline risk (2 cols) ][ unassigned (1 col) ]
[ priority donut ][ due-load columns ][ project bars ]
[ intake queue: waiting | in progress ]
```

- Container: same max width and horizontal padding as Home (`Layout` inset).
- Gap: 16 px mobile, 20 px ≥ 768 px, 24 px ≥ 1280 px.
- Tile min height 96 px; card padding 16/20 px.
- Chart row: equal cards, 268 px minimum, so it wraps 3 → 2 → 1 without
  reordering. The donut card may be taller than the bars card; `align-items:
  start` keeps their tops aligned.

## 5. Widget visuals

| Widget | Visual | Empty / zero |
| --- | --- | --- |
| Project / member / my-open / my-overdue tiles | label above, value below; `my-overdue` value uses `--destructive` only when > 0 | `0` in normal foreground |
| Deadline risk | two labeled counts; a 4 px stacked bar showing overdue vs due-soon share; hint "Open tasks only · urgent = high or urgent priority" | bar hidden at 0/0 |
| Unassigned | single tile, value + "needs an owner" meta | `0` |
| By priority | 124 px donut (16 px stroke, 2 px segment gap) with total in the middle; legend rows on the right: swatch, label, count, share, so the percentage is visible without hovering (touch has no hover). Segments use urgency tokens, not a new palette | full ring in `--muted` if no open tasks |
| Due load | 7 equal columns, 68 px plot area, 4 px top radius, count above, weekday below; today's label is bold and marked `aria-current="date"`; columns with an urgent majority use `--warning` | zero columns keep a 2 px `--border` stub |
| Open by project | horizontal bars scaled to the busiest project; project name, count, bar; no percentage, because the value is a workload not a share | "No open tasks" |
| Intake queue | two groups ("Waiting", "In progress") side by side; row = title, then a **project chip** plus `REQ-n · from requester`, age right-aligned; the project is a chip, never buried in the meta string | "No intake requests in this group." |

Progress bars: the project load bar is a `<span>` track with an inner
`<span>` fill sized to the busiest project (`--muted` track, `--primary` fill,
6 px tall, radius 999 px). The whole row is a native `<button>` whose
`aria-label` states project and count, and the count is also visible text, so
the platform announces the value once. No animation on load; values are state,
not entrance.

Charts are SVG/CSS only: one `<svg>` for the donut, CSS grid for the columns,
`<progress>` for the project load. No chart dependency, no canvas, no
animation. The donut is `aria-hidden`; its legend carries every value and is
the click target, so no information lives only in geometry.

### Drilldown panel

- One native `<dialog>`, `width: min(640px, 92vw)`, `max-height: 82dvh`,
  header and footer sticky, body scrolls. Esc and a click on the backdrop both
  close it; the backdrop click is handled in JS because the platform does not
  close a `showModal()` dialog on it.
- Header: `h2` = the widget's label (e.g. "Overdue and urgent"), one line of
  definition copy ("Open tasks past their due date with high or urgent
  priority."), close button.
- Body: task rows, 10 px vertical padding, title + key/project/assignee on the
  left, priority pill and relative due date on the right. Ordered by due date
  ascending, no-due-date last.
- A row opens its task on the project board (`?taskId=`), the same surface
  search results use; the row handles the pointer and the task title is a
  `<button>` so the action is also reachable from the keyboard.
- Footer: only "Showing the first 50 of N." when the bucket is capped. No
  "Open in Tasks" link: My Tasks is assignment-scoped and no other view accepts
  these task filters.
- Empty: centred "No tasks match this filter right now." — never a blank panel.
- Over 50 rows: footer adds "Showing the first 50 of N." The total is always
  the exact count from the endpoint.
- Rows use a pointer cursor and a `--accent` hover background; the trigger's
  focus ring is 2 px `--ring` at 3 px offset.

## 6. States

- **Skeleton:** same grid; tile blocks 96 px, list rows 40 px, no shimmer
  movement beyond the existing `animate-skeleton` (already reduced-motion
  aware).
- **Widget error:** border stays, content replaced by "Couldn't load" and a
  text Retry button. Sibling widgets unaffected.
- **Guest:** never reaches the page from nav; direct URL shows the error card,
  no zeros.
- **Prototype:** a fixed note at the top: "Prototype · fixture data" so a
  screenshot can never be mistaken for production numbers.

## 7. Responsive

| Breakpoint | Change |
| --- | --- |
| < 640 | 1 column; tiles stack; risk counts stack vertically; charts stack; donut centres and its legend goes full width |
| 640–1023 | 2 columns; tiles 2×2; risk spans 2, unassigned spans 2; chart row 2 + 1 |
| 1024–1279 | 4 tiles / row; risk 2 + unassigned 2; three charts in one row |
| ≥ 1280 | risk 3 + unassigned 1 (or 2+2); lists use full width |

At 320 px: no horizontal scroll, labels wrap, values stay on one line. The
7-column due-load chart never drops below 5 columns of legibility; below that
the card switches to the same 7 rows as a list instead of shrinking columns.

## 8. Component inventory

| Prototype element | Phase 3 implementation |
| --- | --- |
| page shell | existing `Layout`, `SidebarInset` |
| page header | `PageTitle` + local header |
| tiles | `card` + local `MetricTile` |
| risk card | `card` + local `DeadlineRisk` |
| priority donut | local `PriorityDonut` (SVG, legend buttons) |
| due-load columns | local `DueLoadChart` (CSS grid of buttons) |
| project load bars | local `ProjectLoadChart` (progress bars) |
| intake queue | local `IntakeQueue`; rows are links, not drill triggers; the footer links to the workspace-wide intake list (`/dashboard/workspace/$workspaceId/intake`) |
| drilldown | local `TaskDrilldown` wrapping a native `<dialog>`; its own table rows (title, ticket, project, assignee, priority, relative due) |
| lists | local list rows; `empty` primitive for empty states |
| skeleton | `skeleton` primitive |
| retry | `button` primitive |

No primitive is modified. Nothing from Astryx; no chart library.

## 9. Accessibility checklist

- [x] one `h1`, `h2` per card
- [x] value visible as text next to every bar
- [x] tabular numbers, no layout jump on poll
- [x] urgency in words, not color alone
- [x] every drill trigger is a real `<button>` with a visible label
- [x] donut geometry is `aria-hidden`; the legend carries all values
- [x] dialog has `aria-labelledby` → its `h2`, no `role="dialog"` or focus trap
- [x] Esc and a backdrop click both close the dialog
- [x] drilldown rows open the task from the keyboard, not only the mouse
- [x] focus returns to the triggering widget when the dialog closes (browser)
- [x] focus ring on every interactive element, not just Retry
- [x] contrast ≥ 4.5:1 in light, dark, modern for text; ≥ 3:1 for bars (visual check)
- [x] no horizontal scroll at 320 px
- [x] `prefers-reduced-motion`: no new motion to disable

## 10. Review checklist (Gate 2)

1. Reads as Kaneo, not as a generic analytics template.
2. The four risk numbers are the first thing the eye lands on.
3. The three charts add a different reading, not repetition of the tiles.
4. Clicking a number, slice, column or bar shows the tasks behind it.
5. Empty, zero and truncated drilldown states look intentional.
6. Dark and modern palettes still hold hierarchy.
7. Nothing on the page suggests data Kaneo does not have.

## 11. Deferred tool adoption (owner instruction, 2026-11-26)

All three repositories stay on the roadmap; none is dropped.

| Repo | When | How |
| --- | --- | --- |
| Modern Web Guidance | now and every UI change | Applied to this prototype (native `<progress>`, responsive grid). Keep using it for layout, CSS and client-side JS before writing ad-hoc code. |
| Hallmark | Gate 2 design review, Phase 6 visual QA | Advisory audit for generic AI patterns; must not override approved decisions in this spec. |
| Astryx | after v1, or earlier on explicit approval | Before naming a component, use Hallmark (UX quality) and Modern Web Guidance (platform/a11y fit) to decide **which** Astryx component is worth adopting. Then name it and get the dependency decision approved. |

Astryx is the only one that changes runtime dependencies. Its chart packages
are still `@canary` only, so a chart would need an explicit exception even
after adoption. Until then the Dashboard stays on SVG/CSS and existing
primitives.
