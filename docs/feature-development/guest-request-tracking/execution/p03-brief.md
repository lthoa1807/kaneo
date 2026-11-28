# P3 brief — Guest detail stepper, activity copy, Need feedback loop

## Objective

Guest đọc được mình đang ở đâu trên lifecycle, thấy trao đổi hai chiều bằng ngôn ngữ của mình, và gửi feedback nhiều vòng trên cùng request.

## Scope

`apps/web/src/components/intake/**`, `i18n/en-US.json` (các locale khác do `pnpm i18n:check:fix` cập nhật key mới).

## Dependencies

Không.

## Tasks

- [ ] `intake-stepper.tsx` (new): `<ol>` 5 bước theo BR-10; state done/current/upcoming/rejected; done = tint success + viền mảnh, current = primary + ring, upcoming = surface tương đương; `aria-current="step"`, text label từng bước; `needs_revision` ghi chú "You sent feedback"; `rejected` = nhánh kết thúc (3 mục: Submitted, Received, Rejected); mobile dọc.
- [ ] `intake-request-detail.tsx`: prop `showStepper` (guest true, staff false), render stepper dưới header.
- [ ] `intake-activity-list.tsx`: actor You/Team theo `userId` hiện tại; câu chữ theo mục đích cho `status_changed`; hiện `content` note; ẩn `task_linked`.
- [ ] `guest-request-detail.tsx`: truyền `showStepper`; nhãn "Need feedback" + dialog copy mới.
- [ ] `staff-request-detail.tsx`: nút "Mark delivered" mở `RequestNoteDialog` với `required={false}` thay vì transition ngay; reject giữ note bắt buộc.
- [ ] Test: `intake-stepper.test.tsx`, `intake-activity-list.test.tsx`, cập nhật `guest-request-detail.test.tsx` và `staff-request-detail.test.tsx`.
- [ ] Copy mới/sửa trong `i18n/en-US.json`.

## Expected Files

- `apps/web/src/components/intake/intake-stepper.tsx` (new)
- `apps/web/src/components/intake/intake-stepper.test.tsx` (new)
- `apps/web/src/components/intake/intake-activity-list.test.tsx` (new)
- `apps/web/src/components/intake/intake-request-detail.tsx`
- `apps/web/src/components/intake/intake-activity-list.tsx`
- `apps/web/src/components/intake/guest-request-detail.tsx`
- `apps/web/src/components/intake/guest-request-detail.test.tsx`
- `apps/web/src/components/intake/staff-request-detail.tsx`
- `apps/web/src/components/intake/staff-request-detail.test.tsx`
- `i18n/en-US.json` (+ locale khác qua `i18n:check:fix`)

## Acceptance Criteria

FR-06, FR-07, FR-12; BR-10, BR-11, BR-12; AC-04…AC-06, AC-08…AC-11, AC-18.

## Test Requirements

`pnpm --filter @kaneo/web test -- src/components/intake/intake-stepper.test.tsx src/components/intake/intake-activity-list.test.tsx src/components/intake/guest-request-detail.test.tsx src/components/intake/staff-request-detail.test.tsx`; `pnpm --filter @kaneo/web typecheck`; `pnpm i18n:check:fix`.

## Risk

- Staff deliver đổi hành vi (mở dialog) — mutation pending phải chặn double submit.
- Activity copy: dữ liệu cũ có `eventData.from/to`; chỉ đổi hiển thị, không đổi payload.
- Stepper `needs_revision` giữ bước 3 current, không nhảy về bước 2.
- Marker/connector dùng utility hiện có, không thêm token global (index.css ngoài scope).
