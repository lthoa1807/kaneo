# Kế hoạch: CI publish image, CD thủ công trên VPS

Ngày: 2026-11-12
Trạng thái: đã triển khai

**Mục tiêu:** push lên `main` → GitHub Actions build và push image
`ghcr.io/lthoa1807/kaneo:sha-<12 hex>` → người quản trị chạy
`./deploy sha-<12 hex>` trên VPS. Deploy có backup, xác minh image, health check
và rollback thủ công.

## 1. Phạm vi thay đổi

| File | Thay đổi |
|---|---|
| `.github/workflows/publish-main.yml` | Thay `deploy.yml`; chỉ build + push GHCR + summary digest |
| `compose.yml` | `ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:?KANEO_IMAGE_TAG is required}` |
| `.env.sample` | Thêm `KANEO_IMAGE_TAG=` kèm giải thích |
| `scripts/deploy/vps-deploy.sh` | Viết lại: lock, backup, `.env` atomic, verify 3 lớp, health 225s, `--status`, `--force` |
| `scripts/deploy/test/run.sh` | Harness 28 kịch bản, kiểm exit code + side effect |
| `scripts/deploy/test/fake-bin/docker` | Docker giả điều khiển qua `$FAKE_STATE` |
| `scripts/deploy/test/fake-bin/df` | `df` giả cho nhánh kiểm tra dung lượng |
| `scripts/deploy/test/fake-bin/mktemp` | `mktemp` giả để ép lỗi ghi trạng thái sau health |
| `deploy/README.md` | Hướng dẫn vận hành mới |
| `docs/deployment/*` | Thiết kế và kế hoạch mới |
| `ENVIRONMENT_SETUP.md` | Nêu `KANEO_IMAGE_TAG` khi chạy bằng Compose |

## 2. Các bước triển khai

### Bước 1 — Workflow

- `git mv .github/workflows/deploy.yml .github/workflows/publish-main.yml`.
- Xoá job `deploy`, input `image_tag`, toàn bộ bước SSH.
- Giữ build/push `latest` + `sha-<12 hex>`, platform `linux/amd64`, runner
  `ubuntu-latest`, `concurrency: publish-main`, `cancel-in-progress: false`.
- Ghi tag và digest vào `$GITHUB_STEP_SUMMARY`.

**Nghiệm thu:** workflow không còn tham chiếu secret `VPS_*`; YAML parse được;
chỉ một job.

### Bước 2 — Compose

- Đổi image service `kaneo` sang
  `${KANEO_IMAGE_TAG:?KANEO_IMAGE_TAG is required}`.
- Thêm `KANEO_IMAGE_TAG=` vào `.env.sample` với comment: tag do workflow publish,
  dạng `sha-<12 hex>`; Compose từ chối chạy nếu thiếu.
- Không đổi service Postgres, volume, healthcheck.

**Nghiệm thu:** `docker compose config` fail khi thiếu biến, pass khi có biến.

### Bước 3 — Script deploy

Cấu trúc hàm:

| Hàm | Trách nhiệm |
|---|---|
| `preflight_deploy` | Thư mục/quyền/`.env`/Docker |
| `acquire_lock` | `flock -n` trên `.deploy.lock` |
| `backup_database` | `pg_isready`, dung lượng, `pg_dump -Fc`, validate, promote |
| `prune_backups` | Giữ 14 bản theo mtime, chạy sau promote |
| `write_env_tag` | `.env` atomic, giữ biến khác, `.env.bak` một lần |
| `verify_running_image` | reference + image ID + digest |
| `wait_for_health` | 45 × 5s, fail rõ từng trạng thái |
| `collect_diagnostics` | container state, compose ps, logs, configured/running/last good/rollback |
| `show_status` | `--status`, không phụ thuộc Compose |

**Nghiệm thu:** `bash -n` pass; mọi nhánh fail đều không ghi đè
`.last_good_image_tag`.

### Bước 4 — Harness

- Fake `docker` trả lời đúng các lệnh script gọi; trạng thái qua file trong
  `$FAKE_STATE`.
- Fake `df` trả `avail_bytes`.
- Mỗi case kiểm exit code **và** side effect: `.env`, `.last_good_image_tag`,
  số backup, file bị xoá, Postgres không bị recreate (qua fake).

Ma trận:

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Happy path | rc=0, `.env`=tag mới, last good=tag mới, 1 backup |
| 2 | Tag sai định dạng | rc=1, không đổi `.env`, không backup |
| 3 | Deploy trùng tag | rc=0, không backup |
| 4 | `--force` trùng tag | rc=0, có backup, last good cập nhật |
| 5 | `pg_dump` fail | rc=1, `.env` nguyên, không backup |
| 6 | Archive không đọc được | rc=1, `.env` nguyên, không promote |
| 7 | Không có container Postgres | rc=1, dừng trước dump |
| 8 | Postgres chưa ready | rc=1, retry rồi dừng |
| 9 | Đĩa không đủ | rc=1, dừng trước dump |
| 10 | Pull bị denied | rc=1, gợi ý `docker login`, last good nguyên |
| 11 | `up` fail | rc=1, last good nguyên |
| 12 | Unhealthy | rc=1, in rollback target, last good nguyên |
| 13 | Không có healthcheck | rc=1, không báo thành công |
| 14 | Health timeout | rc=1, thông báo timeout |
| 15 | Digest rỗng | rc=1, không ghi last good |
| 16 | Image ref sai repo | rc=1, phát hiện mismatch |
| 17 | Image ID mismatch | rc=1, phát hiện mismatch |
| 18 | `.env` CRLF | rc=1, dừng |
| 19 | `.env` symlink | rc=1, dừng |
| 20 | `--status` | rc=0, in configured/last good/rollback |
| 21 | `--status` khi chưa có tag | rc=0, `<unset>` |
| 22 | Lock đang giữ | rc=1, `.env` nguyên |
| 23 | Hai deploy đồng thời | đúng một thắng, một bị từ chối, một backup |
| 24 | Retention 16 → 14 | còn 14, giữ bản mới nhất, xoá bản cũ nhất |
| 25 | `.env` có hai dòng tag | còn đúng một dòng, giữ biến khác |
| 26 | Không ghi được `.last_good_image_tag` | rc≠0, `.env` đã đổi, last good giữ nguyên, không còn file tạm |
| 27 | `--status` khi container dừng | rc=0, `<stopped container ...>`, state không đổi |
| 28 | `--status` khi chưa có container | rc=0, `<no container>`, state không đổi |

**Nghiệm thu:** `bash scripts/deploy/test/run.sh` → `0 failed`.

### Bước 5 — Tài liệu

- `deploy/README.md`: mô hình CI/CD mới, chuẩn bị VPS, deploy, `--status`,
  `--force`, rollback từ `.last_good_image_tag`, file state, xử lý sự cố.
- `docs/deployment/2026-11-12-cicd-deploy-design.md`: thiết kế đã chốt.
- `docs/deployment/2026-11-12-cicd-deploy-plan.md`: kế hoạch này.
- `ENVIRONMENT_SETUP.md`: người self-host phải đặt `KANEO_IMAGE_TAG` (`latest`
  hoặc tag cụ thể) trước khi `docker compose up`.

## 3. Việc người vận hành làm một lần

1. Xoá 6 secret `VPS_*` khỏi GitHub (không còn dùng).
2. Trên VPS: xoá key `kaneo-deploy` khỏi `~/.ssh/authorized_keys` của user
   deploy, và xoá key tương ứng ở máy local nếu không dùng cho việc khác.
3. Trên VPS: `docker login ghcr.io` bằng PAT `read:packages`.
4. Cập nhật `/opt/kaneo/compose.yml` sang dòng image mới.
5. Thêm `KANEO_IMAGE_TAG=<tag>` vào `/opt/kaneo/.env` (có thể là tag đang chạy).
6. Cài `scripts/deploy/vps-deploy.sh` thành `/opt/kaneo/deploy` (mode 0755).
7. Push commit lên `main`, chờ workflow `Publish main image` xanh, lấy tag SHA.
8. Chạy `cd /opt/kaneo && ./deploy sha-<12 hex>`.
9. Kiểm tra `./deploy --status` và `docker compose ps`.

## 4. Kiểm chứng

Đã chạy:

- `bash -n` cho script, harness và hai fake binary.
- `bash scripts/deploy/test/run.sh` → 105 passed, 0 failed.
- End-to-end với Docker thật (registry local, Postgres thật, image có
  healthcheck):
  - Postgres giữ nguyên container ID;
  - `kaneo` được recreate sang tag mới;
  - backup `-Fc` đọc được bằng `pg_restore --list`;
  - dữ liệu còn nguyên sau deploy;
  - deploy image hỏng → rc=1, in đúng block trạng thái, last good không đổi;
  - rollback về tag cũ thành công;
  - `--status` in đúng configured/running/digest/rollback target.

Chưa chạy:

- `shellcheck`, `actionlint` (không có trên máy kiểm thử).
- Trên VPS thật với GHCR thật và dữ liệu thật.

## 5. Tiêu chí hoàn thành

- Push `main` chỉ tạo image, không deploy.
- Không còn secret SSH VPS trong GitHub.
- `./deploy latest` bị từ chối.
- Deploy thành công ghi `.env` và `.last_good_image_tag` đúng.
- Deploy fail không ghi đè `.last_good_image_tag`.
- Backup fail dừng trước khi đổi `.env`.
- Retention giữ 14 bản mới nhất.
- Tài liệu không còn mô tả SSH deploy, `.deploy.env`, `.previous_image_tag`,
  `deploy.yml`, hay timeout 150 giây.
