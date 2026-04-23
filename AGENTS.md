# AGENTS.md — SAFvSoil AI 入口指南

> **项目**: SAFvSoil (SAF vs Oil)  
> **角色**: AI 并行开发系统入口  
> **版本**: v1.1  
> **节点数**: 5 (本机 + mac-mini + coco + windows-pc + usa-vps)  

---

## 🚀 快速开始（任何 AI 通用）

如果你是第一次访问这个项目，按以下顺序执行：

```bash
# 1. 自发现项目路径
source scripts/safenv

# 2. 验证环境
source scripts/safenv && ls "$SAFVSOIL_ROOT"

# 3. 查看并行开发规范
cat "$SAFVSOIL_ROOT/PARALLEL_DEVELOPMENT_GUIDE.md"
```

---

## 📍 节点定位

| 节点 | 路径 | 如何到达 | 用途 |
|------|------|---------|------|
| **本机** | `~/SAFvsOil` | 本地 | 主开发 + GitHub 发布 |
| **mac-mini** | `~/safvsoil` | `ssh mac-mini` | 后端开发 + 测试 |
| **coco** | `~/safvsoil` | `ssh coco` | 文档 + 部署 + 备份 |
| **windows-pc** | `C:\Users\wyl26\safvsoil` | `ssh windows-pc` | Windows 兼容 |
| **usa-vps** | `~/safvsoil` | `ssh usa-vps` | 远程部署验证 |
| **GitHub** | `wyl2607/SAF-signal` | git push | 发布目标（零敏感信息） |

---

## 🔧 系统能力清单

### 1. 自发现系统 (`scripts/safenv`)
- 自动定位 `SAFVSOIL_ROOT` 项目根目录
- 导出子路径：`SAFVSOIL_WEB`, `SAFVSOIL_API`, `SAFVSOIL_SCRIPTS`
- 支持 Unix/macOS (`safenv`) 和 Windows (`safenv.ps1`)
- 通过 `.safvsoil-root` marker 文件或环境变量定位

### 2. 同步系统 (`scripts/sync-to-nodes.sh`, `scripts/sync-from-node.sh`)
- **推送到所有节点**: `./scripts/sync-to-nodes.sh`
- **从节点拉回**: `./scripts/sync-from-node.sh [mac-mini|coco|windows-pc|usa-vps]`
- Unix 节点用 `rsync`，Windows 节点用 `tar + scp`

### 3. 发布系统 (`scripts/publish-to-github.sh`)
- 去敏后同步到 `~/projects/SAF-signal`
- 自动排除敏感文件（.env, CLUSTER_*.md, PROJECT_PROGRESS 等）
- 验证 build 后 push 到 `wyl2607/SAF-signal`

### 4. 验证系统
- `npm run preflight` — 完整验证（check + test + build + api-check + smoke）
- `npm run web:gate` — Next.js build + typecheck + lint
- `npm run api:check` — Python 编译检查
- `npm test` — 单元测试

### 5. 备份系统 (`scripts/backup-coco.sh`)
- coco 每日凌晨自动备份 `~/safvsoil/` → `~/safvsoil-backups/`
- 保留最近 7 天备份

### 6. Codex CLI 集成
- 所有节点已配置 Codex CLI (`codex exec`)
- 支持 GPT-5.4 / GPT-5.3 Codex 模型
- 通过 `relay.nf.video` 中继

---

## 📝 开发规范

### 文件级分工
| 节点 | 负责领域 |
|------|---------|
| **本机** | 前端核心（dashboard, crisis 页面）、API 路由 |
| **mac-mini** | 后端服务（market.py, 数据管道）、测试 |
| **coco** | 文档、部署脚本、infra 配置 |
| **windows-pc** | Windows 兼容性适配、PowerShell 脚本 |
| **usa-vps** | 远程部署验证、VPS 性能测试 |

### 开发循环
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

---

## 🔒 安全规则

1. **Never commit secrets**: `.env*`, API keys, credentials
2. **Never push to GitHub**: 开发进展文档 (PROJECT_PROGRESS*.md, CLUSTER_*.md)
3. **Always verify**: `npm run preflight` 通过后再 sync/publish
4. **Windows caution**: 不要配置开机自动同步（影响性能），手动触发

---

## 🆘 故障排查

### 节点连不上
```bash
# 测试所有节点
for node in mac-mini coco windows-pc usa-vps; do
  echo "=== $node ==="
  ssh $node "echo 'OK'" 2>&1
done
```

### 同步失败
```bash
# 检查 marker 文件
ssh [node] "ls ~/safvsoil/.safvsoil-root 2>/dev/null || echo 'Missing marker'"

# 手动修复
ssh [node] "touch ~/safvsoil/.safvsoil-root"
```

### 验证失败
```bash
# 本机先修复
npm run preflight
# 修复后同步
./scripts/sync-to-nodes.sh
```

---

## 📚 关键文件速查

| 文件 | 用途 |
|------|------|
| `AGENTS.md` | 本文件 — AI 入口指南 |
| `PARALLEL_DEVELOPMENT_GUIDE.md` | 完整的并行开发规范 |
| `SAF_DEVELOPMENT_ANALYSIS_REPORT.md` | 项目分析报告 |
| `scripts/safenv` | 自发现脚本 (Unix) |
| `scripts/safenv.ps1` | 自发现脚本 (Windows) |
| `scripts/sync-to-nodes.sh` | 推送到所有节点 |
| `scripts/sync-from-node.sh` | 从节点拉回 |
| `scripts/publish-to-github.sh` | 发布到 GitHub |
| `scripts/backup-coco.sh` | coco 备份脚本 |
| `package.json` | 根目录 — 验证命令定义 |

---

**更新**: 本文件应随架构变化更新，更新位置：`$SAFVSOIL_ROOT/AGENTS.md`
