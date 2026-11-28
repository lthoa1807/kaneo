# User flow: guest-request-tracking
Version: 5 | Status: DRAFT

## Entry points

- `/dashboard/workspace/$workspaceId/my-requests` — workspace-level, gom request trên mọi project guest được mời.
- `/dashboard/workspace/$workspaceId/project/$projectId/requests` — chỉ request trong project đó.
- Cả hai render `GuestPortalPage`; row mở `GuestRequestDetail` tương ứng.

## Flow 1 — xem tổng quan và lọc

1. Guest mở portal.
2. Query list tải items + counts trong cùng response; UI hiện skeleton đúng hình dạng (summary card + rows).
3. Full state:
   - Header "My requests" + button "New request".
   - Action banner chỉ khi `awaiting > 0`.
   - Summary card "Overview": donut 96px (SVG, `aria-hidden`) chỉ vẽ 3 nhóm đang mở + legend row cho Waiting for review, In progress, Awaiting your confirmation (mỗi row có swatch, count, %), rồi row "All requests" (count đầy đủ, không %) nằm cuối, ngăn bằng divider. Request `confirmed`/`rejected` không vào chart.
   - Danh sách row: header cột (ID, Request, Project, Status, Received) và mỗi row giữ display ID, title, project, status badge, ngày ghi nhận. Thứ tự: request đang mở trước, chờ lâu nhất ở trên; request đã đóng xuống cuối.
4. Guest bấm một nhóm → danh sách lọc theo nhóm; count của tất cả nhóm **không đổi**; nhóm được chọn có `aria-pressed="true"`.
5. Guest bấm "All" → bỏ lọc, thấy toàn bộ request trong scope.
6. Khi danh sách còn request chưa tải, cuối danh sách có "Show all requests"; bấm → tải tiếp các trang còn lại, append, không reset scroll. Không có lọc theo cột trong feature này.
7. Guest bấm một row → detail.

## Flow 2 — đọc tiến trình trong detail

1. Detail hiện title, status badge, stepper 5 bước, description, task progress, activity, và dòng "Handled by the {project} team".
2. Stepper đánh dấu bước hiện tại bằng text + `aria-current="step"`.
3. `needs_revision` → bước 3 + ghi chú "You sent feedback".
4. `rejected` → nhánh kết thúc, không vẽ đường chính như đang tiếp tục; hiện badge Rejected + timeline.
5. `delivered` → hiện 2 action: "Looks good, confirm" (primary) và "Need feedback" (outline, mở note dialog; note bắt buộc).
6. Sau action:
   - Query detail invalidate/refetch → stepper đổi trạng thái.
   - Quay lại list → counts đã cập nhật (không chờ poll).

## Flow 2b — vòng feedback trên cùng một request

1. Guest ở `delivered`, bấm **Need feedback**, nhập nội dung → status thành `needs_revision`; note lưu vào activity; staff nhận notification.
2. Staff xử lý và deliver lại **chính request đó** kèm note phản hồi → status về `delivered`; guest thấy note của staff trong activity.
3. Guest đọc phản hồi, có thể bấm **Need feedback** tiếp (lặp bước 1–2) hoặc **Confirm** để đóng.
4. Không tạo request mới; ID, project và activity giữ nguyên; mỗi vòng chỉ thêm entry vào activity.
5. Activity hiển thị cả nội dung note của guest và staff trên entry `status_changed` — hiện UI đang bỏ phần `content` này.

## Flow 3 — empty

1. Guest không có request trong scope.
2. Không render summary (không hiện 0 ở các nhóm).
3. Empty state: một dòng nói đang trống, một dòng nói vì sao, một action "New request".
4. Submit request thành công → quay lại list, counts + row mới xuất hiện.

## Flow 4 — loading và error

1. Loading: skeleton cho summary + 4 rows; không layout shift khi dữ liệu về.
2. Error: "Could not load requests" + "Try again"; không hiện count cũ.
3. Retry → skeleton → full/empty.

## Flow 5 — staff đổi trạng thái khi guest đang mở trang

1. List và detail đều poll 30 giây.
2. Count, row status và stepper cập nhật trong vòng tối đa 30 giây.
3. Nếu guest đang chọn một nhóm và request chuyển sang `confirmed`/`rejected`, lần poll sau request rời nhóm và count giảm; không có thông báo chen ngang, không dời focus.

## Flow 6 — nhiều request hơn một trang

1. Guest list truyền `limit=100`; nếu `total` lớn hơn số đã tải, cuối danh sách có "Show all {{total}} requests".
2. Bấm → tải `page + 1`, append vào danh sách, không reset scroll, không đổi count.
3. Lặp tới khi đủ `total`; button biến mất.
4. Count luôn là tổng server-side, kể cả khi chưa load hết.

## Text diagram

```
[My requests]
   |
   +-- loading --> skeleton
   +-- error ----> message + Try again
   +-- empty ----> New request --> form --> list (counts updated)
   |
   +-- full
        |
        +-- group chip --> filtered list (counts unchanged)
        |
        +-- row --> detail
                      |
                      +-- stepper (submitted -> received -> in progress -> awaiting -> completed)
                      |     +-- needs_revision: step 3 + note
                      |     +-- rejected: terminal branch
                      |
                      +-- delivered --> Confirm / Need feedback
                                           |
                                           +-- needs_revision (note in activity)
                                           |     +-- staff re-delivers same request + reply note
                                           |           +-- back to delivered (loop)
                                           |
                                           +-- confirm --> confirmed, list counts update
```
