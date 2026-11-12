# Thiết kế: CI publish image, CD thủ công trên VPS

Ngày: 2026-11-12
Trạng thái: chốt

## Mục tiêu

Tách build khỏi deploy cho `lthoa1807/kaneo`:

1. Mỗi commit lên `main`, GitHub Actions build image gộp web + API từ
   `Dockerfile.kaneo` và push GHCR.
2. Việc đưa image lên production do người quản trị quyết định, chạy script trên
   VPS.
3. Deploy dùng đúng tag `sha-<12 hex>`, không dùng `latest`.
4. Mọi lần deploy đều có backup PostgreSQL, xác minh image và health check
   trước khi ghi nhận thành công.
5. Không còn credential SSH của VPS trong GitHub.

## Không nằm trong phạm vi

- Không auto-deploy khi push.
- Không blue-green, không auto-rollback image, không auto-restore database.
- Không deploy staging.
- Không sửa workflow upstream dùng runner Blacksmith.
- Không build 3 image riêng `kaneo`/`web`/`api`.

## Cách làm đã chọn

CI tự động (build + publish), CD kích hoạt thủ công (script trên VPS), thực thi
tự động (backup, đổi tag, pull, up, verify, health).

Loại bỏ: SSH deploy từ Actions (credential trong GitHub, khó kiểm soát thời
điểm), Watchtower (khó kiểm soát thời điểm restart), VPS tự build (tốn tài
nguyên).

## Thiết kế chi tiết

### CI: `.github/workflows/publish-main.yml`

- Trigger: `push` nhánh `main`; `workflow_dispatch`.
- Runner: `ubuntu-latest`; action pin theo SHA.
- Quyền: `contents: read`, `packages: write` (chỉ job build).
- `concurrency: group: publish-main`, `cancel-in-progress: false`.
- Job duy nhất `build`:
  - checkout đúng commit;
  - setup Buildx, login GHCR bằng `GITHUB_TOKEN`;
  - build `./Dockerfile.kaneo`, platform `linux/amd64`;
  - push `ghcr.io/<repo>:latest` và `ghcr.io/<repo>:sha-<12 hex>`;
  - ghi tag + digest vào `$GITHUB_STEP_SUMMARY`.
- Không có job deploy, không secret VPS, không SSH.

Tag SHA giúp xác định chính xác commit đang chạy; `latest` chỉ để tham khảo.

### CD: `scripts/deploy/vps-deploy.sh`

Script chạy trên VPS, nhận tag do người vận hành truyền. Nó không chọn phiên
bản, chỉ làm cho thay đổi an toàn.

Thứ tự thực thi:

1. Validate `sha-[0-9a-f]{12}`. Từ chối `latest` và giá trị lạ.
2. Preflight: thư mục compose tồn tại/ghi được, `compose.yml` và `.env` tồn tại,
   `.env` không symlink/CRLF/không ghi được, Docker daemon truy cập được.
3. `flock -n` trên `$KANEO_COMPOSE_DIR/.deploy.lock`; mở lock lỗi hoặc đang bị
   giữ đều fail rõ ràng.
4. Nếu `.env` đã đúng tag và không `--force`: không làm gì.
5. Backup PostgreSQL:
   - service `postgres` phải đang chạy và `pg_isready`;
   - kiểm tra dung lượng dự phòng (`max(3 × bản gần nhất, 256 MiB)`), không thay
     thế kiểm tra exit code;
   - `pg_dump -Fc` ra file tạm, kiểm tra không rỗng và `pg_restore --list` đọc
     được, rồi promote thành `kaneo-<UTC>-<tag>.dump` (600, thư mục 700);
   - fail ở bất kỳ bước nào thì dừng, không đổi `.env`;
   - retention 14 bản theo mtime chạy **sau** khi promote.
6. Cập nhật `.env` atomic: thay đúng một dòng `KANEO_IMAGE_TAG=`, giữ biến
   khác, ghi file tạm rồi `mv`; `.env.bak` chỉ tạo một lần, mode 600.
7. `docker compose pull kaneo`; map `unauthorized`/`denied` thành hướng dẫn
   `docker login ghcr.io`.
8. `docker compose up -d --no-deps kaneo` để không recreate Postgres.
9. Xác minh 3 lớp:
   - `Config.Image` khớp image reference từ `docker compose config --images`
     (so suffix bằng `awk`, yêu cầu đúng một kết quả);
   - image ID của container khớp `docker image inspect .Id`;
   - digest từ `RepoDigests` không rỗng.
10. Health: chờ `healthy`, tối đa 225 giây. `unhealthy`, `no-healthcheck`,
    container dừng, hoặc quá hạn đều fail kèm diagnostics.
11. Ghi `$TARGET_TAG` vào `.last_good_image_tag`.

`--status` chỉ đọc, không phụ thuộc Compose, in configured/running/last good/
digest/backup gần nhất/rollback target.

### Compose

```yaml
services:
  kaneo:
    image: ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:?KANEO_IMAGE_TAG is required}
```

`:?` là fail-safe: thiếu biến thì Compose dừng, không lặng lẽ dùng `latest`.
`.env` là nguồn duy nhất của tag, nên mọi lệnh Compose trần đều cần biến này.

### State trên VPS

| File | Vai trò |
|---|---|
| `.env` | Cấu hình + `KANEO_IMAGE_TAG` |
| `.env.bak` | Bản `.env` đầu tiên trước deploy đầu |
| `.last_good_image_tag` | Tag deploy thành công gần nhất = rollback target |
| `.deploy.lock` | Lock chống deploy đồng thời |
| `kaneo-backups/kaneo-*.dump` | Backup `-Fc`, giữ 14 bản |

### Rollback

Rollback target luôn đọc từ `.last_good_image_tag`, không đọc tag cũ trong
`.env`. Lý do: sau nhiều lần deploy fail, `.env` có thể là tag lỗi mới nhất,
trong khi bản chạy tốt gần nhất là tag khác.

Script không tự rollback và không tự restore database. Khi fail, nó in
configured/running/last good/rollback target/backup và lệnh rollback gợi ý.

## Bảo mật

- Không lưu SSH key/mật khẩu VPS trong GitHub.
- GitHub chỉ dùng `GITHUB_TOKEN` với `packages: write` trong job build.
- VPS dùng PAT `read:packages` để pull; không cấp quyền ghi.
- Script không log giá trị secret; block diagnostics bỏ environment.
- User thuộc group `docker` tương đương root; giới hạn quyền tài khoản deploy.

## Rủi ro và xử lý

- **Gián đoạn vài giây** khi container restart: chấp nhận cho một instance.
- **Chưa có test gate**: commit lỗi vẫn được publish; deploy vẫn qua health
  check. Bổ sung sau nếu cần.
- **Heuristic dung lượng**: không bảo đảm dump thành công khi DB tăng nhanh;
  exit code `pg_dump` là chốt chặn thật.
- **Digest rỗng**: script từ chối ghi nhận deploy, vì không có bằng chứng audit.
- **Backup chưa được test restore tự động**: người vận hành nên thử
  `pg_restore --list` định kỳ và có quy trình restore thủ công.

## Việc đã xác nhận

- VPS `x86_64` → `linux/amd64`; build trên `ubuntu-latest`.
- Compose `/opt/kaneo/compose.yml`, service `kaneo`, database `postgres`.
- Deploy bằng tag SHA, không `latest`.
- Health timeout 225 giây.
- Retention 14 bản.
- Rollback thủ công, target từ `.last_good_image_tag`.
- Harness kiểm cả exit code và side effect.
