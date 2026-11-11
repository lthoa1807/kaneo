# CI/CD Deploy lên VPS — Kế hoạch thực hiện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Push commit lên `main` → GitHub Actions build image `ghcr.io/lthoa1807/kaneo:sha-<commit>` → SSH vào VPS deploy đúng tag đó vào `/opt/kaneo`, có health check và rollback thủ công.

**Architecture:** Một workflow riêng `.github/workflows/deploy.yml` chạy trên `ubuntu-latest`, build image gộp bằng `Dockerfile.kaneo`, push GHCR, rồi chạy `scripts/deploy/vps-deploy.sh` trên VPS qua SSH. Script ghi tag vào `.deploy.env`, pull/up service `kaneo`, chờ healthy tối đa 150 giây, in logs khi lỗi.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR, Docker Compose v2, Bash, OpenSSH.

**Spec:** `docs/deployment/2026-11-12-cicd-deploy-design.md`

## Global Constraints

- Runner: `ubuntu-latest`; platform image: `linux/amd64`.
- Image: `ghcr.io/lthoa1807/kaneo`; tag `latest` + `sha-<12 ký tự đầu SHA>`.
- Deploy luôn dùng tag `sha-...`, không dùng `latest`.
- Compose: `/opt/kaneo/compose.yml`, service `kaneo`, image `${KANEO_IMAGE_TAG:-latest}`.
- Secret: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `VPS_PORT`, `VPS_PATH`. Không cần `VPS_GH_PACKAGE_TOKEN` trong workflow: VPS login GHCR một lần bằng PAT `read:packages`.
- Pin action theo SHA; `permissions` tối thiểu; `concurrency: kaneo-production`, không cancel.
- `workflow_dispatch` chỉ chấp nhận chạy trên `main`; `image_tag` chỉ hợp lệ với `^sha-[0-9a-f]{12}$`.
- Không sửa `ci.yml`, `release.yml` hay workflow upstream khác.

## Review Focus

- Sai tag (gõ tay khi rollback) → `docker pull` fail và job đỏ, không để container cũ chạy im lặng.
- Container không có health status (image cũ/khác) → coi là fail kèm logs, không báo xanh giả.
- SSH sai port/key/known_hosts → bước Deploy fail rõ ràng trước khi đụng VPS.
- GHCR private → VPS phải login trước; runbook có lệnh kiểm tra `docker pull` thủ công.
- Compose trên VPS chưa đổi sang `${KANEO_IMAGE_TAG}` → `docker compose config` phát hiện trước khi deploy.

---

### Task 0: Đồng bộ nhánh và bỏ đường publish cũ

**Files:**
- Modify: `.github/workflows/ci.yml` (xoá job `publish-images`)
- Delete: `.github/workflows/publish-main.yml`

**Interfaces:**
- Consumes: none
- Produces: nhánh `main` sạch, không còn job publish trùng lặp dùng runner Blacksmith.

- [x] **Step 1: Kiểm tra working tree và rebase lên origin/main**

```bash
git status --porcelain
# Nếu compose.yml hoặc file tracked khác bị sửa:
git stash push -m "pre-rebase local changes"
git fetch origin
git rebase origin/main
# Chỉ khi đã stash:
git stash pop
git status
```

Thực tế khi thực hiện chỉ có `docs/` untracked nên không cần stash; bước guard giữ lại để an toàn. Không reset hay bỏ thay đổi của người dùng.

Expected: rebase xong, 2 commit local (`94c5b42e`, `f18f57d5`) nằm trên `origin/main`.

- [x] **Step 2: Xoá `publish-main.yml` và job `publish-images` trong `ci.yml`**

Lý do: cả hai gọi `build-images.yml` dùng runner/action Blacksmith, không chạy được trên fork, và bị `deploy.yml` thay thế.

- [x] **Step 3: Kiểm tra cú pháp workflow**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest`
Expected: exit 0 (hoặc chỉ cảnh báo có sẵn từ upstream).

- [x] **Step 4: Commit**

```bash
git add .github/workflows
git commit -m "ci: drop superseded GHCR publish jobs"
```

---

### Task 1: Script deploy trên VPS

**Files:**
- Create: `scripts/deploy/vps-deploy.sh`

**Interfaces:**
- Consumes: env `KANEO_IMAGE_TAG` (bắt buộc), `KANEO_COMPOSE_DIR` (mặc định `/opt/kaneo`)
- Produces: exit 0 khi container `kaneo` healthy; exit 1 kèm logs khi fail.

- [x] **Step 1: Viết script**

Hành vi bắt buộc:
1. `set -Eeuo pipefail`; fail nếu thiếu `KANEO_IMAGE_TAG`.
2. Validate `KANEO_IMAGE_TAG` khớp `^sha-[0-9a-f]{12}$`; từ chối `latest` hoặc giá trị lạ.
3. `cd "$KANEO_COMPOSE_DIR"`; fail rõ nếu không tồn tại hoặc không ghi được.
4. Đọc tag cũ từ `.deploy.env` bằng `grep`/`sed` (không `source`); **chỉ** ghi `.previous_image_tag` sau khi container healthy, và chỉ khi tag cũ khác tag mới. Deploy fail thì giữ nguyên `.previous_image_tag`.
5. Ghi `KANEO_IMAGE_TAG=<tag>` vào file tạm rồi `mv` atomically sang `.deploy.env`, `chmod 600`.
6. Dựng lệnh compose dùng chung: `docker compose --env-file .env --env-file .deploy.env` nếu `.env` tồn tại, ngược lại chỉ `--env-file .deploy.env` (tránh làm mất biến interpolate khác trong `.env`). Chạy `config --quiet`, `pull kaneo`, rồi `up -d --no-deps kaneo`.
7. Lấy container id bằng cùng lệnh compose đó với `ps -q kaneo`; fail nếu rỗng.
8. Poll 30 lần × 5 giây: đọc `{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}`; `healthy` → exit 0; `starting` → tiếp tục; `unhealthy`, `no-healthcheck`, hoặc container không chạy → fail.
9. Đăng ký `trap on_error ERR` **trước** khi pull: in lệnh fail, `docker compose logs --tail=200 kaneo`, `docker compose ps`, `docker inspect` nếu có container id, rồi exit 1. Nhờ vậy lỗi ở pull/up vẫn xuất logs.
10. Nếu fail sau khi đã ghi `.deploy.env`: `.deploy.env` giữ tag vừa thử (phản ánh đúng trạng thái đã áp dụng), `.previous_image_tag` không đổi, và log in “Rollback target” là tag cũ để người vận hành chạy lại workflow với tag đó. Không tự rollback trong script.

- [x] **Step 2: Kiểm tra cú pháp**

Run: `bash -n scripts/deploy/vps-deploy.sh && docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable /mnt/scripts/deploy/vps-deploy.sh`
Expected: không lỗi.

- [x] **Step 3: Commit**

```bash
git add scripts/deploy/vps-deploy.sh
git commit -m "ci: add VPS deploy script with health check"
```

---

### Task 2: Workflow deploy

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: script Task 1; secret ở Global Constraints.
- Produces: trên push `main`, job `build` xuất `image_tag`; job `deploy` chạy script với `KANEO_IMAGE_TAG`.

- [x] **Step 1: Viết workflow**

Cấu trúc:
- `on: push: branches: [main]` + `workflow_dispatch.inputs.image_tag` (không bắt buộc).
- `concurrency: {group: kaneo-production, cancel-in-progress: false}`.
- `permissions: contents: read`.
- Job `build` (chỉ chạy khi không có `inputs.image_tag`): checkout (`persist-credentials: false`) → setup-buildx → login GHCR bằng `GITHUB_TOKEN` → step `id: meta` chạy `echo "image_tag=sha-${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"` → build-push `Dockerfile.kaneo`, tags `latest` + `${{ steps.meta.outputs.image_tag }}`, `platforms: linux/amd64`. Quyền job: `packages: write`, `contents: read`. Job output `image_tag: ${{ steps.meta.outputs.image_tag }}`.
- Job `deploy` (`needs: build`, `if: always() && github.ref == 'refs/heads/main' && (inputs.image_tag != '' || needs.build.result == 'success')`): checkout → validate tag bằng bash (`[[ "$TAG" =~ ^sha-[0-9a-f]{12}$ ]]`, fail nếu sai) → ghi `~/.ssh/deploy_key` từ secret (`chmod 600`) → ghi `VPS_KNOWN_HOSTS` vào `~/.ssh/known_hosts` → pipe script qua `ssh -o StrictHostKeyChecking=yes -p "$VPS_PORT"` với env `KANEO_IMAGE_TAG`, `KANEO_COMPOSE_DIR`.
- Không dùng `ssh-keyscan`; host key lấy từ secret đã xác minh fingerprint.
- Action pin: `actions/checkout@11d5960a326750d5838078e36cf38b85af677262`, `docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f`, `docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9`, `docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8`.
- Không echo secret; `set -x` không được bật quanh bước SSH.

- [x] **Step 2: Kiểm tra cú pháp**

Run: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest .github/workflows/deploy.yml`
Expected: exit 0.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: build and deploy images to VPS on main"
```

---

### Task 3: Runbook vận hành

**Files:**
- Create: `deploy/README.md`

**Interfaces:**
- Consumes: none
- Produces: hướng dẫn một lần cho VPS + rollback.

- [x] **Step 1: Viết runbook gồm**

1. Sửa `compose.yml`: `image: ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:-latest}`.
2. Trên VPS: `echo "$PAT" | docker login ghcr.io -u lthoa1807 --password-stdin`, kiểm tra `docker pull ghcr.io/lthoa1807/kaneo:latest`. Giữ login để compose pull được về sau.
3. Kiểm tra `docker compose config` hiển thị đúng image.
4. Danh sách secret GitHub cần tạo: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `VPS_PORT`, `VPS_PATH`.
5. Hướng dẫn lấy fingerprint host key trên console VPS (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) và đối chiếu với `ssh-keyscan -p "$VPS_PORT" "$VPS_HOST"` trước khi lưu secret.
6. Khuyến nghị user deploy riêng (không root), chỉ có quyền vào `/opt/kaneo` và docker; ghi rõ thành viên nhóm `docker` gần tương đương root.
7. Rollback: GitHub → Actions → Deploy → Run workflow (branch `main`) → nhập tag cũ dạng `sha-<12 hex>` (xem `.previous_image_tag` trên VPS hoặc tag trong GHCR).

- [x] **Step 2: Commit**

```bash
git add deploy/README.md
git commit -m "docs: add VPS deploy runbook"
```

---

### Task 4: Cấu hình một lần trên VPS và GitHub

**Files:** không sửa repo.

**Interfaces:**
- Consumes: runbook Task 3.
- Produces: secret đã tạo, VPS pull được image, compose đã đổi.

- [ ] **Step 1: Tạo SSH key deploy (trên máy local)**

```bash
ssh-keygen -t ed25519 -C "kaneo-deploy" -f ~/.ssh/kaneo_deploy -N ""
cat ~/.ssh/kaneo_deploy.pub
```

- [ ] **Step 2: Thêm public key lên VPS**

```bash
ssh-copy-id -i ~/.ssh/kaneo_deploy.pub <VPS_USER>@<VPS_HOST>
ssh -i ~/.ssh/kaneo_deploy <VPS_USER>@<VPS_HOST> 'docker compose version'
```

Expected: in ra Docker Compose v2.x.

- [ ] **Step 3: Tạo secret GitHub**

```bash
printf '%s' "<VPS_HOST>" | gh secret set VPS_HOST -R lthoa1807/kaneo
printf '%s' "<VPS_USER>" | gh secret set VPS_USER -R lthoa1807/kaneo
printf '%s' "22" | gh secret set VPS_PORT -R lthoa1807/kaneo
printf '%s' "/opt/kaneo" | gh secret set VPS_PATH -R lthoa1807/kaneo
gh secret set VPS_SSH_KEY -R lthoa1807/kaneo < ~/.ssh/kaneo_deploy
ssh-keyscan -p "22" "<VPS_HOST>" > /tmp/vps_known_hosts
ssh-keygen -lf /tmp/vps_known_hosts
gh secret set VPS_KNOWN_HOSTS -R lthoa1807/kaneo < /tmp/vps_known_hosts
rm -f /tmp/vps_known_hosts
```

Đối chiếu fingerprint vừa in với fingerprint lấy trực tiếp trên console VPS trước khi chạy lệnh `VPS_KNOWN_HOSTS`.

- [ ] **Step 4: Login GHCR trên VPS**

```bash
echo "<PAT read:packages>" | docker login ghcr.io -u lthoa1807 --password-stdin
docker pull ghcr.io/lthoa1807/kaneo:latest
```

- [ ] **Step 5: Sửa compose trên VPS và kiểm tra**

```bash
cd /opt/kaneo
cp compose.yml compose.yml.bak
sed -i 's#image: .*#image: ghcr.io/lthoa1807/kaneo:${KANEO_IMAGE_TAG:-latest}#' compose.yml
docker compose config | grep image:
```

Expected: `image: ghcr.io/lthoa1807/kaneo:latest`.

---

### Task 5: Chạy thử end-to-end

**Files:** không sửa.

**Interfaces:**
- Consumes: Task 2 + Task 4.
- Produces: workflow xanh, container healthy, bằng chứng cụ thể.

- [ ] **Step 1: Push nhánh main lên fork**

```bash
git push origin main
```

- [ ] **Step 2: Theo dõi workflow**

```bash
gh run list -R lthoa1807/kaneo --workflow deploy.yml --limit 1
gh run watch -R lthoa1807/kaneo <run-id> --exit-status
```

Expected: job `build` và `deploy` success.

- [ ] **Step 3: Xác minh trên VPS**

```bash
ssh -i ~/.ssh/kaneo_deploy <VPS_USER>@<VPS_HOST> \
  'cd /opt/kaneo && cat .deploy.env && docker compose ps kaneo && docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}" $(docker compose ps -q kaneo)'
```

Expected: tag `sha-...`, trạng thái `healthy`, container dùng đúng image.

- [ ] **Step 4: Diễn tập rollback**

Chạy `Deploy` với `image_tag` = tag trước trong `.previous_image_tag`; xác minh container healthy và `.deploy.env` quay lại tag cũ.

- [ ] **Step 5: Báo cáo**

Ghi lại: run URL, tag đã deploy, kết quả health, thời gian build.
