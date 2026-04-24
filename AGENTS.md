# AGENTS.md — JetScope AI 入口指南

> **项目**: JetScope (原 SAFvSoil / SAF vs Oil)
> **角色**: AI 并行开发系统入口
> **版本**: v2.1

## 快速开始

```bash
cd ~/projects/jetscope
source scripts/safenv
```

## 路径

- 本机: `~/projects/jetscope`
- GitHub: `wyl2607/jetscope`

## 默认规则

- 修改代码前先读本文件和根目录 `~/AGENTS.md`
- 发布前运行 `npm run preflight`
- 不得提交 `.env*`、内部交付文档、日志、`.automation/`、`.omx/`
- 多节点同步脚本和发布脚本属于高风险操作，修改后必须说明影响面

## 关键命令

- `npm run preflight`
- `npm run web:gate`
- `npm run api:check`
- `./scripts/publish-to-github.sh`
- `./scripts/sync-to-nodes.sh`

## 当前架构重点

- `apps/web`: Next.js 前端
- `apps/api`: FastAPI 后端
- `packages/core`: 共享领域逻辑
- `docs/`: 产品、API、数据合同、AI 流水线与部署文档
- `scripts/`: 发布、预检、同步和部署脚本

## 仓库规则

- 不得提交 `.env*`、密钥、本地数据库、日志、构建产物、`node_modules/` 或内部交付归档
- 新增文档应面向公开仓库，避免写入私人机器路径、内部节点名或不可复现的本地流程
- 发布和部署规则以 `OPERATIONS.md` 为准
