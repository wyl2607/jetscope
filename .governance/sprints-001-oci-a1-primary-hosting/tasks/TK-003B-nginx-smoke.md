# TK-003B — nginx-smoke.sh 容器化回归测试

> 拆自 TK-003（第 5 条）。依赖 TK-003A。

## 状态历史
- 2026-10-22 23:32 CST: lane-chain 由 deepseek-v4.1-flash 一次过了质量门。Coordinator 在 oci-a1 /tmp 下实跑（nginx:1.24）：断言 a–g 全部 PASS，rc=0。路径和 query 保留、读请求 failover 到 usa、写请求和 /admin 在 oci 宕机时返回 502、维护片段返回 503 并带 Retry-After=120、各阶段 nginx -t 都通过。跑完容器和网络都已清理。状态改为 reviewing（和 TK-003A 合并为 CR-003）。
