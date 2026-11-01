F1 [severity=major, category=correctness] scripts/oci-a1/seed.sh:294 — USA_DUMP 在 usa-vps 的 /tmp 下创建，全局可写目录存在 TOCTOU：sqlite3 .backup 写入与 chmod 600 之间有窗口期，建议用 mktemp 并指定 --tmpdir=/opt/jetscope/data 等私有目录。
F2 [severity=major, category=correctness] scripts/oci-a1/seed.sh:306-310 — 快照传输期间 usa-vps 的 market.db 可能并发写入，导致 .backup 与后续 row count 不一致（竞态），建议在 usa 停写或加文件锁，或改为只读事务快照。
F3 [severity=major, category=correctness] scripts/oci-a1/seed.sh:335-340 — row count 对比在两端分别执行且无全局锁，usa 端计数时可能已有新写入，建议在 usa 同一事务内完成 backup+count，或接受最终一致性并在文档说明。
F4 [severity=major, category=security] scripts/oci-a1/seed.sh:229-248 — token 生成后写入 OCI 临时文件再 cat 管道传给 USA，若中途 SSH 断开 TOKEN_FILE 残留在 OCI 磁盘，cleanup 依赖 ssh_run 可能失败，建议 trap 增加本地 rm 兜底或用 heredoc 直接 stdin 传递避免落盘。
F5 [severity=minor, category=maintainability] scripts/oci-a1/seed.sh:213-217 — awk 替换 JETSCOPE_API_BIND 若文件含多行匹配会全部替换，建议改为精确单行替换或先校验仅有一行。
F6 [severity=minor, category=maintainability] scripts/oci-a1/seed.sh:114 — ssh_run 缺少 set -o pipefail，管道前段失败时后段仍执行可能掩盖错误，建议在函数内开启 pipefail。
F7 [severity=minor, category=security] scripts/oci-a1/seed.sh:374-375 — mv 后 chmod/chown 依赖 ubuntu 用户存在，若用户缺失会静默失败，建议先 id -u ubuntu 校验或捕获错误。
verdict: needs_fix