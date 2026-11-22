# TK-003A — nginx 模板：upstream / 读写 map / served-by / 站点 / 维护片段

> 拆自 TK-003（见 TK-003 卡片）。范围、Done criteria 沿用 TK-003 的第 1–4 条；smoke 测试见 TK-003B。

## 状态历史
- 2026-10-22 22:51 CST: executing（lane-chain：deepseek-v4.1-flash 第一次就过了质量门）。第一次派发失败是 Coordinator 的 brief 生成脚本出错（`re.sub` 把替换文本里的 `\s` 当成转义），lane 没拿到 brief 就空跑了，已停掉并重派。
- 2026-10-22 22:51 CST: Coordinator 预检：所有 proxy_pass 都不带 URI；/admin 走 jetscope_web_rw；served-by 按 $upstream_addr 的最后一个地址判断。在 oci-a1 /tmp 下用 nginx:1.24 容器（usa 同版本），加上 usa 实际的 http 层定义（log_format、saf_req/saf_conn zone），对挂维护片段和不挂维护片段两种状态跑 `nginx -t`，都通过。状态改为 reviewing（和 TK-003B 合并为同一个 CR-003）。
