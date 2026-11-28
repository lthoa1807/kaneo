# Project Context: guest-request-tracking

## Current system

- **Repo map:** đọc `REPO_MAP.md` trước khi khảo sát repo (AGENTS.md yêu cầu); file này là nguồn cho path/command/architecture flow.
- **Architecture / framework / technology:** pnpm monorepo. `apps/api` là Hono + Drizzle + PostgreSQL, sở hữu domain và authorization. `apps/web` là React 19 + Vite + TanStack Router/Query. `packages/libs` chứa typed Hono client, `packages/permissions` chứa vocabulary/permission. Redis là tuỳ chọn. Intake MVP dùng polling 30 giây, chưa có WebSocket.
- **Coding conventions:** route khai báo bằng `createRoute` + Zod + OpenAPI; controller mỏng, behavior nằm trong controller/service hiện có; web dùng fetcher + TanStack Query hook; mọi copy qua i18n key, nguồn là `i18n/en-US.json`; một component một file, helper/type thuần tách file riêng cạnh chỗ dùng, test đặt cạnh code.
- **Repository structure:**
  - API intake: `apps/api/src/intake/` (`controllers/`, `schema.ts`, `response.ts`, `index.ts`).
  - Web intake: `apps/web/src/components/intake/`, `fetchers/intake/`, `hooks/queries/intake/`, `hooks/mutations/intake/`, `types/intake.ts`.
  - Routes guest: `apps/web/src/routes/_layout/_authenticated/dashboard/workspace/$workspaceId/my-requests.tsx` và `.../project/$projectId/requests/`.
  - i18n: `i18n/en-US.json`, namespace `intake`.
- **Relevant database schema:** `intakeRequestTable` (status 8 giá trị, `number` theo project, `createdById` là owner, `projectId`, `confirmedAt`/`confirmedVia`); `taskTable.intakeRequestId` nối task; `projectTable.intakeEnabled` bật/tắt intake.
- **Relevant existing APIs:**
  - `GET /api/v1/workspaces/{wsId}/intake-requests?projectId=&status=&page=&limit=` — guest chỉ thấy request mình tạo trong project còn quyền truy cập; manage thấy mọi request trong project accessible. Item embed `projectName`, `taskCount`, `completedTaskCount`.
  - `GET /api/v1/intake-requests/{id}` — detail + linked tasks (staff) / progress summary (guest).
  - `GET /api/v1/intake-requests/{id}/activity`, `POST .../transition`, `POST .../tasks`.
  - `GET /api/v1/workspaces/{wsId}/intake-projects` — project picker cho guest.
- **Authentication / Authorization:** role `guest` có `intakeRequest` nhưng không có `task:*`/`project:*`. API enforce ownership (`createdById`) và project access; UI chỉ ẩn control, không phải authorization.
- **Current design system:** Tailwind token + primitive trong `apps/web/src/components/ui` (Base UI + Radix). Badge tone theo status, text label luôn đi kèm (màu không phải tín hiệu duy nhất). `IntakeStatusBadge`, `IntakeProgress` (Base UI `Progress`). Dashboard có house pattern `MetricTile` + `WidgetCard`. Guest portal dùng layout `max-w-3xl`, list dạng row, filter chip wrap.
- **Related modules:** `guest-portal-page.tsx` (dùng chung cho `/my-requests` và project `/requests`), `guest-portal-layout.tsx`, `intake-request-list.tsx`, `intake-progress.tsx`, `guest-request-detail.tsx`, `intake-request-detail.tsx`, `staff-intake-page.tsx`, dashboard `metric-tile.tsx`/`intake-queue.tsx`.
- **Testing infrastructure / commands:** unit test Vitest cạnh component; integration test ở `tests/api-integration/` (đã có `intake-list-and-detail.test.ts`). Lệnh scoped: `pnpm --filter @kaneo/web test`, `pnpm --filter @kaneo/api test`, `pnpm --filter @kaneo/web typecheck`, `pnpm --filter @kaneo/api typecheck`; một file: `pnpm --filter @kaneo/api exec vp test run --config vitest.config.ts <path>`. Repo-wide (chỉ khi được phép): `pnpm test`, `pnpm typecheck`, `pnpm lint`. Sau thay đổi route/schema: `pnpm openapi:check:fix`. Sau copy mới: `pnpm i18n:check:fix`. Migration: `pnpm --filter @kaneo/api db:generate`.
- **Build commands:** `pnpm build`; package: `pnpm --filter @kaneo/web build`, `pnpm --filter @kaneo/api build`.

## Git

- **Current branch:** `feature/guest-request-tracking`
- **Base SHA:** `32ba26385ed6d4d3d8abaeafa3f13e564ac4d95e`
- **Pre-existing uncommitted changes:** none. Working tree sạch trước khi `wf init`; hiện chỉ có `docs/feature-development/guest-request-tracking/` do `wf init` tạo.

## Skills available in the environment

| Skill | Available | Notes |
|---|---|---|
| Superpowers | yes | `brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `verification-before-completion`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review`, `using-git-worktrees` |
| Hallmark | yes | Dùng ở S2 cho prototype/UI mới. Trong repo hiện có, chạy ở app-screen mode và giữ nguyên hệ thống hiện tại; không redesign UI đã duyệt. Floor vẫn bind. |
| Astryx (does the project use Astryx?) | no | Chưa cài, không có dependency. Chính sách repo (`docs/dashboard/design-spec.md`): chỉ đánh giá sau v1 hoặc khi được duyệt rõ ràng; không thêm styling system thứ hai. Chỉ tư vấn, không cài trong feature này nếu chưa được duyệt. |
| Modern Web Guidance | yes | CLI `npx -y modern-web-guidance@latest search/retrieve`; dùng trước khi viết CSS/JS. Đã tham chiếu `progress`, `single-line-overflow` cho feature này. |
| Ponytail | yes | Active, level `full`. |
| Open Code Review (`ocr`) | yes | Tools `ocr_health`, `ocr_review`; dùng S4/S5, không auto-fix, không sửa ngoài phase scope. |
| Plannotator | yes | Repo bắt buộc mọi review (prototype, spec, plan, diff) qua Plannotator; user mở và duyệt. |
| ui-ux-pro-max | yes | Dùng cho checklist UX/a11y ở bước tư vấn. |
| Repo-declared workflow skills | — | `AGENTS.md`: mục "Workflow skills" để trống; có rule Plannotator cho mọi review và `ci-gates` cho gate nặng. |

**Astryx interpretation:** "meta/astryx" là thư viện UI tại `https://github.com/meta/astryx`, không phải skill đã cài. Vai trò trong feature này là nguồn tham khảo component/a11y; mọi quyết định adopt dependency phải được user duyệt riêng.

## Proposed profile

- `full`
- **Reason:** user yêu cầu rõ ràng UX/UI consultation với Hallmark, Modern Web Guidance và đánh giá Astryx. Profile `full` có S2 UX/UI để chốt design trước khi viết code, thay vì trộn quyết định thiết kế vào phase implementation. Bản thân feature nhỏ (summary + tracking); nếu user muốn bỏ S2 thì hạ xuống `standard` — quyết định của user, không tự hạ.

## UI/UX constraints (consultation notes — chốt ở S1/S2)

1. **Giữ hệ thống hiện có.** Dùng primitive/token trong `components/ui`, `IntakeStatusBadge`, `IntakeProgress`, pattern `MetricTile`. Không thêm styling system, không đổi màu/typography toàn cục, không sửa primitive đã có.
2. **Một ý tưởng mỗi màn hình.** Guest portal vẫn là danh sách việc của tôi + một primary action "New request". Overview không được biến thành dashboard analytics.
3. **Overview nên hoà vào filter, không chồng thêm một tầng.** Ưu tiên hiển thị count ngay trên nhóm filter hiện có (Tất cả / Đang xử lý / Chờ bạn xác nhận / Đã đóng 7 ngày) và một banner hành động chỉ khi có request `delivered`. Tránh hàng 4 KPI card trên một danh sách cá nhân: trùng số với filter, trông như template, và làm loãng việc chính.
4. **Tracking phải trung thực với lifecycle.** Status không tuyến tính (`rejected`, `needs_revision` quay lại `in_progress`). User muốn stepper trực quan, nên stepper được phép, nhưng phải vẽ đúng: đường chính `Đã gửi → Đang xem xét → Đang thực hiện → Chờ bạn xác nhận → Hoàn tất`, còn `rejected` và `needs_revision` hiển thị như nhánh trạng thái riêng, không giả vờ đi tiếp trên đường thẳng. Timeline/activity hiện có vẫn giữ để xem chi tiết.
5. **Copy:** sentence case, không label in hoa tracking rộng, không nối metadata bằng dấu chấm giữa, không icon/dot trang trí mang nghĩa. Badge luôn có text; màu chỉ là phụ.
6. **Accessibility:** count có nhãn ngữ cảnh ("3 yêu cầu đang xử lý"), không announce một con số trần. Polling 30 giây không được biến mọi count thành live region; chỉ count "cần bạn xác nhận" mới có thể là `role="status"`/polite. Filter/tile là `<button>` thật, có `aria-pressed`, focus-visible rõ, target ≥44px. Không dời focus khi count đổi.
7. **Không layout shift khi poll:** số dùng `tabular-nums`, vùng count có kích thước ổn định; skeleton khớp layout thật.
8. **Responsive:** kiểm tra 375px. Filter chip wrap (không cắt label); count không bị che; row list wrap thay vì truncate mất thông tin. `text-overflow: ellipsis` chỉ để hiển thị, text đầy đủ vẫn nằm trong DOM/accessible name.
9. **Dark mode:** chỉ dùng semantic token; text ≥4.5:1, non-text ≥3:1; kiểm tra riêng dark mode, không suy từ light.
10. **Motion:** mặc định không thêm animation. Nếu có, chỉ `transform`/`opacity`, có fallback `prefers-reduced-motion: reduce`, không animate `width/height/top/left`, không `transition: all`.
11. **Data honesty:** count lấy từ aggregate server trên đúng scope access, không suy ra từ một trang item (staff view đã có cảnh báo truncation). Tổng và danh sách phải cùng một nguồn sự thật.
12. **Dependency:** không thêm package. Astryx chỉ được đề xuất component cụ thể kèm lợi ích rõ ràng và phải được user duyệt trước khi cài.

## Decisions from the S0 annotation round

1. **"Chờ xác nhận"** = guest chờ chính guest xác nhận để đóng request, tức status `delivered`. Không phải `new`/`triaged`.
2. **Stepper:** có triển khai, ưu tiên trực quan. Phải có nhánh cho `rejected` và `needs_revision` (xem ràng buộc UI/UX #4).
3. **Request đã đóng:** đưa vào summary, giới hạn **7 ngày gần nhất**. Cần chốt mốc thời gian: `confirmedAt` cho `confirmed`, và thời điểm chuyển sang `rejected` cho `rejected` (activity gần nhất hoặc `updatedAt` nếu không có activity) — sẽ chốt ở S1.
4. **Phạm vi route (còn mở):** `/my-requests` là trang workspace-level, gom request của guest trên mọi project họ được mời. `/project/$projectId/requests` là trang trong một project, chỉ request của project đó. Cả hai đang dùng chung `GuestPortalPage`. Mặc định đề xuất áp dụng cho **cả hai** vì cùng một component; nếu chỉ muốn một nơi thì phải tách behavior.

