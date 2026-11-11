# Deploy Kaneo lên VPS

Tài liệu này hướng dẫn cấu hình một lần và cách vận hành pipeline:

```
push lên main
  → GitHub Actions build Dockerfile.kaneo (linux/amd64)
  → push ghcr.io/lthoa1807/kaneo:latest + :sha-<12 hex>
  → SSH vào VPS
  → scripts/deploy/vps-deploy.sh pull/up service kaneo
  → chờ healthy tối đa 150 giây, fail kèm logs nếu không healthy
```

Deploy luôn dùng tag `sha-<12 hex>`, không dùng `latest`, để biết chính xác commit nào đang chạy.

Thiết kế và kế hoạch triển khai: [`docs/deployment/2026-11-12-cicd-deploy-design.md`](../docs/deployment/2026-11-12-cicd-deploy-design.md) và [`docs/deployment/2026-11-12-cicd-deploy-plan.md`](../docs/deployment/2026-11-12-cicd-deploy-plan.md).

---

## 1. Secret cần tạo trên GitHub

Vào **Settings → Secrets and variables → Actions** hoặc dùng `gh secret set`:

| Secret | Giá trị |
|---|---|
| `VPS_HOST` | IP hoặc domain VPS |
| `VPS_USER` | User SSH dùng để deploy |
| `VPS_PORT` | Cổng SSH, thường `22` |
| `VPS_PATH` | Thư mục compose, thường `/opt/kaneo` |
| `VPS_SSH_KEY` | Nội dung private key deploy (toàn bộ file, gồm cả dòng đầu và dòng cuối) |
| `VPS_KNOWN_HOSTS` | Host key của VPS đã xác minh fingerprint |

Không cần secret GHCR trong workflow: VPS tự đăng nhập GHCR một lần bằng PAT `read:packages`.

### Tạo SSH key và xác minh host key

Trên máy local:

```bash
ssh-keygen -t ed25519 -C "kaneo-deploy" -f ~/.ssh/kaneo_deploy -N ""
cat ~/.ssh/kaneo_deploy.pub
```

Thêm public key vào VPS:

```bash
ssh-copy-id -i ~/.ssh/kaneo_deploy.pub <VPS_USER>@<VPS_HOST>
ssh -i ~/.ssh/kaneo_deploy -p <VPS_PORT> <VPS_USER>@<VPS_HOST> 'docker compose version'
```

Lấy host key và **đối chiếu fingerprint với console/panel của VPS** trước khi lưu:

```bash
ssh-keyscan -p <VPS_PORT> <VPS_HOST> > /tmp/vps_known_hosts
ssh-keygen -lf /tmp/vps_known_hosts
# Trên VPS, in fingerprint để so sánh:
# ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Khi hai fingerprint khớp:

```bash
gh secret set VPS_KNOWN_HOSTS -R lthoa1807/kaneo < /tmp/vps_known_hosts
rm -f /tmp/vps_known_hosts
```

Các secret còn lại:

```bash
printf '%s' "<VPS_HOST>"   | gh secret set VPS_HOST   -R lthoa1807/kaneo
printf '%s' "<VPS_USER>"   | gh secret set VPS_USER   -R lthoa1807/kaneo
printf '%s' "<VPS_PORT>"   | gh secret set VPS_PORT   -R lthoa1807/kaneo
printf '%s' "/opt/kaneo"   | gh secret set VPS_PATH   -R lthoa1807/kaneo
gh secret set VPS_SSH_KEY -R lthoa1807/kaneo < ~/.ssh/kaneo_deploy
```

Khuyến nghị: tạo user riêng `kaneo-deploy`, chỉ có quyền vào `/opt/kaneo` và quyền dùng Docker. Lưu ý thành viên nhóm `docker` thực tế gần tương đương root, nên vẫn phải bảo vệ key cẩn thận.

---

## 2. Chuẩn bị VPS (một lần)

### 2.1. Đăng nhập GHCR

Tạo PAT (fine-grained hoặc classic) chỉ có quyền `read:packages`, sau đó trên VPS:

```bash
echo "<PAT>" | docker login ghcr.io -u lthoa1807 --password-stdin
```

Expected: `Login Succeeded`. Chưa chạy `docker pull` ở bước này: image `ghcr.io/lthoa1807/kaneo:latest` chỉ tồn tại sau lần build đầu tiên của workflow, nên pull sẽ báo not found — bình thường.

Giữ đăng nhập này để `docker compose pull` hoạt động về sau. Nếu package để private, kiểm tra package `kaneo` đã cấp quyền cho PAT/tài khoản tương ứng.

### 2.2. Kiểm tra và backup trước khi đổi

```bash
cd /opt/kaneo
docker compose config --services
docker compose config --images
grep -n 'image:' compose.yml
```

Xác nhận:
- service `kaneo` tồn tại, tên service database đúng (ví dụ `postgres`);
- image của `kaneo` đúng repository hiện tại;
- các service phụ thuộc không đổi.

Backup database (dùng biến môi trường **bên trong container**, không phải shell ngoài):

```bash
docker compose exec -T postgres sh -c \
  'exec pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "/root/kaneo-$(date +%F).sql"
ls -lh "/root/kaneo-$(date +%F).sql"
test -s "/root/kaneo-$(date +%F).sql" && echo 'backup looks non-empty'
```

Đổi `postgres` nếu service database của bạn tên khác. Nếu lần đầu deploy không kèm thay đổi schema, giữ nguyên database như hiện tại để rollback đơn giản.

Sao lưu compose:

```bash
cp compose.yml compose.yml.bak
```

**Không chạy `docker compose down`** trong quá trình chuyển đổi; chỉ để pipeline `up -d --no-deps kaneo` thay container.

### 2.3. Sửa compose để nhận tag

Trong `/opt/kaneo/compose.yml`, đổi image của service `kaneo`:

```yaml
services:
  kaneo:
    image: ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:-latest}
```

Sao lưu trước khi sửa:

```bash
cd /opt/kaneo
cp compose.yml compose.yml.bak
```

Kiểm tra compose đọc đúng tag:

```bash
KANEO_IMAGE_TAG=latest docker compose config | grep image:
# image: ghcr.io/lthoa1807/kaneo:latest
```

`vps-deploy.sh` sẽ tạo và quản lý hai file trong `/opt/kaneo`:

- `.deploy.env` — tag đã áp dụng gần nhất (`KANEO_IMAGE_TAG=sha-...`). Nếu deploy fail, file này giữ tag vừa thử.
- `.previous_image_tag` — tag của lần deploy **thành công** ngay trước đó; không bị ghi đè khi deploy fail.

Cả hai được ghi atomic và có quyền `600`. Không commit chúng vào Git.

Script dùng `docker compose --env-file .env --env-file .deploy.env` khi `.env` tồn tại, ngược lại chỉ dùng `.deploy.env`. Nhờ vậy các biến interpolate khác trong `.env` (mật khẩu Postgres, domain…) không bị mất. Khi chạy lệnh tay, dùng đúng thứ tự này; file sau override file trước.

---

## 3. Deploy

Push commit lên `main`:

```bash
git push origin main
```

Lần deploy đầu tiên:
- build chưa có cache nên thường lâu hơn (10–20 phút);
- chỉ container `kaneo` được thay (`up -d --no-deps kaneo`), database và các service khác giữ nguyên;
- không kèm thay đổi schema/migration trong cùng lần đầu để rollback chỉ là đổi image.

Theo dõi:

```bash
gh run list -R lthoa1807/kaneo --workflow deploy.yml --limit 5
gh run watch -R lthoa1807/kaneo <run-id> --exit-status
```

Job `deploy` sẽ fail nếu:

- tag không đúng định dạng `sha-<12 hex>`;
- `docker pull` hoặc `docker compose up` lỗi;
- container không healthy trong 150 giây;
- container không có `HEALTHCHECK`;
- container thoát hoặc biến mất.

Khi fail, workflow in 200 dòng log gần nhất, trạng thái service và `docker inspect`, rồi trả exit code khác 0. Không có “xanh giả”.

Kiểm tra trên VPS:

```bash
cd /opt/kaneo
cat .deploy.env
docker compose --env-file .env --env-file .deploy.env ps kaneo
docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' \
  "$(docker compose --env-file .env --env-file .deploy.env ps -q kaneo)"
```

Nếu `/opt/kaneo` không có `.env`, bỏ phần `--env-file .env`. Script deploy tự nạp `.env` (nếu có) trước `.deploy.env`, nên các biến interpolate khác như mật khẩu Postgres vẫn giữ nguyên.

---

## 4. Rollback thủ công

1. Xem tag cần quay lại:

   ```bash
   cat /opt/kaneo/.previous_image_tag
   ```

   Hoặc lấy tag `sha-...` trong GitHub → Packages → `kaneo`.

2. GitHub → **Actions** → **Deploy** → **Run workflow**:
   - Branch: `main` (bắt buộc).
   - `image_tag`: nhập tag cũ, ví dụ `sha-a1b2c3d4e5f6`.

3. Workflow bỏ qua bước build, deploy đúng tag đó và vẫn chạy health check.

Nếu deploy fail, `.previous_image_tag` **không** bị ghi đè; `.deploy.env` giữ tag vừa thử. Fallback đúng là tag cũ được in ở dòng `Rollback target:` cuối log job. Nếu rollback cũng fail, log lại in rollback target hiện tại để bạn thử tiếp.

`image_tag` chỉ chấp nhận `sha-<12 ký tự hex thường>`; nhập `latest` sẽ bị từ chối ở cả workflow và script.

---

## 5. Xử lý sự cố

| Triệu chứng | Kiểm tra |
|---|---|
| `Permission denied (publickey)` | `VPS_SSH_KEY` thiếu dòng cuối, sai user, hoặc public key chưa nằm trong `~/.ssh/authorized_keys` của user đó |
| `Host key verification failed` | `VPS_KNOWN_HOSTS` sai host/port hoặc fingerprint chưa được cập nhật sau khi VPS đổi key |
| `pull access denied` | Chưa `docker login ghcr.io` trên VPS, PAT hết hạn, hoặc thiếu quyền package |
| `Invalid image tag` | Tag không khớp `sha-<12 hex>`; xem lại tag trong GHCR |
| `container has no healthcheck` | Image không có `HEALTHCHECK`; không deploy image đó |
| Container `unhealthy` | Xem log trong job hoặc `docker compose logs --tail=200 kaneo` |
| Deploy treo lâu | Chờ tối đa 150 giây; sau đó workflow tự fail và in logs |

---

## 6. Ghi chú vận hành

- `concurrency: kaneo-production` đảm bảo không có hai lần deploy chạy song song. Các run đang chờ có thể bị run mới hơn thay thế, nên không phải mọi commit đều được deploy tuần tự — bản mới nhất vẫn thắng.
- Build chỉ chạy trên `ubuntu-latest`, không phụ thuộc runner hay secret của upstream.
- Workflow không chạy test upstream; cổng chặn duy nhất là build thành công + health check trên VPS.
- Muốn build lại một commit cũ: chạy `Deploy` với branch `main` và để trống `image_tag` (build từ commit hiện tại của `main`), hoặc checkout commit đó rồi dispatch từ nhánh tương ứng — nhưng deploy chỉ được phép từ `main`.
