# REVIEWS — sprints-001-oci-a1-primary-hosting

> 状态枚举：`open | needs_fix | resolved | rejected | escalated`
> 每条 CR 的详情写在 `reviews/CR-NNN.md`，本表只做索引。

| CR | TK | rounds | status | last_action |
|----|----|--------|--------|-------------|
| CR-001 | TK-001 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-002 | TK-002 | 2 | needs_fix | 2026-10-22 23:52 CST: recheck 发现 N1 回归（readiness 是单词不是状态码），进 R6 |
| CR-004 | TK-004 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-003 | TK-003A,TK-003B | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-005 | TK-005 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-006 | TK-006 | 2 | resolved | 2026-10-22 23:52 CST: recheck 全部 fixed，关闭 |
| CR-007 | TK-007 | 1 | needs_fix | 2026-10-22 23:51 CST: R1 2 major（恢复命令方向反了、没处理 -journal）+ 6 minor/nit 全部 accepted，进 R5 |

## 字段说明
- **rounds**：已完成 review 轮数（initial = 1，第一次 recheck = 2，以此类推）
- **status**：
  - `open` 创建后未 review
  - `needs_fix` 有 accepted finding 待修
  - `resolved` 收敛通过
  - `rejected` 全部 finding 被驳回并留痕
  - `escalated` 轮次 > 5 熔断
- **last_action**：CST 时间 + 一句摘要
