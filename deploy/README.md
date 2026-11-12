# Deploy Kaneo lên VPS

Tài liệu này mô tả cách `lthoa1807/kaneo` đưa một commit lên production.

Mô hình tách đôi:

```
CI (GitHub Actions, tự động khi push main)
  → build Dockerfile.kaneo (linux/amd64)
  → push ghcr.io/lthoa1807/kaneo:latest + :sha-<12 hex>
  → ghi digest vào Summary của run
  → KHÔNG SSH, KHÔNG deploy

CD (trên VPS, người quản trị chạy)
  → ./deploy sha-<12 hex>
  → backup PostgreSQL, cập nhật .env, pull/up service kaneo, health check
```

Không có SSH key hay mật khẩu VPS nào trong GitHub. Người vận hành là người
quyết định thời điểm và phiên bản; script chỉ làm cho thay đổi đó an toàn.

Deploy luôn dùng tag `sha-<12 hex>`, không bao giờ dùng `latest`, để biết chính
xác commit nào đang chạy.

Thiết kế và kế hoạch: [`docs/deployment/2026-11-12-cicd-deploy-design.md`](../docs/deployment/2026-11-12-cicd-deploy-design.md)
và [`docs/deployment/2026-11-12-cicd-deploy-plan.md`](../docs/deployment/2026-11-12-cicd-deploy-plan.md).

---

## 1. Chuẩn bị VPS (một lần)

### 1.1. Đăng nhập GHCR

Tạo PAT (fine-grained hoặc classic) chỉ có quyền `read:packages`, sau đó trên VPS:

```bash
read -rsp "GHCR PAT: " CR_PAT
echo
printf '%s' "$CR_PAT" | docker login ghcr.io -u lthoa1807 --password-stdin
unset CR_PAT
```

Expected: `Login Succeeded`. Đọc PAT bằng `read -s` để không lưu vào shell history.
Chưa chạy `docker pull` ở bước này: image chỉ tồn tại sau lần build đầu tiên. Giữ
đăng nhập này để `docker compose pull` hoạt động về sau. Nếu package để private,
kiểm tra package `kaneo` đã cấp quyền cho PAT/tài khoản tương ứng.

Chạy `docker login` bằng đúng user sẽ chạy script deploy. Script không đọc
credential; nó để `docker compose pull` xác thực lần cuối và chỉ đổi thông báo
lỗi khi pull bị `unauthorized`/`denied`.

### 1.2. Compose

Trong `/opt/kaneo/compose.yml`, service `kaneo` phải tham chiếu tag bắt buộc:

```yaml
services:
  kaneo:
    image: ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:?KANEO_IMAGE_TAG is required}
```

`:?` là cố ý: nếu thiếu biến, Compose dừng ngay thay vì lặng lẽ chạy một tag
trôi nổi. Điền `KANEO_IMAGE_TAG` trong `/opt/kaneo/.env` (xem 1.4).

### 1.3. Cài script deploy

Copy `scripts/deploy/vps-deploy.sh` lên VPS và đặt tên `deploy` trong thư mục
compose:

```bash
install -m 0755 scripts/deploy/vps-deploy.sh /opt/kaneo/deploy
```

Script chạy bằng user sở hữu `/opt/kaneo` và có quyền dùng Docker. User thuộc
group `docker` thực tế gần tương đương root, nên vẫn phải bảo vệ tài khoản đó.

### 1.4. `.env`

`/opt/kaneo/.env` là nguồn duy nhất của tag. Thêm dòng:

```env
KANEO_IMAGE_TAG=sha-<12 hex>
```

Lần đầu, xác định tag SHA tương ứng với image đang chạy thực tế và ghi vào
`.env`. Không dùng `latest` làm tag bootstrap cho production. Sau đó script quản
lý dòng này.

Điều kiện script kiểm tra trước khi deploy:

- `/opt/kaneo` tồn tại, ghi được, có `compose.yml` và `.env`;
- `.env` không phải symlink, không dùng CRLF, ghi được;
- Docker daemon truy cập được.

### 1.5. Biến tuỳ chọn

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `KANEO_COMPOSE_DIR` | `/opt/kaneo` | Thư mục chứa `compose.yml`, `.env`, lock, tag file |
| `KANEO_BACKUP_DIR` | `$HOME/kaneo-backups` | Nơi lưu dump PostgreSQL |
| `KANEO_HEALTH_ATTEMPTS` | `45` | Số lần kiểm tra health |
| `KANEO_HEALTH_INTERVAL` | `5` | Giây giữa hai lần kiểm tra |

Hai biến health chỉ để rút ngắn test; production nên giữ mặc định (45 × 5s =
225 giây, dài hơn mức tối đa 150 giây mà healthcheck của repo cần để báo
`unhealthy`).

---

## 2. CI: build và publish

Workflow `.github/workflows/publish-main.yml` chạy khi push lên `main` hoặc
dispatch tay. Nó chỉ:

1. build `Dockerfile.kaneo` cho `linux/amd64`;
2. push `ghcr.io/lthoa1807/kaneo:latest` và `:sha-<12 hex>`;
3. ghi tag + digest vào **Summary** của run.

Workflow không có secret VPS, không SSH, không deploy. `concurrency:
publish-main` với `cancel-in-progress: false` xếp hàng các lần build.

Lấy tag vừa publish:

```bash
gh run list -R lthoa1807/kaneo --workflow publish-main.yml --limit 5
gh run view -R lthoa1807/kaneo <run-id>   # xem digest trong Summary
```

Hoặc vào GitHub → **Actions** → **Publish main image**.

Tag cũng có thể lấy từ GitHub → **Packages** → `kaneo`.

---

## 3. Deploy

```bash
cd /opt/kaneo
./deploy sha-a1b2c3d4e5f6
```

Script thực hiện, theo thứ tự:

1. **Lock** `.deploy.lock` bằng `flock -n`. Deploy thứ hai đang chạy sẽ bị từ chối.
2. **Không làm gì** nếu `.env` đã đúng tag (trừ khi `--force`).
3. **Backup PostgreSQL**:
   - kiểm tra container `postgres` đang chạy và `pg_isready`;
   - kiểm tra dung lượng trước dump (ước lượng `3 ×` bản backup gần nhất, tối
     thiểu 256 MiB). Đây là kiểm tra dự phòng, không bảo đảm dump thành công —
     exit code của `pg_dump` mới là điều kiện;
   - `pg_dump -Fc` vào file tạm, kiểm tra không rỗng, kiểm tra `pg_restore --list`
     đọc được, rồi mới promote thành
     `$KANEO_BACKUP_DIR/kaneo-<UTC>-<tag>.dump` (mode 600, thư mục 700);
   - backup fail → dừng, `.env` chưa bị đổi.
4. **Cập nhật `.env` atomic**: giữ mọi biến khác, thay đúng dòng
   `KANEO_IMAGE_TAG=`, tạo `.env` tạm rồi `mv`. Lần đầu tạo `.env.bak` (mode 600)
   và không ghi đè về sau.
5. **Pull** `docker compose pull kaneo`. Nếu bị `unauthorized`/`denied`, script
   in hướng dẫn `docker login ghcr.io`.
6. **Up** `docker compose up -d --no-deps kaneo`, để Postgres và service khác
   không bị recreate.
7. **Xác minh 3 lớp**:
   - `Config.Image` của container khớp image reference lấy từ
     `docker compose config --images`;
   - image ID của container khớp image vừa pull;
   - digest đọc được từ `RepoDigests`; rỗng thì dừng.
8. **Health**: chờ tới khi `healthy`. Các trạng thái khác đều fail:
   `unhealthy`, `no-healthcheck`, container không chạy, hoặc quá 225 giây.
9. **Ghi `.last_good_image_tag`** bằng tag vừa deploy thành công.

Khi fail, script in block trạng thái và không tự rollback image, không tự
restore database:

```
[deploy] configured      : sha-cccccccccccc
[deploy] running         : ghcr.io/lthoa1807/kaneo:sha-cccccccccccc
[deploy] last known good : sha-bbbbbbbbbbbb
[deploy] rollback target : sha-bbbbbbbbbbbb
[deploy] database backup : /home/user/kaneo-backups/kaneo-...dump
[deploy] to roll back    : ./deploy sha-bbbbbbbbbbbb
[deploy] ERROR: ...
```

### `--force`

```bash
./deploy --force sha-a1b2c3d4e5f6
```

Deploy lại đúng tag đang cấu hình (vẫn backup, pull, up, health).

### `--status`

```bash
./deploy --status
```

Chỉ đọc, không cần Compose hợp lệ và không đổi gì. In:

```
compose dir    : /opt/kaneo
configured     : sha-bbbbbbbbbbbb
last known good: sha-bbbbbbbbbbbb
running        : ghcr.io/lthoa1807/kaneo:sha-bbbbbbbbbbbb
running id     : sha256:...
running digest : ghcr.io/lthoa1807/kaneo@sha256:...
latest backup  : /home/user/kaneo-backups/kaneo-...dump
rollback target: sha-bbbbbbbbbbbb
```

Nếu container đã dừng, `running` hiển thị `<stopped container ...>`; nếu chưa
có container, `<no container>`.

---

## 4. Rollback

Rollback target **luôn** là `.last_good_image_tag`, không phải tag cũ trong
`.env`.

Ví dụ:

| Thao tác | `.env` | `.last_good_image_tag` |
|---|---|---|
| Deploy A thành công | A | A |
| Deploy B bắt đầu | B | A |
| Deploy B thất bại | B | A |
| Deploy C thất bại | C | A |

Lúc này rollback về B là sai; target đúng là A.

```bash
cd /opt/kaneo
cat .last_good_image_tag
./deploy "$(cat .last_good_image_tag)"
```

Nếu deploy fail, output cuối đã in sẵn dòng `to roll back: ./deploy <tag>`.
Nếu chính lần rollback cũng fail, last good không đổi, nên có thể thử lại hoặc
lùi xa hơn bằng một tag SHA cũ hơn trong GHCR.

Rollback **không** tự khôi phục database. Nếu bản deploy lỗi đã chạy migration
không tương thích, cần khôi phục backup theo một quy trình riêng.

Các lệnh sau chỉ giúp **tìm và kiểm tra** backup, không thực hiện restore:

```bash
ls -lt "$HOME/kaneo-backups"/kaneo-*.dump | head
docker compose exec -T postgres pg_restore --list < <backup>.dump
```

Việc khôi phục database là thao tác riêng biệt: phải xác định rõ database đích,
chấp nhận mất dữ liệu phát sinh sau thời điểm backup, và có runbook restore
riêng trước khi chạy `pg_restore`. Backup được tạo **trước** khi đổi `.env`, nên
nó phản ánh trạng thái trước lần deploy đó.

---

## 5. File trên VPS

| Đường dẫn | Vai trò |
|---|---|
| `.env` | Nguồn duy nhất của `KANEO_IMAGE_TAG` và cấu hình ứng dụng |
| `.env.bak` | Bản `.env` đầu tiên trước lần deploy đầu; tạo một lần, mode 600 |
| `.last_good_image_tag` | Tag đã deploy thành công gần nhất; rollback target |
| `.deploy.lock` | Lock chống deploy đồng thời |
| `$KANEO_BACKUP_DIR/kaneo-*.dump` | Backup `-Fc`, giữ 14 bản mới nhất theo mtime |

Retention chạy **sau** khi backup mới đã promote. Backup fail thì không xoá bản
cũ nào.

Không commit các file trên vào Git.

---

## 6. Xử lý sự cố

| Triệu chứng | Kiểm tra |
|---|---|
| `another deployment is already running` | Có tiến trình deploy khác đang giữ lock; kiểm tra tiến trình dùng file bằng `fuser .deploy.lock`. File `.deploy.lock` còn lại sau deployment là bình thường, không cần xóa |
| `cannot open lock file` | User chạy script không ghi được `/opt/kaneo` |
| `image pull was denied` | Chưa `docker login ghcr.io` bằng đúng user, PAT hết hạn, hoặc thiếu quyền package |
| `invalid image tag` | Tag không khớp `sha-<12 hex thường>`; lấy lại từ Summary của workflow |
| `postgres container not found` | Tên service database khác `postgres`; script giả định service tên `postgres` |
| `pg_dump failed` | Xem log; `.env` chưa bị đổi, có thể sửa rồi chạy lại |
| `backup archive is not readable` | Dump hỏng hoặc `pg_restore` lỗi; `.env` chưa bị đổi |
| `container has no healthcheck` | Image không có `HEALTHCHECK`; không deploy image đó |
| container `unhealthy` | `docker compose logs --tail=200 kaneo`; rollback bằng tag trong output |
| `image digest unavailable` | Docker không có `RepoDigests` (image build local); chỉ deploy image pull từ registry |
| Deploy treo | Tối đa 225 giây rồi fail; giảm bằng `KANEO_HEALTH_*` chỉ khi test |
| `docker compose config failed` | `.env` thiếu biến bắt buộc hoặc compose sai cú pháp |

---

## 7. Ghi chú vận hành

- Không có deploy tự động: push `main` chỉ tạo image. VPS đổi phiên bản khi
  người quản trị chạy `./deploy`.
- Không có SSH credential của VPS trong GitHub.
- `docker compose up -d --no-deps kaneo` chỉ thay container `kaneo`; Postgres
  không bị recreate.
- Script không tự rollback và không tự restore database; đó là quyết định thủ
  công vì cả hai đều có thể mất dữ liệu.
- Build chỉ chạy trên `ubuntu-latest`, platform `linux/amd64`.
- Không gate bằng `ci.yml` upstream; chốt chặn là build thành công, xác minh
  image và health check trên VPS. Build và health check **không** thay thế việc
  review commit/diff trước khi người quản trị quyết định deploy.

## 8. Test script

Harness chạy toàn bộ logic với Docker giả, kiểm cả exit code và side effect:

```bash
bash scripts/deploy/test/run.sh
```

`KEEP=1` giữ thư mục làm việc để xem output. Harness **không** thay thế kiểm
chứng trên Docker thật: `pg_dump -Fc`, `pg_restore --list`, image ID/digest,
health và việc Postgres không bị recreate vẫn nên xác nhận trên VPS trước khi
tin tưởng hoàn toàn.
