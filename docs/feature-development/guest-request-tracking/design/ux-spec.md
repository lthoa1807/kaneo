# UX Spec: guest-request-tracking
Version: 11 | Status: DRAFT

## UX

- **Users and goals:** guest (external requester) cần biết request của mình đang ở đâu và việc gì cần mình làm, mà không phải mở từng request hay hiểu vocabulary nội bộ của staff.
- **Main flow:** portal → đọc summary → lọc nhóm → mở detail → xem stepper → confirm hoặc need feedback → quay lại list với count mới. Chi tiết ở `user-flow.md`.
- **Alternate flows:** empty, loading, error, staff đổi status khi guest đang mở trang, project-scoped page.
- **Key content on each screen:**
  - **Portal:** tên trang, một primary action "New request"; 3 nhóm đang mở với count + "Tất cả"; danh sách request của chính guest; mỗi row có status bằng text, tiến độ task, thời gian cập nhật.
  - **Detail:** title, status, stepper, mô tả, tiến độ task, activity, action đúng một ngữ cảnh (confirm / need feedback khi `delivered`).

### UX decisions

1. **Một card vừa là tổng quan vừa là filter.** Donut và legend nằm trong cùng một card; mỗi legend row là button. Không có stat-card band riêng, và không có hai bộ số trùng nhau: donut chỉ là hình, mọi con số nằm trong legend.
2. **Count độc lập với filter.** Chọn nhóm chỉ lọc danh sách; số trên chip không đổi. Điều này tránh cảm giác "mất dữ liệu" khi lọc.
3. **Action banner chỉ khi cần guest.** Chỉ hiện khi `awaiting > 0`; bấm "Review" chọn nhóm `awaiting`. Khi count về 0, banner biến mất. Không thêm nút dismiss: đây là việc thật, không phải thông báo quảng cáo.
4. **Stepper trung thực.** Không có stepper tuyến tính giả. Đường chính 5 bước; `needs_revision` là ghi chú ở bước 3 và là vòng feedback hợp lệ trên cùng request; `rejected` là nhánh kết thúc. Người dùng thấy đúng cái đã xảy ra, không thấy "đang tiến" khi request đã bị từ chối.
5. **Không đổi vocabulary của guest.** Dùng "Waiting for review" cho `new`+`triaged` thay vì jargon nội bộ; "In progress" gộp `approved`/`in_progress`/`needs_revision`; "Awaiting your confirmation" thay vì "Delivered". Badge trên row dùng nhãn guest (`triaged` → "Waiting for review").
6. **Giữ nhịp hiện tại.** Portal row list, không card. Thêm summary không làm trang nặng hơn.
7. **Không notification mới.** Count tự cập nhật qua poll 30 giây và invalidate sau action; không toast, không live-region ồn ào.
8. **Donut theo đúng pattern overview đã triển khai.** Guest summary dùng lại cách trang overview đang làm: card có header + hint (như `WidgetCard`), donut SVG `stroke-dasharray` (như `PriorityDonut`), legend row là button gồm swatch, label, count và %. SVG `aria-hidden`, legend giữ toàn bộ số và chính là target filter, nên vẫn lọc được mà không cần chart library.
9. **Chart chỉ đếm request đang mở.** Ba nhóm `waiting`, `in_progress`, `awaiting` là ba segment của donut; % tính trên tổng đang mở. Request `confirmed`/`rejected` không thuộc nhóm nào, không vào chart, chỉ nằm trong "All requests" và danh sách — lọc riêng request đã xong là feature sau. "All requests" là row reset (count đầy đủ, không có %).
10. **Rộng hơn cho danh sách.** Portal hiện `max-w-3xl` (768px) quá hẹp khi có summary + row 6 cột. Nâng lên 960px (60rem) cho cả list và detail; đoạn văn trong detail vẫn cap `64ch` nên không thành dòng quá dài.
11. **Task progress là tín hiệu hợp lệ cho guest.** Guest chỉ nhận `taskCount`/`completedTaskCount`; `linkedTasks` bị bỏ khỏi response guest ở API. Giữ thanh tiến độ vì nó trả lời "đã làm tới đâu" mà không lộ title/assignee/status từng task. Không thêm gì khác.
12. **Người phụ trách: chỉ mức team, chưa có người.** Intake request không có field assignee (chỉ `createdById` là guest, và project). Detail hiển thị "Handled by the {project} team". Muốn hiện tên/avatar người phụ trách cần thêm field + migration và quyết định có được lộ danh tính staff cho guest hay không — để feature riêng, không nhét vào đây.
13. **Trao đổi bằng note text thuần, không rich text.** Vòng feedback dùng note trên transition, hiển thị text + giữ xuống dòng. Chat rich text (định dạng, ảnh, mention như task) không nằm trong feature này: editor của task gắn với `taskId`/upload/mention và sẽ lộ danh tính staff cho guest — tách feature riêng.
14. **Không có lọc theo cột.** Search, project, status, progress, updated tách feature riêng. Header của danh sách chỉ là nhãn cột (ID, Request, Project, Status, Received), không phải control; chỉ nhóm ở Overview lọc danh sách (FR-05).
15. **"Show all requests" thay cho phân trang.** Danh sách tải 100 request mỗi lần; khi còn request chưa tải, cuối danh sách có một button "Show all requests" tải tiếp các trang còn lại và append. Không số trang, không infinite scroll, không reset scroll; count luôn là tổng server-side.
16. **Ngày ghi nhận thay cho Updated; xếp theo thời gian chờ.** Cột cuối hiển thị ngày guest gửi request (relative, ví dụ "10 days ago"), không thêm cột "số ngày" riêng vì chính giá trị đó đã là số ngày chờ. Request đang mở xếp trước, cũ nhất trước; request `confirmed`/`rejected` xuống cuối. Updated time vẫn có ở detail.
17. **Bỏ cột Progress khỏi list; ngày ghi nhận giữ cột cuối.** Task progress ("2 of 3 tasks done") chỉ còn ở detail; list còn 5 cột ID, Request, Project, Status, Received. Request đang xử lý vẫn thấy tiến độ qua status badge và stepper ở detail.
18. **Màu stepper theo trạng thái, tông hiện đại.** Bước done dùng nền tint success + viền 1px success 50% + chữ success-fg (không tô khối xanh đậm), connector cùng tông mờ; bước current tô `accent-brand` + ring 4px, đọc ra ngay "đang ở đây" mà không dùng đen tuyền (chỏi ở light); bước upcoming nền `surface-2`; `confirmed` tô done cả 5 bước; `rejected` dùng tint danger.

### Copy (đề xuất key i18n, en-US là nguồn)

| Key | Copy |
|---|---|
| `intake:portal.group.waiting` | Waiting for review |
| `intake:portal.group.inProgress` | In progress |
| `intake:portal.group.awaiting` | Awaiting your confirmation |
| `intake:portal.banner.title_one` | 1 request is ready for your confirmation |
| `intake:portal.banner.title_other` | {{count}} requests are ready for your confirmation |
| `intake:portal.banner.action` | Review |
| `intake:portal.countLabel` | {{label}}: {{count}} requests |
| `intake:portal.overview.title` | Overview |
| `intake:portal.overview.total_one` | 1 request |
| `intake:portal.overview.total_other` | {{count}} requests |
| `intake:portal.overview.active` | active |
| `intake:portal.group.all` | All requests |
| `intake:portal.list.clearFilter` | Clear filter |
| `intake:portal.list.showAll` | Show all {{count}} requests |
| `intake:portal.list.received` | Received |
| `intake:portal.status.triaged` | Waiting for review |
| `intake:detail.contact` | Handled by the {{project}} team |
| `intake:detail.stepper.label` | Progress |
| `intake:detail.stepper.submitted` | Submitted |
| `intake:detail.stepper.received` | Received |
| `intake:detail.stepper.inProgress` | In progress |
| `intake:detail.stepper.awaiting` | Awaiting your confirmation |
| `intake:detail.stepper.completed` | Completed |
| `intake:detail.stepper.revisionNote` | You sent feedback |
| `intake:detail.stepper.rejected` | This request was rejected |
| `intake:activity.created` | You created this request |
| `intake:activity.workStarted` | Team started working on this request |
| `intake:activity.delivered` | Team delivered this request for your review |
| `intake:activity.deliveredAgain` | Team delivered this request again: {{note}} |
| `intake:activity.feedback` | You sent feedback: {{note}} |
| `intake:activity.confirmed` | You confirmed this request |
| `intake:activity.rejected` | Team rejected this request: {{note}} |

Actor trong activity ở mức vai trò: **You** khi `userId` là guest hiện tại, **Team** cho staff. Không hiện tên/avatar staff; nếu sau này muốn hiện tên thật thì phải là change request riêng (privacy + API). `task_linked` là entry nội bộ, không hiện cho guest.

Copy tuân theo quy ước hiện có: sentence case, không label in hoa tracking rộng, không nối metadata bằng dấu chấm giữa, không icon/dot trang trí mang nghĩa.

## Technical constraints (from Modern Web Guidance)

- **`progress`:** không đặt `tabindex`/`.focus()` lên progress; không thông báo mọi count thay đổi. Chỉ trạng thái "cần guest xác nhận" được phép dùng polite status, và không dời focus. Nếu stepper dùng progress semantics, mỗi bước vẫn phải có text.
- **`single-line-overflow`:** title/row label được truncate chỉ bằng CSS (`white-space: nowrap; overflow: hidden; text-overflow: ellipsis`), full text vẫn nằm trong DOM và accessible name. Flex item chứa label cần `min-inline-size: 0` để truncate đúng.
- **Không dùng scroll-driven animation / container style query** cho feature này: không cần, và tránh fallback phức tạp.
- **Reduced motion:** chỉ chuyển màu/opacity; nếu có chuyển động, bọc trong `prefers-reduced-motion: no-preference`.
- **Baseline:** chỉ dùng HTML/CSS/JS đã widely available; không thêm polyfill.

## Prototype

- **Path:** `design/prototype/index.html`
- **Flows demonstrated:** list full, lọc nhóm, empty, loading, error, detail với stepper cho `in_progress` / `delivered` / `needs_revision` / `rejected` / `confirmed`, confirm làm count đổi, vòng need feedback → staff deliver lại → confirm, dark mode.
- **Không phải production code:** copy và data là mẫu theo AC-01; implementation dùng component/i18n thật.

## Change history

| Version | Date | Reason | Impact |
|---|---|---|---|
| 1 | 2026-11-27 | S2 từ requirement-spec đã duyệt | — |
| 2 | 2026-11-27 | Plannotator vòng 2: chart, giới hạn record, độ rộng, task visibility | Thêm thanh phân bố; nới container; chốt giữ task progress (counts only) |
| 3 | 2026-11-27 | Plannotator vòng 3: theo pattern overview đã triển khai | Chip + bar → summary card + donut + legend row; thêm nhóm "Closed earlier"; contact ở mức team |
| 4 | 2026-11-27 | Change request: "Request changes" → **Need feedback** | Vòng feedback nhiều lần trên cùng request; note text thuần; rich text chat tách feature riêng |
| 5 | 2026-11-27 | Plannotator vòng 6: stepper lệch, activity thiếu actor | Stepper canh giữa; activity You/Team + câu chữ theo mục đích; bỏ `task_linked` khỏi bản guest |
| 6 | 2026-11-27 | Plannotator vòng 8: chart không đếm request đã xong, bỏ lọc cột, thêm Show all | 3 nhóm đang mở + All row; bỏ Closed/Closed earlier; header là nhãn cột; "Show all requests" tải tiếp |
| 7 | 2026-11-27 | Plannotator vòng 9: màu stepper, cột ngày ghi nhận, màu status | Done = success + connector; current = primary + ring; cột Received (bỏ Updated); màu legend khớp badge; xếp theo thời gian chờ |
| 8 | 2026-11-27 | Plannotator vòng 10: nhãn Triaged, màu marker done | `triaged` → "Waiting for project review" + tone neutral; marker done thêm border đậm |
| 9 | 2026-11-27 | Plannotator vòng 11: marker 4/5 thiếu màu | Upcoming có nền `surface-2`; `confirmed` tô done cả 5 bước; `rejected` tô danger |
| 10 | 2026-11-27 | Plannotator vòng 12: xanh đậm xấu | Done = tint success + viền mảnh + chữ success-fg; current = primary đặc + ring; rejected = tint danger |
| 11 | 2026-11-27 | Plannotator vòng 13: marker đen, cột Progress | Current = accent-brand; list bỏ cột Progress (chỉ detail mới có task progress); nhãn "Waiting for review" |
