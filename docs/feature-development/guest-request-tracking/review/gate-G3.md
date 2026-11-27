# Gate G3: Implementation plan approval
Feature: guest-request-tracking | Prepared on 2026-11-27 | Version: 1

**Review:** `implementation-plan.md`

**Summary:** Ba phase, mỗi phase review được một mình: **P1** API trả `counts` + nhận `group` + order mở-trước/đóng-sau (một conditional aggregate, không migration, cập nhật OpenAPI); **P2** guest portal dùng `counts` để vẽ summary, legend lọc theo `group`, list 5 cột có Received, "Show all" tải thêm trang 100 và append; **P3** guest detail có stepper 5 bước, activity You/Team theo mục đích, nút "Need feedback" giữ vòng lặp trên cùng request và staff deliver lại mở dialog note tuỳ chọn. P3 độc lập P1/P2; P2 phụ thuộc P1.

**Không làm:** không đổi schema DB, không thêm dependency, không đổi staff list/filter, không đụng WebSocket/Redis.

**Open points:**

1. **P1 đổi order của list API** (mở trước/đóng sau, cũ trước) — staff list cũng dùng endpoint này nên thứ tự staff thay đổi. Nếu muốn order này chỉ áp cho guest thì phải thêm tham số riêng; plan hiện chấp nhận đổi chung.
2. **"Show all" dùng `useQueries` cho page 2..N** (100 request/trang) để mọi trang đã tải vẫn poll 30s. Nếu bạn muốn đơn giản hơn (chỉ tải 100 và dừng) thì phải bỏ FR-13.
3. **P3 đổi hành vi staff:** "Mark delivered" mở dialog note tuỳ chọn thay vì gửi ngay. Đây là chỗ duy nhất chạm staff view.

---

## Decision

**Approve this gate?**  Approve  /  Refuse

(Approve = proceed to the next stage. Refuse = tell the agent what to change.)
