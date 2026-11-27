# UI Spec: guest-request-tracking
Version: 14 | Status: DRAFT

## UI

### Screens / components

**Guest portal** (`GuestPortalPage`, dùng cho cả hai route):

```
Header: "My requests"                                   [New request]
Action banner (chỉ khi awaiting > 0)
┌ Overview ──────────────────────────────── 6 requests ┐
│   ◕ 4      ● Waiting for review         1   25%    │
│  active    ● In progress                 2   50%    │
│            ● Awaiting your confirmation  1   25%    │
│            ─────────────────────────────────────    │
│            All requests                  6          │
└─────────────────────────────────────────────────────┘
Rows: REQ-11  Title            [Waiting for review]   3 days ago
```

Header row (guest list header): `ID` · `Request` · `Project` · `Status` · `Received` — chỉ là nhãn cột, không có control lọc. Lọc theo cột là feature riêng.

Row anatomy (guest list, ≥640px): header là grid 5 cột, mỗi row là grid 5 cột cùng độ rộng; `<640px` header wrap 2 cột và row quay về flex wrap. Cột cuối là ngày ghi nhận (relative, "3 days ago"); updated time và task progress nằm ở detail, không hiện trong list. Không có cột người phụ trách: intake request không có assignee, guest chỉ thấy request của mình; detail ghi "Handled by the {project} team".

Thứ tự danh sách: request đang mở trước, `createdAt` cũ nhất trước (chờ lâu nhất ở trên); request `confirmed`/`rejected` xuống cuối, cũng cũ nhất trước. Count không phụ thuộc thứ tự.

### Màu trạng thái (một nguồn)

Legend swatch, donut segment và badge dùng cùng token cho cùng một nhãn:

| Nhóm / trạng thái | Token | Badge |
|---|---|---|
| Waiting for review | `--muted` | `new` outline, `triaged` outline (label "Waiting for review") |
| In progress | `--warning-fg` | `in_progress`/`needs_revision` warning, `approved` success |
| Awaiting your confirmation | `--info-fg` | `delivered` info |
| Completed / confirmed | `--success-fg` | `confirmed` success |
| Rejected | `--danger-fg` | `rejected` danger |

Không dùng màu khác nhau cho cùng một nhãn ở legend và row.

**Detail** (`GuestRequestDetail`):

```
[Back to my requests]
REQ-12  Title                                    [In progress]
Progress: Submitted — Received — In progress — Awaiting your confirmation — Completed
Description
2 of 3 tasks done
Activity
  You created this request                 3 days ago
  Team started working on this request     2 days ago
  Team delivered this request for your review  1 day ago
```

Activity của guest chỉ hiện loại entry guest-visible (`created`, `status_changed`, `revision_requested`, `confirmed`, `note_added`); `task_linked` là nội bộ, API đã lọc nên prototype không được hiện. Actor hiển thị ở mức vai trò: **You** nếu `userId` là chính guest, **Team** cho staff — không hiện tên/avatar staff. Câu chữ theo mục đích, không theo status gốc: "Team started working on this request", "Team delivered this request for your review", "You sent feedback: …", "Team delivered this request again: …", "You confirmed this request", "Team rejected this request: …".

### Components reused from the design system

| Component | Dùng cho |
|---|---|
| `Button` | New request, banner action, legend row, retry, confirm / need feedback |
| `Badge` | Status badge trên row và detail (giữ nguyên `IntakeStatusBadge`) |
| `Skeleton` | Loading summary + rows + detail |
| `Progress` (`IntakeProgress`) | Tiến độ task, giữ nguyên |
| `IntakeRequestList` | Danh sách row; guest thêm header + grid 5 cột, staff giữ flex hiện tại |
| `IntakeStatusBadge` | Status text + tone, giữ nguyên |
| `RequestNoteDialog` | Need feedback (note bắt buộc); staff reply khi deliver lại (note không bắt buộc) |

### New components (đề xuất cho S3)

| Component | Trách nhiệm | Props chính |
|---|---|---|
| `intake-groups.ts` | Một nguồn cho 3 nhóm đang mở + All: key, statuses, label key, thứ tự, hàm `matchesGroup(status)` | pure helper |
| `IntakeOverview` | Compose banner + summary card; ẩn khi không có request | `counts`, `selected`, `onSelect`, `onReview` |
| `IntakeActionBanner` | Callout khi `awaiting > 0`; action chọn nhóm awaiting | `count`, `onReview` |
| `IntakeSummaryCard` | Card `Overview` + hint tổng; chứa donut và legend | `counts`, `selected`, `onSelect` |
| `IntakeDonut` | SVG `stroke-dasharray`, r=42, stroke 14, 96px; `aria-hidden`; chỉ vẽ 3 nhóm đang mở | `counts` |
| `IntakeGroupLegend` | 4 button row: 3 nhóm + All; swatch/label/count/% cho nhóm, All không có % | `counts`, `selected`, `onSelect` |
| `IntakeShowAll` | Footer button khi còn trang chưa tải; gọi tải tiếp và append | `loaded`, `total`, `onLoadMore` |
| `IntakeStepper` | Stepper 5 bước + nhánh rejected/revision cho detail | `status` |
| `IntakeActivityList` (sửa) | Actor **You/Team** + câu chữ theo mục đích; hiện `content` của entry `status_changed` để feedback và phản hồi của staff đọc được; text thuần, giữ xuống dòng | `items`, `currentUserId` |

Không tạo abstraction chung cho "stat card"; count nằm trong button.

### Tham chiếu pattern đã triển khai (trang overview)

Guest summary **sao chép pattern** của dashboard, không refactor dashboard:

| Nguồn | Lấy gì |
|---|---|
| `apps/web/src/components/dashboard/priority-donut.tsx` | SVG r=42, `stroke-dasharray`/`stroke-dashoffset`, `rotate(-90 50 50)`, stroke-width 14, SVG `aria-hidden`, legend row là button có swatch + count + % |
| `apps/web/src/components/dashboard/widget-card.tsx` | card `rounded-xl border p-4`, header `h2 text-sm font-medium` + hint `text-xs text-muted-foreground` |
| `apps/web/src/components/dashboard/metric-tile.tsx` | count lớn `text-3xl tabular-nums` khi cần một con số đơn |

Không extract component dùng chung ngay: `PriorityDonut` đang phục vụ staff dashboard, đụng vào nó là rủi ro ngoài scope. Guest chỉ cần ~30 dòng SVG + legend; nếu sau này có widget thứ ba dùng donut thì mới tách.

### Data contract (UI cần từ API)

- List response thêm `counts: { all, waiting, in_progress, awaiting }`, tính trên cùng scope access + `projectId`, bỏ qua filter nhóm. Không có count cho request đã đóng; chart chỉ dùng 3 nhóm đang mở.
- `group: "all" | "waiting" | "in_progress" | "awaiting"`; `status` hiện có giữ nguyên cho staff.
- List order: request đang mở trước (`createdAt asc`), request `confirmed`/`rejected` sau (`createdAt asc`); sort ổn định, không đổi count.
- Không thêm field nhạy cảm; guest response vẫn không có task nội bộ. `taskCount`/`completedTaskCount` là hai field duy nhất về task mà guest nhận; `linkedTasks` chỉ có cho `manage` holder.

### "Show all requests"

Hiện trạng (đã kiểm tra code): API `limit` tối đa **100**, mặc định **20**; `GuestPortalPage` không truyền `limit` nên guest chỉ thấy **20 request** dù còn nữa. `total`/`totalPages` đã có trong response.

- Guest list truyền `limit=100`.
- Khi `items.length < total`, cuối danh sách có button "Show all {{total}} requests". Bấm → tải các trang tiếp theo (`page + 1`) và append cho tới khi đủ `total`; sau đó ẩn button.
- Không đổi count, không reset scroll, không thêm số trang / infinite scroll.
- Count vẫn là tổng server-side, kể cả khi chưa tải hết (BR-09).
- Prototype mô phỏng trang 4 row trên 6 row mẫu để thấy trạng thái button.

### States

| State | Treatment |
|---|---|
| Default | Legend row ghost, count và % `tabular-nums`; row hover `bg-accent/50` như hiện tại |
| Hover | Một tín hiệu: đổi nền chip/row, không đổi layout |
| Focus | `outline: 2px solid var(--ring); outline-offset: 2px`, hiện ngay |
| Selected | Legend row `secondary` + `aria-pressed="true"`; không dùng màu làm tín hiệu duy nhất |
| Disabled | Chỉ khi action đang chạy: `opacity`, `cursor`, native `disabled` cùng lúc |
| Loading | Skeleton summary card (donut + 3 legend row + All) + 4 row; stepper skeleton 1 dòng; không layout shift |
| Empty | Không summary; một dòng lý do + action "New request". Nhóm đang chọn không có request: "No requests in this group." |
| Error | Message + "Try again"; không hiện count cũ |
| Success | Count/list/detail cập nhật từ response; không toast |
| Showing all | Khi còn trang chưa tải: footer "Show all {{total}} requests"; đang tải: button disabled + label "Loading…"; tải xong: ẩn footer |

### Responsive behavior

- Container `max-w-3xl` (768px) → **nâng lên 960px (60rem)** cho cả list và detail; detail copy vẫn cap `64ch`.
- Summary card: <640px xếp dọc (donut trên, legend dưới, 1 cột); ≥640px donut trái, legend phải 2 cột. Donut 96px cố định.
- ≥640px: stepper ngang, connector giữa các bước; legend row giữ một hàng nếu đủ chỗ; list có header 5 cột và row grid cùng độ rộng cột.
- <640px: stepper dọc; legend row wrap nhiều hàng; list header wrap 2 cột, row flex wrap; count không bị cắt; row wrap thay vì mất metadata.
- Control height 32–40px, hit target ≥44px trên touch (dùng pattern `touch-hitbox` sẵn có nếu cần).
- Kiểm tra 375px; `overflow-x: clip` ở shell, không tạo scroll ngang.

### Design tokens

Dùng token hiện có trong `apps/web/src/index.css`; không thêm token mới nếu không cần.

| Vai trò | Token |
|---|---|
| Nền trang | `--background` |
| Chữ chính / phụ | `--foreground` / `--muted-foreground` |
| Viền, divider | `--border` |
| Bề mặt chip/row hover | `--accent`, `--secondary` |
| Primary action | `--primary` / `--primary-foreground` |
| Focus | `--ring` |
| Success / warning / info / destructive | `--success`, `--warning`, `--info`, `--destructive` + foreground tương ứng |
| Radius | `--radius` (0.625rem), `--radius-md`, `--radius-lg` |
| Font | `--font-sans` (Geist), `--font-mono` cho display ID |

Ưu tiên primary cho đúng một action mỗi màn hình: "New request" ở portal, "Looks good, confirm" ở detail khi `delivered`. Các action còn lại outline/ghost.

### Accessibility

- Legend là `<ul>`, mỗi nhóm là `<button type="button" aria-pressed>` có swatch `aria-hidden`; accessible name chứa nhãn + số ("In progress: 3 requests"). Donut là SVG `aria-hidden`; mọi con số và % nằm trong legend. "All requests" không có %.
- Banner là `<section>` có heading; action là button/link thật; không phải live region.
- Stepper là `<ol>`; bước hiện tại `aria-current="step"`; mỗi bước có text, không chỉ màu; `needs_revision` có ghi chú text; `rejected` có text riêng. Desktop: marker và label canh giữa trong cột, connector nối tâm các marker; `<640px`: stepper dọc, marker/label canh trái.
- Stepper màu: done = nền `--tint-success` + viền 1px `success` 50% + chữ `--success-fg`, weight 600, connector `success` 55%; current = nền `--accent-brand` + chữ `--accent-brand-fg` + ring 4px `accent-brand` 16%, weight 700; upcoming = nền `--surface-2`, chữ `--muted`; `confirmed` = cả 5 bước done; `rejected` = nền `--tint-danger` + chữ `--danger-fg`. Current phải đọc ra "đang ở đây", không bị nhầm là chưa tới.
- Không dời focus khi count đổi do poll; không announce mọi count.
- Contrast: text ≥4.5:1, non-text ≥3:1 ở cả light/dark; kiểm tra dark riêng.
- `prefers-reduced-motion: reduce`: bỏ transition chuyển động, giữ thay đổi màu/opacity.

### Astryx / dependency

- Project **không** dùng Astryx; feature này **không** thêm Astryx hay dependency nào.
- Lý do: primitive hiện có đã đủ (Button, Badge, Skeleton, Progress); thêm styling system thứ hai trái với `docs/dashboard/design-spec.md`.
- Nếu S3 phát hiện thiếu component cụ thể, phải nêu tên + lợi ích và xin duyệt dependency trước.

### Hallmark app-screen notes

- Shell, palette, font, radius, surface lấy từ hệ thống Kaneo; không deal theme mới.
- Density là thiết kế: row list, legend row, không card; một primary mỗi màn hình.
- Bốn trạng thái dữ liệu (loading, empty, error, full) đều được vẽ.
- Signature của màn hình là stepper + timeline, không phải hàng stat card.

## Change history

| Version | Date | Reason | Impact |
|---|---|---|---|
| 1 | 2026-11-27 | S2 từ requirement-spec đã duyệt | — |
| 2 | 2026-11-27 | Plannotator vòng 2 | Thêm `IntakeDistributionBar`; container 768 → 960; ghi rõ cap 100/20 và đề xuất Load more; xác nhận task progress chỉ là counts |
| 3 | 2026-11-27 | Plannotator vòng 3: theo pattern overview đã triển khai | Thay chip + bar bằng summary card + donut + legend row; thêm nhóm "Closed earlier"; detail có "Handled by the {project} team" |
| 4 | 2026-11-27 | Đồng bộ v3: bỏ `IntakeGroupFilter` thừa, "chip" → "legend row", nêu cách suy ra count "Closed earlier" | Không đổi thiết kế; chỉ sửa mô tả lệch với prototype |
| 5 | 2026-11-27 | Plannotator vòng 4: cột đều, header row, bỏ cột người | Guest list thành grid 6 cột + header; thêm cột Progress; bỏ avatar/tên (không có assignee trong data) |
| 6 | 2026-11-27 | Plannotator vòng 5: header row dùng để lọc | Thêm search + 4 select (project, status, progress, updated); AND với nhóm; count không đổi; production lọc server-side |
| 7 | 2026-11-27 | Change request: "Request changes" → **Need feedback**, vòng lặp trên cùng request | Note bắt buộc khi gửi feedback; staff reply không bắt buộc khi deliver lại; activity hiện note hai chiều; rich text chat tách feature riêng |
| 8 | 2026-11-27 | Plannotator vòng 6: canh giữa stepper, activity thiếu actor, "Task linked" khó hiểu | Stepper canh giữa ở desktop, trái ở mobile; activity dùng You/Team + câu chữ theo mục đích; bỏ `task_linked` khỏi bản guest |
| 9 | 2026-11-27 | Plannotator vòng 8: chart không đếm request đã xong, bỏ lọc cột, thêm Show all | Summary 3 nhóm + All (không %); header là nhãn cột; "Show all requests" tải tiếp; bỏ `closed` khỏi counts/query |
| 10 | 2026-11-27 | Plannotator vòng 9: màu stepper, cột ngày ghi nhận, màu status | Done success + current ring; cột Received thay Updated; order chờ lâu trước; legend khớp badge |
| 11 | 2026-11-27 | Plannotator vòng 10: nhãn Triaged, viền marker done | `triaged` → "Waiting for project review" + neutral; done marker border `success-fg`; cột Status rộng 10.5rem |
| 12 | 2026-11-27 | Plannotator vòng 11: marker 4/5 thiếu màu | Upcoming nền `surface-2`; confirmed cả 5 done; rejected danger fill |
| 13 | 2026-11-27 | Plannotator vòng 12: xanh đậm xấu | Done = tint success + viền mảnh; current = primary đặc + ring; rejected = tint danger; connector 55% |
| 14 | 2026-11-27 | Plannotator vòng 13: marker đen, cột Progress | Current = accent-brand; bỏ cột Progress (task progress chỉ ở detail); "Waiting for project review" → "Waiting for review" |
