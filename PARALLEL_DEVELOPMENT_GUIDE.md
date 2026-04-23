# SAF 并行开发规范

> **版本**: v1.1  
> **日期**: 2026-04-23  
> **适用仓库**: 本地 `SAFvsOil/` + GitHub `wyl2607/SAF-signal`  
> **节点数**: 5 (本机 + mac-mini + coco + windows-pc + usa-vps)

---

## 1. 节点架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SAF 并行开发架构 (5 节点)                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │   本机       │    │  mac-mini   │    │    coco     │            │
│  │ 主开发节点    │◄──►│ 并行开发    │◄──►│ 并行开发    │            │
│  │ ~/SAFvsOil/ │    │ ~/safvsoil/ │    │ ~/safvsoil/ │            │
│  │ 完整版      │    │ 完整版      │    │ 完整版      │            │
│  │ 含敏感信息   │    │ 含敏感信息   │    │ 含敏感信息   │            │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘            │
│         │                  │                  │                    │
│  ┌──────┴──────────────────┴──────────────────┴──────┐            │
│  │              同步层 (rsync/ssh/tar+scp)           │            │
│  └──────┬──────────────────┬──────────────────┬──────┘            │
│         │                  │                  │                    │
│  ┌──────┴──────┐    ┌──────┴──────┐            │                    │
│  │  windows-pc │    │   usa-vps   │            │                    │
│  │ 并行开发     │    │ 远程开发    │            │                    │
│  │ C:\Users\   │    │ ~/safvsoil/ │            │                    │
│  │ wyl26\saf   │    │ 完整版      │            │                    │
│  │ vsoil\      │    │ 含敏感信息   │            │                    │
│  └─────────────┘    └─────────────┘            │                    │
│                                                │                    │
│                          ▼                     │                    │
│              ┌─────────────────────┐          │                    │
│              │  本地验证层          │          │                    │
│              │  npm run preflight  │          │                    │
│              └──────────┬──────────┘          │                    │
│                         │                     │                    │
│                         ▼                     │                    │
│              ┌─────────────────────┐          │                    │
│              │  去敏 + cherry-pick  │          │                    │
│              │  → projects/SAF-signal│         │                    │
│              └──────────┬──────────┘          │                    │
│                         │                     │                    │
│                         ▼                     │                    │
│              ┌─────────────────────┐          │                    │
│              │  GitHub (发布目标)   │          │                    │
│              │  wyl2607/SAF-signal │          │                    │
│              │  零敏感信息          │          │                    │
│              └─────────────────────┘          │                    │
│                                               │                    │
└─────────────────────────────────────────────────────────────────────┘
```

| 节点 | 角色 | 存放路径 | 连接方式 | 同步协议 | 包含敏感信息 |
|------|------|---------|---------|---------|-------------|
| **本机** | 主开发 + GitHub 桥梁 | `~/SAFvsOil/` | 本地 | - | ✅ 是 |
| **mac-mini** | 并行开发/测试 | `~/safvsoil/` | Tailscale | rsync | ✅ 是 |
| **coco** | 并行开发 + 离线备份 | `~/safvsoil/` | Tailscale | rsync | ✅ 是 |
| **windows-pc** | 并行开发 (Windows) | `C:\Users\wyl26\safvsoil\` | Tailscale | tar+scp | ✅ 是 |
| **usa-vps** | 远程开发节点 | `~/safvsoil/` | 公网 IP | rsync | ✅ 是 |
| **GitHub** | 发布目标 | `wyl2607/SAF-signal` | HTTPS | git push | ❌ 否 |

---

## 2. 网络拓扑

```
                    Tailscale 内网 (100.x.x.x)
         ┌─────────────────────────────────────────┐
         │                                         │
    ┌────┴────┐    ┌────────┐    ┌─────────┐    ┌──────────┐
    │ 本机    │◄──►│mac-mini│◄──►│  coco   │◄──►│windows-pc│
    │(开发机) │    │(ARM64) │    │(x86_64) │    │(Windows) │
    └────┬────┘    └────────┘    └─────────┘    └──────────┘
         │
         │ 公网 SSH
         ▼
    ┌──────────┐
    │ usa-vps  │
    │192.227.130│
    └──────────┘
         │
         │ git push
         ▼
    ┌──────────┐
    │  GitHub  │
    │SAF-signal│
    └──────────┘
```

**SSH 配置** (已写入 `~/.ssh/config`):

```
Host mac-mini
  HostName 100.105.163.59
  User yilinwang

Host coco
  HostName 100.92.147.76
  User yilinwang

Host windows-pc
  HostName 100.123.63.104
  User wyl26

Host usa-vps
  HostName 192.227.130.69
  User root
  IdentityFile ~/.ssh/us-vps-key
```

---

## 3. 工作流

### 3.1 日常开发循环

```
1. 在本机开发 → 修改代码
2. 运行验证 → npm run preflight
3. 同步到所有节点 → ./scripts/sync-to-nodes.sh
4. 各节点独立验证/开发
5. 如有修改，同步回本机 → ./scripts/sync-from-node.sh [节点名]
6. 本机统一合并 → 解决冲突
7. 去敏发布 → ./scripts/publish-to-github.sh
8. GitHub 接收干净代码
```

### 3.2 分支策略

| 分支 | 用途 | 节点 |
|------|------|------|
| `main` | 生产就绪代码 | GitHub only |
| `feature/*` | 功能开发 | 所有节点 |
| `hotfix/*` | 紧急修复 | 本机优先 |

**规则**:
- 每个功能从 `main` 切出新分支：`git checkout -b feature/xxx`
- 不要在 `main` 上直接开发
- 合并前必须通过 `npm run preflight`

### 3.3 冲突避免

1. **文件级分工**（推荐）:
   - 本机：前端核心（dashboard, crisis 页面）、API 路由
   - mac-mini：后端服务（market.py, 数据管道）、测试
   - coco：文档、部署脚本、infra 配置
   - windows-pc：Windows 兼容性适配、PowerShell 脚本
   - usa-vps：远程部署验证、VPS 性能测试

2. **时间级分工**:
   - 早班（本机）：新功能开发
   - 中班（mac-mini）：代码 review + 测试补强
   - 晚班（coco + usa-vps）：文档更新 + 部署验证

3. **同步频率**:
   - 每完成一个功能单元 → 立即 sync
   - 每天至少 sync 一次（防止长时间分歧）

---

## 4. 脚本使用

### 4.1 同步到所有节点

```bash
cd ~/SAFvsOil
./scripts/sync-to-nodes.sh
```

**支持节点**: mac-mini | coco | windows-pc | usa-vps

**同步协议**:
- Unix 节点 (mac-mini, coco, usa-vps): `rsync`
- Windows 节点 (windows-pc): `tar + scp`

### 4.2 从节点同步回本机

```bash
# 从 mac-mini 拉回修改
./scripts/sync-from-node.sh mac-mini

# 从 coco 拉回修改
./scripts/sync-from-node.sh coco

# 从 windows-pc 拉回修改
./scripts/sync-from-node.sh windows-pc

# 从 usa-vps 拉回修改
./scripts/sync-from-node.sh usa-vps
```

### 4.3 发布到 GitHub（去敏）

```bash
# 验证通过后执行
./scripts/publish-to-github.sh
```

**注意**: 此脚本会自动：
- 复制生产代码到 `~/projects/SAF-signal`
- 排除所有敏感文件
- 运行 `npm run web:gate` 验证
- 提交并 push 到 GitHub

---

## 5. 去敏规则（GitHub 发布）

以下文件/目录**不会**推送到 GitHub `SAF-signal`：

| 类别 | 排除内容 | 原因 |
|------|---------|------|
| **Secrets** | `.env*`, `.env.webhook`, API keys | 安全 |
| **集群配置** | `scripts/auto-sync-cluster.sh`, CLUSTER_*.md | 含 IP 地址 |
| **进度日志** | PROJECT_PROGRESS*.md, PROJECT_AUDIT*.md | 开发进展 |
| **交付文档** | *DELIVERY*.md, *DEPLOYMENT*.md, *COMPLETION*.md | 内部信息 |
| **Lane 文档** | LANE*.md, WEBHOOK*.md, FAQ*.md | 内部流程 |
| **执行脚本** | deploy-*.sh, start-webhook*.sh, auto-sync*.sh | 含部署细节 |
| **构建产物** | dist/, .next/, tsconfig.tsbuildinfo | 自动生成的 |
| **测试产物** | test-results/, *.log | 临时文件 |
| **大文件** | *.tar.gz, notion-handoff-* | 体积过大 |
| **旧原型** | public/ (旧静态 HTML) | 已废弃 |
| **分析报告** | SAF_DEVELOPMENT_ANALYSIS_REPORT.md | 开发进展 |

---

## 6. 验证门禁

**任何代码在同步或发布前必须通过**:

```bash
# 本机验证（完整）
npm run preflight

# 快速验证（开发中）
npm run web:gate        # Next.js build + typecheck + lint
npm run api:check       # Python 编译检查
npm test                # 单元测试
```

**各节点验证**:
```bash
# mac-mini / coco / usa-vps
cd ~/safvsoil
npm run web:gate
npm run api:check
npm test

# windows-pc
cd C:\Users\wyl26\safvsoil
npm run web:gate
npm run api:check
npm test
```

---

## 7. 备份策略

### 7.1 coco 备份（每日自动）

coco 承担双重角色：

1. **开发节点**：参与日常开发
2. **离线备份**：每日凌晨自动执行完整备份

```bash
# coco 上的备份脚本（已配置 cron）
~/safvsoil/scripts/backup-coco.sh
```

备份内容：
- `~/safvsoil/` 完整代码（含敏感信息）
- `~/safvsoil-backups/safvsoil-$(date +%Y%m%d).tar.gz`
- 保留最近 7 天备份

### 7.2 usa-vps 备份（可选）

usa-vps 可作为异地备份：

```bash
# 从 usa-vps 备份回本机
rsync -avz usa-vps:~/safvsoil-backups/ ~/safvsoil-backups-usa/
```

---

## 8. Windows PC 特殊说明

### 8.1 环境差异

| 特性 | Windows PC | Unix 节点 |
|------|-----------|----------|
| Shell | PowerShell | bash/zsh |
| 路径分隔符 | `\` | `/` |
| 换行符 | CRLF | LF |
| Python venv | `.venv\Scripts\activate` | `source .venv/bin/activate` |
| 无 rsync | 使用 tar+scp | 使用 rsync |

### 8.2 Windows 专用命令

```powershell
# 启动前端
cd C:\Users\wyl26\safvsoil\apps\web
npm run dev

# 启动后端
cd C:\Users\wyl26\safvsoil\apps\api
.venv\Scripts\activate
uvicorn app.main:app --reload

# 验证
cd C:\Users\wyl26\safvsoil
npm run web:gate
npm run api:check
npm test
```

### 8.3 同步注意事项

- Windows 同步使用 `tar + scp`，比 rsync 慢
- 建议在非高峰时段（如午休）执行全量同步
- 对于小修改，可以手动 `scp` 单个文件

---

## 9. 紧急流程

### 9.1 某个节点损坏

1. 从其他健康节点 rsync 恢复
2. 或从 GitHub clone + 从本机补充敏感配置

### 9.2 代码冲突

1. 在本机执行合并
2. 使用 `npm run preflight` 验证合并结果
3. 解决后同步到所有节点

### 9.3 GitHub 发布失败

1. 检查 `~/projects/SAF-signal` 的 build 状态
2. 修复后重新运行 `./scripts/publish-to-github.sh`
3. 如 SSH key 问题，使用 `gh auth login` 重新认证

---

## 10. 节点快速参考

| 操作 | 本机 | mac-mini | coco | windows-pc | usa-vps |
|------|------|---------|------|-----------|---------|
| 启动前端 | `cd apps/web && npm run dev` | 相同 | 相同 | `cd apps\web && npm run dev` | 相同 |
| 启动后端 | `cd apps/api && uvicorn...` | 相同 | 相同 | `.venv\Scripts\activate && uvicorn...` | 相同 |
| 验证 | `npm run preflight` | 相同 | 相同 | `npm run preflight` | 相同 |
| 同步出去 | `./scripts/sync-to-nodes.sh` | 手动 rsync | 手动 rsync | 手动 tar+scp | 手动 rsync |
| 同步回来 | `./scripts/sync-from-node.sh [node]` | `./scripts/sync-from-node.sh local` | `./scripts/sync-from-node.sh local` | `./scripts/sync-from-node.sh local` | `./scripts/sync-from-node.sh local` |
| 发布 GitHub | `./scripts/publish-to-github.sh` | ❌ 不可 | ❌ 不可 | ❌ 不可 | ❌ 不可 |
| 备份 | ❌ 不负责 | ❌ 不负责 | `~/safvsoil/scripts/backup-coco.sh` | ❌ 不负责 | ❌ 不负责 |

---

**维护**: 本规范应随架构变化更新，更新位置：`~/SAFvsOil/PARALLEL_DEVELOPMENT_GUIDE.md`
