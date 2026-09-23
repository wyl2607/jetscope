# JetScope 重构版上线手册 (2026-09)

本文档是针对 2026-09 重构版本的部署指南。在执行前，请确保您有目标 VPS 的 SSH 访问权限，并在 `jr-W3b` 仓库的根目录下执行操作。

## 1. 前置检查清单

在开始部署之前，请确认以下事项：

- [ ] **代码就绪**：本地 `main` 分支已合并 `#374`，且工作区干净。
- [ ] **确认磁盘空间**：检查 VPS 上的磁盘和内存空间，确保有足够资源（VPS 配置为 1.9 GiB 内存）。
  ```bash
  ssh <usa-vps-hostname> "df -h && free -m" # 只读
  ```
- [ ] **创建 Admin htpasswd (首次配置)**：需要在 VPS 的 nginx 侧配置 Basic Auth 以保护 `/admin` 页面。
  ```bash
  ssh <usa-vps-hostname> # 会改变线上状态（登录操作）
  sudo mkdir -p /etc/nginx/secrets # 会改变线上状态
  sudo chmod 750 /etc/nginx/secrets # 会改变线上状态
  # 创建用户密码（请替换 <username>，运行后按提示输入密码）
  sudo htpasswd -c /etc/nginx/secrets/jetscope-admin.htpasswd <username> # 会改变线上状态
  sudo chmod 640 /etc/nginx/secrets/jetscope-admin.htpasswd # 会改变线上状态
  sudo chown root:www-data /etc/nginx/secrets/jetscope-admin.htpasswd # 会改变线上状态
  sudo nginx -t && sudo systemctl reload nginx # 会改变线上状态
  ```
- [ ] **手动备份现有 SQLite 数据库**：为了安全起见，手动将现有 API 容器中的数据库备份出来。默认容器名为 `jetscope-api`。
  ```bash
  ssh <usa-vps-hostname> # 会改变线上状态（登录操作）
  # 将当前数据库文件拷贝到宿主机的安全目录进行备份
  docker cp jetscope-api:/app/data/market.db ~/market.db.bak # 只读（对容器而言），但在宿主机写入文件
  docker cp jetscope-api:/app/data/market.db-wal ~/market.db-wal.bak || true # 只读
  docker cp jetscope-api:/app/data/market.db-shm ~/market.db-shm.bak || true # 只读
  ```

## 2. 演练部署 (Dry Run)

正式部署前，建议先运行 `--dry-run` 查看部署脚本会做什么操作：

```bash
bash scripts/deploy-usa-vps.sh --rebuild --dry-run # 只读
```

**预期的 dry-run 输出及其含义解释**：
- `would: rsync ...`：将本地仓库文件同步到目标主机的 `/opt/jetscope`（排除数据库、环境文件等）。
- `would: docker compose ... build api`：在后台构建新的 API 镜像（此时旧容器继续提供服务）。
- `would: if ... market.db is non-empty: skip docker cp`：检查宿主机数据卷（默认为 `/opt/jetscope/data`），如果已有数据则跳过拷贝；这是保证不覆盖既有数据的安全机制。
- `would: else if .../app/data/market.db is missing ...`：如果宿主机和旧容器都没有数据，脚本会抛错退出。
- `would: else: PRAGMA wal_checkpoint(FULL); docker stop ... docker cp ...`：（**核心迁移步骤**）若宿主卷为空而旧容器有数据，将触发拷贝：执行 sqlite wal checkpoint 写入磁盘，停止旧容器，将容器内的 `.db`, `-wal`, `-shm` 复制到宿主机挂载目录，以实现容器到宿主机的持久化数据迁移。
- `would: ... docker compose ... up -d api`：使用新镜像和宿主挂载卷拉起新的 API 容器。
- `would: npm run web:build && systemctl restart jetscope-web.service`：构建并重启基于 systemd 的前端 Web 服务。

## 3. 正式执行步骤

确认 Dry-run 输出无误后，执行真实部署。此操作会执行首次数据卷迁移，并重启服务。

```bash
bash scripts/deploy-usa-vps.sh --rebuild # 会改变线上状态
```

**关于脚本行为的重要说明**：
- **首次迁移（旧容器 DB → 宿主卷）**：此次重构将 SQLite 从 API 容器的内部文件系统移出至宿主机卷挂载 (`/opt/jetscope/data`)。脚本会自动安全停止旧容器，拷贝数据文件至宿主机后再拉起新容器，实现平滑过渡。
- **Fail-closed 安全机制与 `--allow-empty-db`**：脚本采用 `fail-closed` 原则。如果检测到待迁移的源容器中没有有效数据库文件，或者丢失了数据库文件，它会立刻报错退出并拒绝启动新容器，防止上线一个空库。仅在**确实是全新环境、有意初始化一个空数据库**的情况下才使用 `--allow-empty-db`，**在生产环境更新中，一般不要使用该参数**。

## 4. 上线后验证

部署完成后，请执行以下命令检查线上服务状态（可用公共域名 `saf.meichen.beauty` 验证）：

### 4.1 命令行自动验证

```bash
# 检查健康状态，应返回状态 200 及 ok 信息
curl -fsS https://saf.meichen.beauty/v1/health # 只读
curl -fsS https://saf.meichen.beauty/v1/readiness # 只读

# 检查行情快照
curl -fsS https://saf.meichen.beauty/v1/market/snapshot # 只读
# 期望：`values` 对象中不能包含初始种子值（0.64 或 80.38），缺失的指标应明确显示为 `null` (missing 为 null)。

# 检查事件列表
curl -fsS https://saf.meichen.beauty/v1/events # 只读
# 期望：返回的 JSON 中 `count` 必须 ≥ 1（包含预置的 Lufthansa q2 事件）。

# 检查 Admin 鉴权拦截
curl -I https://saf.meichen.beauty/admin # 只读
# 期望：返回 HTTP 401 Unauthorized。
```

### 4.2 人工网页检查项

通过浏览器访问 `https://saf.meichen.beauty` 进行以下验收：
- **首页 (Home)**：检查页面渲染是否正常，确保能够看到页面底部或数据处的 `as-of` 时间戳（证明 SSR 服务端成功调用了本地 API）。
- **驾驶舱 (Cockpit) / 行情**：检查数据是否加载成功，无异常的默认种子假数据。
- **工作台 (Workbench) / Admin**：访问 `/admin` 或相关路由，确认是否弹出了浏览器基础认证窗口并有效阻挡了未授权访问。

## 5. 回滚 (Rollback)

如上线发现严重问题，可按照以下步骤切回旧版镜像并恢复备份数据：

```bash
ssh <usa-vps-hostname> # 会改变线上状态（登录操作）

# 1. 恢复旧容器的数据库（如果宿主机挂载的数据被意外污染）
# 停止当前运行的 API
docker stop jetscope-api # 会改变线上状态

# 将之前备份的旧数据库文件覆盖回去 (假设备份在 ~ 目录，宿主卷在 /opt/jetscope/data)
sudo cp ~/market.db.bak /opt/jetscope/data/market.db # 会改变线上状态
sudo cp ~/market.db-wal.bak /opt/jetscope/data/market.db-wal || true # 会改变线上状态
sudo cp ~/market.db-shm.bak /opt/jetscope/data/market.db-shm || true # 会改变线上状态
sudo chown -R root:root /opt/jetscope/data # 会改变线上状态

# 2. 重新拉起旧镜像 API 和切回旧版 Web
cd /opt/jetscope # 只读
# 若通过 Git 部署回退，可 checkout 对应的稳定 commit 或通过 rsync 将旧版代码覆盖回来
# 然后使用旧镜像重新启动（此处假设旧代码已经恢复）：
docker compose -f docker-compose.prod.yml up -d --build api # 会改变线上状态
systemctl restart jetscope-web.service # 会改变线上状态
```

## 6. 已知限制

上线后请留意当前架构的以下已知限制：

1. **页面全部为动态渲染 (`force-dynamic`)**：所有的 Next.js 页面都在服务端按需执行 API 数据请求，无法利用静态生成的缓存。因此，API 响应的速度直接决定了页面的加载速度，若 API 进程无法访问，所有页面都可能降级呈现 `fallback` 假数据或请求超时。
2. **EEX xlsx 数据源格式依赖**：数据抓取依赖特定的 EEX xlsx 源文件格式。若源站点进行改版导致解析失败，读取模型会将这些字段置空，导致前端显示为 `missing` (null)。
