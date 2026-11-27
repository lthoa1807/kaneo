# Gate G2: UX/UI design approval
Feature: guest-request-tracking | Prepared on 2026-11-27 | Version: 13

**Review:** `design/` — `ux-spec.md`, `ui-spec.md`, `user-flow.md`, `prototype/index.html`

**Summary:** Portal có summary card (donut + legend row là filter) và action banner khi có request chờ guest xác nhận; detail có stepper 5 bước với nhánh `needs_revision`/`rejected`. Count lấy từ aggregate server trong chính response list, không phụ thuộc filter/limit.

**Vòng 13 (theo feedback G2 vòng 12):**

1. **Marker current dùng brand blue, không dùng đen.** Ở light mode marker đen bị chỏi; current giờ tô `accent-brand` (xanh brand) + chữ tương phản + ring 4px. Dark mode vẫn đọc tốt vì token tự đổi.
2. **`Waiting for project review` → `Waiting for review`.** Ngắn hơn, đúng ý "wait for review là ok"; áp cho cả legend và badge.
3. **Bỏ cột Progress khỏi list.** Danh sách còn 5 cột ID, Request, Project, Status, Received — ngày ghi nhận giữ ở cột cuối, đúng yêu cầu thay cột Progress. Task progress ("2 of 3 tasks done") chỉ còn ở detail.

**Giữ từ các vòng trước:** done = tint success + viền mảnh; upcoming nền `surface-2`; `confirmed` tô done cả 5 bước; rejected tint danger; xếp request đang mở trước (chờ lâu nhất trên), đã đóng xuống cuối; summary chỉ đếm 3 nhóm đang mở + All (không %); không lọc theo cột; "Show all {{total}} requests" tải 100/lần; activity You/Team; vòng Need feedback → staff deliver lại cùng request.

**Open points:**

1. **Change request v2 — Need feedback (chạm staff detail một chỗ).** Dialog optional-note khi staff deliver lại; `IntakeActivityList` render `content` của `status_changed`. Không thêm API/bảng/transition. Cần duyệt.
2. **Thứ tự list.** Đang đề xuất request đang mở trước, đã đóng xuống cuối; nếu muốn order thuần theo ngày ghi nhận thì nói.
3. **"Show all requests" tải tuần tự 100/lần** (150 request = 2 lần gọi), không phân trang số.
4. **Độ rộng container** 768px → 960px; không đổi staff view.

---

## Decision

**Approve this gate?**  Approve  /  Refuse

(Approve = proceed to the next stage. Refuse = tell the agent what to change.)
