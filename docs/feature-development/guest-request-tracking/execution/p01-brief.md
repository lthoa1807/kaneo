# P1 brief — API counts, group filter, list order

## Objective

Một response list là nguồn duy nhất cho summary và danh sách: `counts` đúng trên scope, `group` lọc đúng nhóm, order đọc được "chờ lâu ở trên".

## Scope

`apps/api/src/intake/**`, `tests/api-integration/intake-list-and-detail.test.ts`, `apps/docs/openapi.json`

## Dependencies

Không.

## Tasks

- [ ] `apps/api/src/intake/intake-groups.ts`: map `waiting = [new, triaged]`, `in_progress = [approved, in_progress, needs_revision]`, `awaiting = [delivered]`; export type `IntakeGroup` và hàm `groupStatuses(group)`. Dùng chung cho filter; không thêm nhóm `confirmed`/`rejected`.
- [ ] `schema.ts`: thêm `group` vào `listIntakeRequestsQuery` (enum 4 giá trị, optional); giữ `status` cho staff.
- [ ] `controllers/list-intake-requests.ts`: tách `scopeWhere` (access + `projectId`) khỏi `where` (thêm `group` hoặc `status`). Counts: một query conditional aggregate trên `scopeWhere` (`count(*)`, `count(*) filter (where status in ...)`), bỏ qua `group`/`status`. Order: `case when status in ('confirmed','rejected') then 1 else 0 end asc, createdAt asc, number asc`.
- [ ] `response.ts`: `intakeRequestListSchema` thêm `counts: { all, waiting, in_progress, awaiting }` (z.number); mô tả ngắn gọn scope + bỏ qua filter.
- [ ] `pnpm openapi:check:fix` để cập nhật `apps/docs/openapi.json`.
- [ ] Integration test: guest có request ở cả 3 nhóm + 2 request đã đóng → `counts` đúng, `total`/`items` khớp, `group=awaiting` chỉ trả `delivered`, count không đổi khi đổi `group`, order mở trước/đóng sau, `projectId` scope đúng.
- [ ] Integration test: manage holder thấy counts toàn project accessible; `status` filter cũ vẫn hoạt động.

## Expected Files

- `apps/api/src/intake/intake-groups.ts` (new)
- `apps/api/src/intake/schema.ts`
- `apps/api/src/intake/controllers/list-intake-requests.ts`
- `apps/api/src/intake/response.ts`
- `apps/docs/openapi.json`
- `tests/api-integration/intake-list-and-detail.test.ts`

## Acceptance Criteria

FR-04, FR-05, FR-13 (phần count không phụ thuộc limit), BR-01, BR-02, BR-03, BR-05, BR-06, BR-09; AC tương ứng trong `requirement-spec.md`.

## Test Requirements

Chạy scoped integration test cho `tests/api-integration/intake-list-and-detail.test.ts`. Không chạy full suite.

## Risk

- Conditional aggregate dễ sai khi thêm `groupBy`; kiểm bằng test đếm chính xác.
- Đổi order ảnh hưởng staff list.
- `counts` vào OpenAPI → web client type đổi; P2 tiêu thụ.
