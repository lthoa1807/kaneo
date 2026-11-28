# Implementation Plan: guest-request-tracking
Version: 1 | Status: DRAFT

## Technical solution overview

Guest portal (`/my-requests` và `/project/$projectId/requests`, cùng `GuestPortalPage`) nhận summary + nhóm lọc từ API list thay vì tự đếm item trên trang:

- **API** (`listIntakeRequests`): thêm `group` (`all|waiting|in_progress|awaiting`), trả `counts: {all, waiting, in_progress, awaiting}` trong cùng response, tính trên scope access + `projectId`, bỏ qua `group`/`status`; sắp xếp request đang mở trước (cũ nhất trước), request `confirmed`/`rejected` xuống cuối. Không migration, không bảng mới.
- **Web portal**: summary card vẽ donut từ `counts` (chỉ 3 nhóm đang mở), legend là 4 button lọc; danh sách 5 cột có cột Received; "Show all requests" tải thêm trang 100 và append. Nhóm đang chọn đi vào query `group`, count không đổi.
- **Web detail**: stepper 5 bước cho guest (nhánh `needs_revision`/`rejected`); activity đổi sang câu chữ theo mục đích với actor You/Team và hiện note hai chiều; nút "Need feedback" giữ vòng lặp trên cùng request; staff deliver lại mở dialog note không bắt buộc.

Không đụng schema DB, không thêm dependency, không đổi staff list/filter hiện có.

## Phase list
| Phase | Name | Depends on | Result |
|---|---|---|---|
| P1 | API counts, group filter, list order | - | List trả `counts`, lọc theo `group`, order mở-trước/đóng-sau; integration test |
| P2 | Guest portal summary, group filter, show all | P1 | Portal có donut + legend lọc, list 5 cột, "Show all requests" |
| P3 | Guest detail stepper, activity copy, Need feedback loop | - | Stepper đúng lifecycle, activity You/Team, vòng feedback + staff note |

P3 không phụ thuộc P1/P2 (chỉ đọc status đã có trong detail response).

---

## P1 - API counts, group filter, list order

### Objective

Một response list là nguồn duy nhất cho summary và danh sách: `counts` đúng trên scope, `group` lọc đúng nhóm, order đọc được "chờ lâu ở trên".

### Scope

`apps/api/src/intake/**`, `tests/api-integration/intake-list-and-detail.test.ts`, `apps/docs/openapi.json`

### Dependencies

Không.

### Tasks

- [ ] `apps/api/src/intake/intake-groups.ts`: map `waiting = [new, triaged]`, `in_progress = [approved, in_progress, needs_revision]`, `awaiting = [delivered]`; export type `IntakeGroup` và hàm `groupStatuses(group)`. Dùng chung cho filter; không thêm nhóm `confirmed`/`rejected`.
- [ ] `schema.ts`: thêm `group` vào `listIntakeRequestsQuery` (enum 4 giá trị, optional); giữ `status` cho staff.
- [ ] `controllers/list-intake-requests.ts`: tách `scopeWhere` (access + `projectId`) khỏi `where` (thêm `group` hoặc `status`). Counts: một query conditional aggregate trên `scopeWhere` (`count(*)`, `count(*) filter (where status in ...)`), bỏ qua `group`/`status`. Order: `case when status in ('confirmed','rejected') then 1 else 0 end asc, createdAt asc, number asc`.
- [ ] `response.ts`: `intakeRequestListSchema` thêm `counts: { all, waiting, in_progress, awaiting }` (z.number); mô tả ngắn gọn scope + bỏ qua filter.
- [ ] `pnpm openapi:check:fix` để cập nhật `apps/docs/openapi.json`.
- [ ] Integration test: guest có request ở cả 3 nhóm + 2 request đã đóng → `counts` đúng, `total`/`items` khớp, `group=awaiting` chỉ trả `delivered`, count không đổi khi đổi `group`, order mở trước/đóng sau, `projectId` scope đúng.
- [ ] Integration test: manage holder thấy counts toàn project accessible; `status` filter cũ vẫn hoạt động.

### Expected Files

- `apps/api/src/intake/intake-groups.ts` (new)
- `apps/api/src/intake/schema.ts`
- `apps/api/src/intake/controllers/list-intake-requests.ts`
- `apps/api/src/intake/response.ts`
- `apps/docs/openapi.json`
- `tests/api-integration/intake-list-and-detail.test.ts`

### Acceptance Criteria

FR-04, FR-05, FR-13 (phần count không phụ thuộc limit), BR-01, BR-02, BR-03, BR-05, BR-06, BR-09; AC tương ứng trong `requirement-spec.md`.

### Test Requirements

`pnpm --filter @kaneo/api exec vp test run --config vitest.config.ts ../../tests/api-integration/intake-list-and-detail.test.ts` (hoặc script integration hiện có của repo). Không chạy full suite.

### Risk Assessment

- Conditional aggregate bằng `sql` dễ sai khi thêm `groupBy`; kiểm bằng test đếm chính xác.
- Đổi order ảnh hưởng staff list đang dùng `createdAt desc`; staff hiện không phân trang theo thứ tự nghiệp vụ nên chấp nhận, nhưng test phải chốt.
- `counts` xuất hiện trong OpenAPI → web client type đổi; P2 là nơi tiêu thụ, không ảnh hưởng staff page.

### Rollback / Migration

Không migration. Rollback = revert 5 file; response thêm field nên client cũ vẫn chạy.

---

## P2 - Guest portal summary, group filter, show all

### Objective

Guest thấy ngay 3 nhóm đang mở + All, lọc danh sách bằng legend, đọc danh sách 5 cột theo thời gian chờ, và tải hết request khi cần.

### Scope

`apps/web/src/components/intake/**`, `apps/web/src/fetchers/intake/**`, `apps/web/src/hooks/queries/intake/**`, `apps/web/src/routes/**`, `i18n/en-US.json`

### Dependencies

P1.

### Tasks

- [ ] `intake-groups.ts`: mirror 3 nhóm + All cho UI (key, label key, statuses, `matchesGroup`) — chỉ dùng để highlight/aria, không tự đếm.
- [ ] `fetcher` + `useGetIntakeRequests`: nhận `group`, truyền query; giữ `status` cho staff.
- [ ] Hook mới `useGetIntakeRequestPages` (`useQueries` cho page 2..N, `limit=100`, cùng query key shape) — chỉ bật khi guest bấm "Show all".
- [ ] `guest-request-list.tsx` (new): header 5 cột `ID · Request · Project · Status · Received` + row grid cùng cột; `showProject` prop; Received = `formatRelativeTime(createdAt)`; không render `IntakeProgress`.
- [ ] `intake-summary.tsx` (new): card "Overview" + hint tổng; donut SVG r=42 stroke=14, `aria-hidden`, chỉ 3 segment đang mở, tâm = tổng active + "active"; legend 4 button (`aria-pressed`, count, %, All không %), phân cách trước All; skeleton cùng chiều cao khi `isLoading`.
- [ ] `guest-portal-page.tsx`: state `group` thay `status` filter (bỏ dải status chip ở guest portal); render banner khi `awaiting > 0` (button chọn nhóm awaiting); render summary + list; nút "Show all {{total}} requests" ở footer khi `items.length < total`; reset về page 1 + group All khi đổi nhóm; giữ error/retry/empty và form New request.
- [ ] Copy mới vào `i18n/en-US.json`: `intake:portal.overview`, groups, `showAll`, `received`, banner, empty-group.
- [ ] Hai route guest đổi `max-w-3xl` → `max-w-5xl` (960px); staff không đổi.
- [ ] Test `guest-portal-page.test.tsx`: mock list response có counts; chọn nhóm → gọi `group`, list đổi, count giữ nguyên; "Show all" gọi page 2 và append; summary ẩn khi `counts.all === 0`; legend `aria-pressed`.

### Expected Files

- `apps/web/src/components/intake/intake-groups.ts` (new)
- `apps/web/src/components/intake/intake-summary.tsx` (new)
- `apps/web/src/components/intake/guest-request-list.tsx` (new)
- `apps/web/src/components/intake/guest-portal-page.tsx`
- `apps/web/src/components/intake/guest-portal-page.test.tsx` (new)
- `apps/web/src/fetchers/intake/list-intake-requests.ts`
- `apps/web/src/hooks/queries/intake/use-get-intake-requests.ts`
- `apps/web/src/hooks/queries/intake/use-get-intake-request-pages.ts` (new)
- `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/my-requests.tsx`
- `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/requests/index.tsx`
- `i18n/en-US.json`

### Acceptance Criteria

FR-01, FR-02, FR-03, FR-09, FR-10, FR-11, FR-13; BR-06, BR-07, BR-08, BR-09; AC-01…AC-03, AC-07, AC-12, AC-14.

### Test Requirements

`pnpm --filter @kaneo/web test -- src/components/intake/guest-portal-page.test.tsx` (scoped), `pnpm --filter @kaneo/web typecheck`, `pnpm i18n:check:fix`.

### Risk Assessment

- `useQueries` cho page phụ: nếu chỉ dùng page 1 hook thì "Show all" không append được; phải giữ cùng `queryKey` shape để poll 30s phủ mọi page đã tải.
- Guest bỏ dải status chip: status cụ thể vẫn đọc được qua badge; `status` param vẫn dùng cho staff, không xoá khỏi API.
- Donut chia 0 khi `active === 0` nhưng `all > 0`: vẽ track rỗng, không chia cho 0.
- Container rộng hơn có thể lộ cột Received dài; kiểm 375px và 960px.

### Rollback / Migration

Không migration. Revert component/route; P1 giữ nguyên vẫn tương thích (field `counts` bị bỏ qua).

---

## P3 - Guest detail stepper, activity copy, Need feedback loop

### Objective

Guest đọc được mình đang ở đâu trên lifecycle, thấy trao đổi hai chiều bằng ngôn ngữ của mình, và gửi feedback nhiều vòng trên cùng request.

### Scope

`apps/web/src/components/intake/**`, `i18n/en-US.json`

### Dependencies

Không (dùng status/note đã có trong detail + activity response).

### Tasks

- [ ] `intake-stepper.tsx` (new): `<ol>` 5 bước theo BR-10; state done/current/upcoming/rejected; done = tint success + viền mảnh, current = accent-brand + ring, upcoming = surface-2/muted; `aria-current="step"`, text label từng bước; `needs_revision` ghi chú "Bạn đã gửi phản hồi"; `rejected` = nhánh kết thúc (không vẽ bước 4/5 như đang chờ); mobile dọc.
- [ ] `intake-request-detail.tsx`: prop `showStepper` (guest true, staff false), render stepper dưới header.
- [ ] `intake-activity-list.tsx`: actor You/Team theo `userId` hiện tại (guest luôn "You"); câu chữ theo mục đích cho `status_changed` (submitted/started/delivered/feedback/confirmed) thay vì `from → to`; hiện `content` của `status_changed` cho cả hai chiều; ẩn `task_linked`.
- [ ] `guest-request-detail.tsx`: truyền `showStepper`; nhãn hành động "Need feedback" + dialog copy mới; giữ invalidate count sau transition.
- [ ] `staff-request-detail.tsx`: nút "Mark delivered" mở `RequestNoteDialog` với `required={false}` (note tuỳ chọn) thay vì transition ngay; reject giữ note bắt buộc.
- [ ] Copy mới/sửa trong `i18n/en-US.json`: stepper labels, activity purpose, needFeedback, deliver note title/description.
- [ ] Test: `intake-stepper.test.tsx` (map status → state, `aria-current`, rejected/revision); cập nhật `guest-request-detail.test.tsx` (nhãn Need feedback, stepper hiện); cập nhật `staff-request-detail.test.tsx` (deliver mở dialog, note rỗng vẫn gửi được).

### Expected Files

- `apps/web/src/components/intake/intake-stepper.tsx` (new)
- `apps/web/src/components/intake/intake-stepper.test.tsx` (new)
- `apps/web/src/components/intake/intake-request-detail.tsx`
- `apps/web/src/components/intake/intake-activity-list.tsx`
- `apps/web/src/components/intake/guest-request-detail.tsx`
- `apps/web/src/components/intake/guest-request-detail.test.tsx`
- `apps/web/src/components/intake/staff-request-detail.tsx`
- `apps/web/src/components/intake/staff-request-detail.test.tsx`
- `i18n/en-US.json`

### Acceptance Criteria

FR-06, FR-07, FR-12; BR-10, BR-11, BR-12; AC-04…AC-06, AC-08…AC-11.

### Test Requirements

`pnpm --filter @kaneo/web test -- src/components/intake/intake-stepper.test.tsx src/components/intake/guest-request-detail.test.tsx src/components/intake/staff-request-detail.test.tsx`; `pnpm --filter @kaneo/web typecheck`; `pnpm i18n:check:fix`.

### Risk Assessment

- Staff detail đổi hành vi deliver (giờ mở dialog) — nếu staff bấm nhanh 2 lần, mutation pending phải chặn như hiện tại.
- Activity copy: dữ liệu cũ có `eventData.from/to`; chỉ đổi cách hiển thị, không đổi payload.
- Stepper với `needs_revision` phải giữ bước 3 current + note, không nhảy về bước 2.
- Dark mode: dùng token, kiểm riêng.

### Rollback / Migration

Không migration. Revert component; API/DB không đổi.

---

## Change history
| Version | Date | Reason | Impact |
|---|---|---|---|
| 1 | 2026-11-27 | Plan đầu tiên sau G1/G2 | 3 phase: API contract, portal, detail |
