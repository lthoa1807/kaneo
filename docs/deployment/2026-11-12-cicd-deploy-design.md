# Thiết kế: CI/CD build image và deploy lên VPS

Ngày: 2026-11-12
Trạng thái: chờ duyệt (đã cập nhật theo góp ý)

## Mục tiêu

Mỗi commit mới lên `main` của `lthoa1807/kaneo`:

1. GitHub Actions build Docker image từ `Dockerfile.kaneo` (image gộp web + API, có HEALTHCHECK sẵn).
2. Push image lên GHCR: `ghcr.io/lthoa1807/kaneo` với tag `latest` và `sha-<commit>`.
3. SSH vào VPS, deploy **đúng tag SHA của commit vừa build** (không dùng `latest` khi deploy).
4. Kiểm tra container healthy trong thời gian giới hạn; nếu lỗi thì in logs và đánh đỏ workflow.
5. Ghi lại tag đang chạy để có thể quay lại tag trước.

## Không nằm trong phạm vi

- Không sửa workflow upstream dùng runner Blacksmith (`ci.yml`, `release.yml`, …).
- Không build 3 image riêng `kaneo` / `web` / `api`; chỉ build image gộp.
- Không blue-green, không auto-rollback (rollback thủ công qua workflow).
- Không deploy staging.

## Cách làm đã chọn

(1) Actions build + GHCR + SSH deploy — chọn. (2) VPS tự build — loại vì tốn RAM/CPU. (3) Watchtower — loại vì khó kiểm soát thời điểm restart.

## Thiết kế chi tiết

### Workflow mới: `.github/workflows/deploy.yml`

- Trigger: `push` nhánh `main`; `workflow_dispatch` với input `image_tag` (tuỳ chọn) để deploy lại/rollback một tag cũ.
- Runner: `ubuntu-latest`. Pin action theo SHA như chuẩn của repo.
- Quyền: `contents: read`, `packages: write` (chỉ job build cần quyền packages).
- `concurrency: group: kaneo-production`, `cancel-in-progress: false`.
- Job `build`:
  - Checkout đúng commit, `docker/setup-buildx-action`, `docker/build-push-action`.
  - Image: `ghcr.io/lthoa1807/kaneo`, platform `linux/amd64` (VPS đã xác nhận `x86_64`).
  - Tag: `latest` + `sha-<short-sha>`; output `sha_tag` cho job deploy.
  - Login GHCR bằng `GITHUB_TOKEN`.
- Job `deploy` (`needs: build`):
  - Nếu chạy thủ công với `image_tag`, dùng tag đó; ngược lại dùng `sha-<short-sha>` vừa build.
  - SSH bằng key riêng (secret `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`, `VPS_PATH`).
  - Trên VPS:
    1. Lưu tag đang chạy vào `.previous_image_tag`.
    2. Ghi tag mới vào `.deploy.env` (`KANEO_IMAGE_TAG=sha-...`).
    3. `docker compose --env-file .deploy.env pull kaneo`.
    4. `docker compose --env-file .deploy.env up -d --no-deps kaneo`.
  - Health check: chờ tối đa 150 giây (HEALTHCHECK có `start-period` 60s), kiểm tra `docker inspect`:
    - container tồn tại và `State.Running == true`;
    - `State.Health.Status == healthy` thì pass;
    - `exited`/`unhealthy`/quá hạn → in `docker compose logs --tail=200 kaneo`, `docker inspect`, thoát mã lỗi.
  - Không gate bằng `ci.yml` (CI upstream phụ thuộc Blacksmith). Build thất bại là chốt chặn; ghi chú rủi ro commit lỗi vẫn deploy.

### Compose trên VPS

`/opt/kaneo/compose.yml`:

```yaml
services:
  kaneo:
    image: ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:-latest}
    # ... phần còn lại giữ nguyên
```

`env_file: .env` của service vẫn giữ nguyên; `.deploy.env` chỉ cấp biến nội suy `KANEO_IMAGE_TAG` qua `--env-file`, không thay thế `.env` ứng dụng.

### Rollback

- Deploy tự ghi tag trước đó vào `/opt/kaneo/.previous_image_tag`.
- Rollback = chạy lại workflow `Deploy` bằng `workflow_dispatch` với `image_tag` là tag cũ (xem trong GHCR hoặc file trên VPS), hoặc SSH và làm tay 3 lệnh tương tự.
- Tài liệu vận hành ghi rõ quy trình này.

### Secret cần tạo trên GitHub repo

| Tên | Nội dung |
| --- | --- |
| `VPS_HOST` | IP/domain VPS |
| `VPS_USER` | User SSH thường, thuộc group docker |
| `VPS_SSH_KEY` | Private key ed25519 riêng cho deploy |
| `VPS_PORT` | Cổng SSH (mặc định 22) |
| `VPS_PATH` | `/opt/kaneo` |
| `VPS_GH_PACKAGE_TOKEN` | PAT `read:packages` để VPS pull image (đã có) |

### Bảo mật

- PAT VPS chỉ quyền `read:packages`; key SSH chỉ dùng cho deploy, không dùng key cá nhân.
- Không ghi token/key vào workflow hay log.
- `GITHUB_TOKEN` chỉ dùng trong job build với `packages: write`.
- Lưu ý: user thuộc group `docker` tương đương quyền root trên VPS; nếu muốn chặt hơn, dùng sudo có giới hạn lệnh cho user deploy.

## Rủi ro và xử lý

- **GHCR package private**: VPS phải `docker login ghcr.io` một lần; kiểm tra bằng `docker pull` thủ công.
- **Gián đoạn vài giây** khi container restart: chấp nhận cho self-host một instance.
- **Chưa có test gate**: commit lỗi vẫn deploy; bổ sung sau nếu cần.
- **Tag SHA tránh đè `latest`**: deploy luôn dùng tag SHA, `latest` chỉ để tham khảo/kéo tay.

## Việc người dùng đã xác nhận

- VPS kiến trúc `x86_64` → `linux/amd64`.
- Compose `/opt/kaneo/compose.yml`, service `kaneo`.
- Chấp nhận chưa có test gate ở giai đoạn đầu.
- Đồng ý tách workflow riêng, bổ sung concurrency, deploy bằng SHA, health check timeout + logs, rollback.
