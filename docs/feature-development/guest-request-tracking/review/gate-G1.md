# Gate G1: Requirements approval
Feature: guest-request-tracking | Prepared on 2026-11-27 | Version: 3

**Review:** `requirement-spec.md`

**Summary:** Spec v3 gộp ba thay đổi: (1) action **Need feedback** thay "Request changes", giữ vòng lặp `delivered → needs_revision` trên cùng request và hiện note hai chiều; (2) summary chỉ đếm 3 nhóm đang mở — request `confirmed`/`rejected` không vào chart, chỉ nằm trong "Tất cả" và danh sách; lọc request đã xong là feature riêng; (3) bỏ lọc theo cột (search/project/status/progress/updated) và thêm "Show all requests" tải 100 request mỗi lần. Count vẫn server-side, không migration, không đổi staff view ngoài optional note khi deliver lại.

**Open points:**

1. **Chạm staff view (v2).** Staff detail cần dialog optional-note khi deliver lại (hiện dialog chỉ mở khi note bắt buộc), và `IntakeActivityList` phải render `content` của entry `status_changed`. Không thêm API/bảng/transition mới — cần duyệt cùng G1.
2. **"Show all requests" tải tuần tự.** Mỗi lần 100 request; guest có 150 request sẽ là 2 lần gọi liên tiếp. Chấp nhận trong scope feature này (FR-13).

---

## Decision

**Approve this gate?**  Approve  /  Refuse

(Approve = proceed to the next stage. Refuse = tell the agent what to change.)
