# Background Restriction Commands

日期：2026-04-04

目标：

- 将高噪声、低必要性的第三方 App 限制为不在后台长期运行
- 优先使用可逆且风险较低的手段：
  - `RUN_IN_BACKGROUND: ignore`
  - `RUN_ANY_IN_BACKGROUND: ignore`
  - standby bucket -> `restricted`
  - `force-stop`

说明：

- 普通 `adb shell cmd appops set ...` 在本机上会因为权限不足失败。
- 当前设备需要使用 root 路径：

人工审批后的单包限制意图：

1. 在已确认的设备上，以 root 权限将目标包名的 `RUN_IN_BACKGROUND` 设为 `ignore`。
2. 以 root 权限将目标包名的 `RUN_ANY_IN_BACKGROUND` 设为 `ignore`。
3. 将目标包名放入 `restricted` standby bucket。
4. 前台确认后停止目标包名的当前进程。

- 校验：

人工审批后的校验意图：

1. 查看目标包名的 AppOps 状态。
2. 查看目标包名的 standby bucket。

## 已执行并验证的消费类 App

设备序列号：

- `3bec6889`

已验证包名：

- `com.alibaba.aliexpresshd`
- `com.amazon.mShop.android.shopping`
- `com.einnovation.temu`
- `com.jingdong.app.mall`
- `com.taobao.taobao`
- `com.joybuy.jdi`

批量限制记录：

这些包名曾经按人工审批后的 Android platform tools 会话逐个处理。不要把这一段复制成自动 runner、agent 命令或后台循环；每次重新执行前都需要确认设备序列号、root 状态、包名仍存在、以及用户接受推送/刷新延迟风险。

操作意图：

1. 对每个包名设置 `RUN_IN_BACKGROUND=ignore`。
2. 对每个包名设置 `RUN_ANY_IN_BACKGROUND=ignore`。
3. 将每个包名放入 `restricted` standby bucket。
4. 对每个包名执行一次前台确认后的停止操作。

校验意图：

1. 查看每个包名的 `RUN_IN_BACKGROUND` 和 `RUN_ANY_IN_BACKGROUND` 状态。
2. 查看每个包名的 standby bucket。

## 推荐的第二批后台限制对象

这些 App 更偏“优化建议”，还没有统一执行：

- `com.xiaomi.smarthome`
- `com.immersivetranslate.transtify`
- `eu.darken.sdmse`
- `com.emanuelef.remote_capture`
- `com.microsoft.appmanager`
- `com.microsoft.deviceintegrationservice`
- `com.microsoftsdk.crossdeviceservicebroker`

批量限制意图：

这批对象尚未统一执行。若未来要处理，先转成明确的人工审批任务，再逐个包名确认是否仍安装、是否依赖后台推送、以及是否允许 root 级 AppOps 修改。不要从文档直接生成 shell 循环。

## 解除限制

如果要恢复为默认值：

人工审批后的恢复意图：

1. 将目标包名的 `RUN_IN_BACKGROUND` 恢复为 `allow`。
2. 将目标包名的 `RUN_ANY_IN_BACKGROUND` 恢复为 `allow`。
3. 将目标包名的 standby bucket 调回 `active`。

说明：

- `active` 不一定永久保持，系统会自行调整 bucket。
- 如果只是想恢复正常行为，`allow + active` 通常足够。

## 风险提示

- 后台限制会影响：
  - 推送时效
  - 后台刷新
  - 价格提醒
  - 物流提醒
  - 某些账号状态同步

- 对消息或即时事件强依赖的 App，不应一刀切限制。
