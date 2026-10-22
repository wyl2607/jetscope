# CURSOR — sprints-001-oci-a1-primary-hosting

## 当前状态
<!-- Machine fields: new writes must use "- key: `value`". Legacy variants are read-only compatibility. -->
- current_phase: `scheduler`
- current_tk: `—`
- current_cr: `—`
- current_round: `—`
- escalated: `false`

## 进度快照
<!-- 同 PLAN.md checklist，简要镜像 -->

| TK | 标题 | 状态 |
|----|------|------|
| TK-001 | compose 端口变量化 + 部署脚本参数化 + oci 封装 | planned |
| TK-002 | oci-a1 systemd 单元模板 + 告警脚本 | planned |
| TK-003 | usa nginx 模板 + nginx-smoke | planned |
| TK-004 | bootstrap.sh | planned |
| TK-005 | seed.sh | planned |
| TK-006 | install-units.sh + oci-backup | planned |
| TK-007 | cutover.sh | planned |
| TK-008 | 文档与执行清单 | planned |

## 最近动作
<!-- 时间倒序，每行：`- YYYY-MM-DD HH:MM CST: <一句话动作>` -->
- 2026-10-22 20:59 CST: Sprint 001 initialized, awaiting TK-001

## 下一步
- `/sprint-tick` 进入 Scheduler：TK-001..TK-005 无写入冲突，可作为 ready 批次并行派发
