# Requirement Specification: guest-request-tracking
Version: 3 | Status: DRAFT (change request — cần duyệt lại G1)

## Change request v3 (2026-11-27)

**Reason:** G2 vòng 8 — guest không cần chart đếm request đã xử lý; lọc theo cột và xem toàn bộ danh sách cần cách làm riêng.

**Change:**
- Summary chỉ còn 3 nhóm đang mở (Chờ tiếp nhận, Đang xử lý, Chờ bạn xác nhận) + "Tất cả". Bỏ nhóm "Đã đóng (7 ngày)" và "Closed earlier": chart không đếm request `confirmed`/`rejected`; lọc request đã xong là feature riêng.
- Bỏ toàn bộ lọc theo cột (search, project, status, progress, updated) khỏi feature này → feature riêng sau.
- Danh sách tải 100 request mỗi lần; nút "Show all requests" tải tiếp các trang còn lại. Count vẫn server-side, không phụ thuộc `limit`/`page`.

**Impact:** BR-03/BR-05; FR-01, FR-05, +FR-13; AC-01, AC-07, AC-12, AC-14; bỏ "phân trang UI" và lọc cột khỏi §9; design/prototype cập nhật tương ứng. Không migration, không đổi staff view.

## Change request v2 (2026-11-27)

**Reason:** "Request changes" đọc như yêu cầu sửa và không nói rõ mục đích thật: guest phản hồi về cách team xử lý, có thể trao đổi nhiều vòng trước khi chấp nhận.

**Change:** đổi action thành **Need feedback**, giữ nguyên transition `delivered → needs_revision` (note bắt buộc, ghi vào activity). Staff nhận notification, xử lý và **deliver lại chính request đó** (`needs_revision → in_progress → delivered`) kèm note phản hồi; guest đọc note trong activity, gửi feedback tiếp hoặc **Confirm** để đóng. Không tạo request mới, không đổi status nào khác.

**Impact:** copy (action, dialog, stepper note "You sent feedback"); activity phải render `content` của entry `status_changed` (hiện UI bỏ mất note); staff detail cần cho phép note không bắt buộc khi `delivered` (hiện dialog chỉ mở khi note bắt buộc). **Không** thêm API, bảng, notification type hay transition mới — state machine hiện tại đã hỗ trợ vòng lặp.

**Chạm staff view tối thiểu:** một dialog optional-note ở `in_progress → delivered`, ngoài phạm vi "không đổi staff view" ở §9 — cần duyệt cùng G1/G2.

**Chưa gồm trong v2:** column filters, "Closed earlier", Load more — đang là đề xuất ở G2, sẽ đưa vào spec nếu được duyệt.

## 1. Goal and context

Guest đã gửi request hiện chỉ thấy một danh sách phẳng: muốn biết "đang xử lý đến đâu" phải mở từng request, và không có con số tổng hợp nào cho biết mình đang có bao nhiêu việc ở mỗi giai đoạn. Feature này thêm một lớp tổng quan ngay trên danh sách và một stepper tiến trình trong trang chi tiết, dùng đúng dữ liệu và quyền hiện có.

Feature **không** thay đổi luồng nghiệp vụ, không thêm kênh liên lạc, không thêm dependency.

## 2. User stories

- As a guest, I want to see how many of my requests are waiting, in progress, and awaiting my confirmation, so that I know where my work stands without opening each request.
- As a guest, I want to click a summary group to see only those requests, so that I can act on the ones that need me.
- As a guest, I want a visual progress indicator on a request detail, so that I can see how far the request has moved and what happens next.
- As a guest, I want the summary to update on its own, so that I do not have to reload after staff changes a status.

## 3. Actors and roles

| Actor | Role | Access |
|---|---|---|
| Guest | workspace role `guest`, `intakeRequest:read/create/update` | Chỉ request do chính mình tạo, trong project còn quyền truy cập |
| Staff / PM | `intakeRequest:manage` + project access | Thấy mọi request trong project accessible; không thuộc phạm vi feature này |

Guest không có `task:*`/`project:*`; mọi dữ liệu hiển thị phải đến từ response intake đã scope, không gọi API project/task.

## 4. Business rules

| ID | Rule |
|---|---|
| BR-01 | Summary chỉ tính request của chính guest (`createdById`), trong các project guest còn quyền truy cập. Không lộ request của guest khác. |
| BR-02 | Trên trang project-scoped (`/project/$projectId/requests`), summary và danh sách chỉ tính request của project đó. Trên `/my-requests`, tính trên mọi project guest được mời. |
| BR-03 | Nhóm summary: **Chờ tiếp nhận** = `new` + `triaged`; **Đang xử lý** = `approved` + `in_progress` + `needs_revision`; **Chờ bạn xác nhận** = `delivered`; **Tất cả** = toàn bộ request trong scope, kể cả đã đóng, không giới hạn thời gian. Request `confirmed`/`rejected` không thuộc nhóm nào và không được đếm trong chart. |
| BR-04 | "Chờ xác nhận" chỉ có nghĩa là guest chờ chính mình xác nhận (`delivered`). `new`/`triaged` không được tính vào nhóm này. |
| BR-05 | Chart chỉ đếm request đang mở; request `confirmed`/`rejected` chỉ nằm trong "Tất cả" và danh sách. Lọc request đã xử lý xong là feature riêng (v3). |
| BR-06 | Count là số tuyệt đối trên toàn scope, **không** phụ thuộc nhóm đang được chọn. Chọn nhóm chỉ lọc danh sách bên dưới. |
| BR-07 | Bấm một nhóm = lọc danh sách theo đúng nhóm đó; bấm "Tất cả" = bỏ lọc. Nhóm đang chọn có trạng thái selected rõ ràng (`aria-pressed`). |
| BR-08 | Summary ẩn hoàn toàn khi guest không có request nào trong scope (không hiện hàng số 0). |
| BR-09 | Count lấy từ aggregate server trên cùng điều kiện access/project với danh sách; không suy ra từ trang item hiện tại và không phụ thuộc `limit`/`page`. |
| BR-10 | Stepper chỉ dùng cho guest detail. Đường chính: 1 Đã gửi (`new`) → 2 Đã tiếp nhận (`triaged`, `approved`) → 3 Đang thực hiện (`in_progress`, `needs_revision`) → 4 Chờ bạn xác nhận (`delivered`) → 5 Hoàn tất (`confirmed`). |
| BR-11 | `needs_revision` hiển thị ở bước 3 kèm ghi chú "Bạn đã gửi phản hồi". Đây là vòng lặp hợp lệ: staff deliver lại **cùng request** (không tạo request mới), guest có thể gửi feedback nhiều lần. `rejected` là nhánh kết thúc: không vẽ tiếp đường chính, hiển thị trạng thái từ chối + activity/timeline hiện có. |
| BR-12 | Trạng thái hiện tại phải đọc được bằng text và `aria-current="step"`, không chỉ bằng màu. |
| BR-13 | Summary và danh sách dùng cùng một nguồn response; sau hành động của guest (`confirmed`/`needs_revision`) query được invalidate để count đổi ngay, không chờ poll. Poll định kỳ 30 giây vẫn giữ. |
| BR-14 | Summary không tạo live-region ồn ào: count không tự announce mỗi 30 giây. Chỉ count "Chờ bạn xác nhận" được phép là polite status, và không dời focus. |

## 5. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Guest portal hiển thị summary gồm "Tất cả" và 3 nhóm (Chờ tiếp nhận, Đang xử lý, Chờ bạn xác nhận) với count tương ứng, đặt trên danh sách. Chart chỉ đếm 3 nhóm đang mở. | Must |
| FR-02 | Mỗi nhóm là một button lọc danh sách; nhóm đang chọn có selected state và `aria-pressed`; "Tất cả" reset filter. | Must |
| FR-03 | Count của từng nhóm không đổi khi đổi nhóm đang chọn. | Must |
| FR-04 | API list trả thêm count theo nhóm trong cùng response; count tính trên scope access + `projectId`, bỏ qua filter nhóm. | Must |
| FR-05 | API list hỗ trợ lọc theo nhóm (3 nhóm trên + tất cả) để danh sách khớp với legend; filter `status` hiện có vẫn giữ cho staff view. | Must |
| FR-06 | Trang detail của guest hiển thị stepper 5 bước theo BR-10/BR-11, có nhãn text cho từng bước và trạng thái hiện tại. | Must |
| FR-07 | Stepper hiển thị đúng với `needs_revision` (bước 3 + ghi chú phản hồi) và `rejected` (nhánh kết thúc). | Must |
| FR-08 | Summary cập nhật sau khi guest confirm/need feedback mà không cần reload; cập nhật tối đa 30 giây sau thay đổi từ staff. | Must |
| FR-12 | Activity của guest hiển thị nội dung feedback và phản hồi của staff (note trên `status_changed`), actor ở mức vai trò **You/Team** (không tên staff), câu chữ theo mục đích thay vì status gốc; để hai bên trao đổi nhiều vòng trên cùng request; staff deliver lại không tạo request mới. Entry nội bộ `task_linked` không hiện. | Must |
| FR-13 | Danh sách tải 100 request mỗi lần; khi `total` lớn hơn số đã tải, hiện nút "Show all requests" để tải tiếp các trang còn lại (append, không reset scroll). Count không phụ thuộc số trang đã tải. | Must |
| FR-09 | Summary ẩn khi scope không có request; empty state và CTA "New request" giữ nguyên. | Should |
| FR-10 | Summary hiển thị skeleton cùng kích thước trong lúc tải, không gây layout shift khi count về. | Should |
| FR-11 | Trên mobile (375px), summary wrap hoặc scroll được nhưng không cắt nhãn/count; stepper chuyển dọc. | Must |

## 6. Non-functional requirements

- **Security / privacy:** count chỉ tính request guest sở hữu và project còn access; không thêm field nhạy cảm (email, tên staff, task nội bộ) vào response guest. API là nguồn authorization, UI chỉ hiển thị.
- **Performance:** thêm tối đa một aggregate query cho mỗi lần list (group by/conditional count), không N+1; count vẫn đúng khi danh sách vượt `limit`. Không thêm round-trip riêng cho summary.
- **Accessibility:** WCAG 2.2 AA cho phần mới: button thật, accessible name chứa cả nhãn và số ("Chờ bạn xác nhận: 1 yêu cầu"), focus-visible, target ≥44px, không chỉ dùng màu, stepper dùng `<ol>` và `aria-current="step"`, tôn trọng `prefers-reduced-motion` nếu có animation.
- **Responsive:** hoạt động ở 375px và desktop; không cắt text quan trọng; dark mode dùng semantic token, text ≥4.5:1, non-text ≥3:1.
- **Compatibility:** dùng primitive hiện có (`Button`, `Badge`, `Progress`, `Skeleton`) và token hiện có; không thêm dependency, không đổi design system toàn cục.
- **i18n:** mọi copy mới qua key trong `i18n/en-US.json`, namespace `intake`; không hard-code tiếng Anh/Việt trong component.
- **Observability:** không thêm logging chứa dữ liệu request; lỗi list dùng error state/retry hiện có.

## 7. Edge cases

- Guest có 0 request → không render summary; chỉ empty state + CTA.
- Chỉ có request đã đóng (`confirmed`/`rejected`) → 3 nhóm = 0, "Tất cả" > 0; summary vẫn hiện "Tất cả" (không có segment trong donut) và danh sách hiện các request đó.
- Guest bị gỡ khỏi project → request và count của project đó biến mất ở lần fetch kế tiếp; không lỗi.
- Guest mở link project không còn access → layout hiện có redirect về `/my-requests`; summary không được render dữ liệu cũ.
- Count và list lệch nhau trong lúc poll → cả hai đến từ cùng response nên không lệch; sau mutation có invalidate ngay.
- Danh sách >100 request → count vẫn đúng; "Show all requests" tải tiếp các trang còn lại, append và không reset scroll.
- Status đổi liên tiếp (revision loop) → nhóm "Đang xử lý" vẫn đúng; stepper hiển thị bước 3 + ghi chú, không nhảy lùi về bước 2.
- `needs_revision` rồi `rejected` → request rời nhóm "Đang xử lý" và không còn được chart đếm; "Tất cả" không đổi.
- Guest đang chọn một nhóm, request chuyển sang `confirmed`/`rejected` trong lúc đang xem → lần poll sau request rời nhóm; danh sách và count cùng cập nhật.
- Project-scoped page: count không bao gồm request ở project khác dù cùng guest.

## 8. Acceptance criteria

| ID | Verifiable criterion | Linked FR |
|---|---|---|
| AC-01 | Với 2 request `in_progress`, 1 `delivered`, 1 `confirmed` cách đây 3 ngày, 1 `rejected` cách đây 10 ngày, summary hiển thị: Đang xử lý 2, Chờ bạn xác nhận 1, Tất cả 5; chart chỉ vẽ 3 request đang mở và không đếm 2 request đã đóng. | FR-01, FR-03 |
| AC-02 | Bấm "Chờ bạn xác nhận" → danh sách chỉ còn request `delivered`; các count không đổi; chip có `aria-pressed="true"`. | FR-02, FR-03 |
| AC-03 | Bấm "Tất cả" → danh sách trở lại đầy đủ, không còn filter nhóm. | FR-02 |
| AC-04 | Guest B không thấy count hoặc item của guest A; gọi API trực tiếp cũng không trả dữ liệu của A. | BR-01 |
| AC-05 | Trang project-scoped chỉ đếm request của project đó; guest có request ở project khác không làm count thay đổi. | BR-02 |
| AC-06 | Guest không có request → không có summary; empty state và nút "New request" vẫn hiện. | BR-08, FR-09 |
| AC-07 | Danh sách có 150 request (vượt limit) → count vẫn đúng là 150 ở "Tất cả"; "Show all requests" tải đủ 150 row, append không reset scroll. | BR-09, FR-04, FR-13 |
| AC-08 | Detail `in_progress` → stepper bước 3 là current, các bước trước done, bước sau upcoming; `aria-current="step"` nằm đúng bước 3. | FR-06, BR-12 |
| AC-09 | Detail `delivered` → stepper bước 4 current; nút Confirm và **Need feedback** hoạt động như hiện tại. | FR-06 |
| AC-10 | Detail `needs_revision` → bước 3 current kèm ghi chú "You sent feedback", không hiển thị như đã hoàn tất; feedback của guest nằm trong activity. | FR-07, FR-12 |
| AC-17 | Sau feedback, staff deliver lại cùng request → status về `delivered`, activity có note phản hồi của staff, guest gửi feedback tiếp được; không sinh request mới. | FR-12 |
| AC-18 | Activity của guest ghi rõ actor ở mức vai trò ("You created this request", "Team started working on this request"), hiện note feedback/reply; không hiện `task_linked` hay tên/avatar staff. | FR-12 |
| AC-11 | Detail `rejected` → không vẽ đường chính như đang tiếp tục; hiển thị trạng thái từ chối + timeline. | FR-07 |
| AC-12 | Sau khi guest bấm Confirm, tổng "Chờ bạn xác nhận" giảm ngay, request rời chart và "Tất cả" không đổi, không cần reload. | FR-08, BR-13 |
| AC-13 | Staff đổi status; trong vòng 30 giây guest thấy count/list cập nhật mà không thao tác. | FR-08 |
| AC-14 | Ở 375px, không nhãn/count nào bị cắt; stepper đọc được theo chiều dọc; header cột wrap không tràn ngang. | FR-11 |
| AC-15 | Keyboard: Tab tới từng chip/stepper, Enter/Space kích hoạt, focus-visible rõ; accessible name của chip có nhãn + số. | NFR accessibility |
| AC-16 | Dark mode: text và border của summary/stepper đạt contrast yêu cầu; không dùng màu làm tín hiệu duy nhất. | NFR accessibility |

## 9. Out of scope

- Thay đổi staff intake view ngoài một dialog optional-note khi deliver lại (change request v2); không đổi staff grouping, staff count hay luồng khác.
- WebSocket/real-time push; vẫn polling 30 giây.
- Email/in-app notification, Telegram.
- Archive, export, search, sort nâng cao.
- Lọc theo cột (search, project, status, progress, updated) — feature riêng sau (v3).
- Lọc riêng các request đã xử lý xong (`confirmed`/`rejected`) — feature riêng sau (v3).
- **Chat/comment rich text trong activity** (định dạng, ảnh/attachment, mention như màn hình task): tách feature riêng. Feature này chỉ trao đổi bằng note text thuần trên entry `status_changed`.
- Sửa nội dung request sau `triaged`; thêm revision history mới.
- Thêm cột DB hoặc migration (feature này chỉ dùng `status`, counts và timestamps hiện có).
- Astryx hoặc bất kỳ dependency/UI library mới.
- Thay đổi design system, màu, typography toàn cục.
- Dashboard staff và các widget hiện có.

## 10. Open questions

Không còn câu hỏi mở. Hai giả định đã chốt trong spec, nếu sai thì sửa trước khi gate:

1. Áp dụng cho **cả hai** route guest vì dùng chung `GuestPortalPage`; trang project scoped theo project (BR-02).
2. Request đã đóng không được chart đếm; việc lọc chúng là feature riêng (v3).

## 11. Change history

| Version | Date | Reason | Impact |
|---|---|---|---|
| 1 | 2026-11-27 | Spec khởi tạo từ S0 context + 4 annotation | — |
| 2 | 2026-11-27 | Change request: "Request changes" → **Need feedback**, giữ transition `delivered → needs_revision`, cho vòng lặp feedback trên cùng request, hiện note hai chiều trong activity | BR-11; FR-07, FR-08, +FR-12; AC-09, AC-10, +AC-17; staff detail thêm optional note khi deliver lại |
| 3 | 2026-11-27 | G2 vòng 8: chart không đếm request đã xử lý; bỏ lọc cột; thêm "Show all requests" | BR-03, BR-05; FR-01, FR-05, +FR-13; AC-01, AC-07, AC-12, AC-14; lọc cột và lọc request đã xong → feature riêng |
