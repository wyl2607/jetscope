# REVIEWS — sprints-001-oci-a1-primary-hosting

> 状态枚举：`open | needs_fix | resolved | rejected | escalated`
> 每条 CR 的详情写在 `reviews/CR-NNN.md`，本表只做索引。

| CR | TK | rounds | status | last_action |
|----|----|--------|--------|-------------|
| CR-001 | TK-001 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-002 | TK-002 | 3 | resolved | 2026-10-23 01:55 CST: R6（16b5b29）修 N1，recheck fixed，关闭 |
| CR-004 | TK-004 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-003 | TK-003A,TK-003B | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-005 | TK-005 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-006 | TK-006 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-007 | TK-007 | 2 | resolved | 2026-10-23 01:55 CST: R5（af27a21）F1–F8/C1 recheck 全部 fixed；新 N-1/N-2 由 Coordinator 修（9ffbdf7），N-3..N-5 nit 不修（N-5 上线前实测） |

## 字段说明
- **rounds**：已完成 review 轮数（initial = 1，第一次 recheck = 2，以此类推）
- **status**：
  - `open` 创建后未 review
  - `needs_fix` 有 accepted finding 待修
  - `resolved` 收敛通过
  - `rejected` 全部 finding 被驳回并留痕
  - `escalated` 轮次 > 5 熔断
- **last_action**：CST 时间 + 一句摘要
