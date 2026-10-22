# REVIEWS — sprints-001-oci-a1-primary-hosting

> 状态枚举：`open | needs_fix | resolved | rejected | escalated`
> 每条 CR 的详情写在 `reviews/CR-NNN.md`，本表只做索引。

| CR | TK | rounds | status | last_action |
|----|----|--------|--------|-------------|
| CR-001 | TK-001 | 1 | recheck | 2026-10-22 23:46 CST: R2 修复已合并，等 recheck |
| CR-002 | TK-002 | 1 | recheck | 2026-10-22 23:46 CST: R2 修复已合并，等 recheck |
| CR-004 | TK-004 | 1 | recheck | 2026-10-22 23:46 CST: R2 修复已合并，等 recheck |
| CR-003 | TK-003A,TK-003B | 1 | needs_fix | 2026-10-22 23:44 CST: R1 7 条全部 accepted（F1 keepalive、F2 connect timeout、F6 buildId 是真实风险），进 R3 |
| CR-005 | TK-005 | 1 | recheck | 2026-10-22 23:46 CST: R2 修复已合并，等 recheck |
| CR-006 | TK-006 | 1 | needs_fix | 2026-10-22 23:46 CST: Coordinator 发现首次安装死锁（C1）和告警时机（C2），进 R4 |
| CR-007 | TK-007 | 0 | open | 2026-10-22 23:47 CST: created |

## 字段说明
- **rounds**：已完成 review 轮数（initial = 1，第一次 recheck = 2，以此类推）
- **status**：
  - `open` 创建后未 review
  - `needs_fix` 有 accepted finding 待修
  - `resolved` 收敛通过
  - `rejected` 全部 finding 被驳回并留痕
  - `escalated` 轮次 > 5 熔断
- **last_action**：CST 时间 + 一句摘要
