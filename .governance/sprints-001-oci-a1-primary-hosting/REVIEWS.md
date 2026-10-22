# REVIEWS — sprints-001-oci-a1-primary-hosting

> 状态枚举：`open | needs_fix | resolved | rejected | escalated`
> 每条 CR 的详情写在 `reviews/CR-NNN.md`，本表只做索引。

| CR | TK | rounds | status | last_action |
|----|----|--------|--------|-------------|
| CR-001 | TK-001 | 1 | needs_fix | 2026-10-22 23:39 CST: R1 clean 但有 4 条 minor/nit 被接受，等 R2 修复 |
| CR-002 | TK-002 | 1 | needs_fix | 2026-10-22 23:40 CST: C1 已由 R1 修复（cfe0477）；R1 评审 F1–F3 accepted，进 R2 |
| CR-004 | TK-004 | 1 | needs_fix | 2026-10-22 23:40 CST: C1/C2 已由 R1 修复（cfe0477，VALIDSIG 用真实文件验证过）；F1–F6 进 R2 |
| CR-003 | TK-003A,TK-003B | 0 | open | 2026-10-22 23:32 CST: created |
| CR-005 | TK-005 | 1 | needs_fix | 2026-10-22 23:40 CST: C1 已由 R1 修复；评审 7 条中 F1 accepted、6 条 rejected；C2 accepted，进 R2 |

## 字段说明
- **rounds**：已完成 review 轮数（initial = 1，第一次 recheck = 2，以此类推）
- **status**：
  - `open` 创建后未 review
  - `needs_fix` 有 accepted finding 待修
  - `resolved` 收敛通过
  - `rejected` 全部 finding 被驳回并留痕
  - `escalated` 轮次 > 5 熔断
- **last_action**：CST 时间 + 一句摘要
