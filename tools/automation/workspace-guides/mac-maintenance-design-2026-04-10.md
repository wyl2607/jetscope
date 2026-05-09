# mac-maintenance 工具设计文档

**日期：** 2026-04-10
**状态：** 已批准，待实现
**背景：** 2026-04-10 对 MacBook Air M2 和 Mac Mini 完成一次手动大清理，将清理经验沉淀为可复用工具设计。
**注意：** 本文档为设计提案，以下路径和命令均为拟议结构，尚未实现。不应作为当前可执行入口使用。

---

## 目标

- 一条命令完成「清理缓存 + brew 更新」日常维护
- 每次运行自动记录：释放空间、更新了哪些包
- 跨机器复用：各台机 `git pull` 即可同步最新脚本

## 拟议目录结构

以下为设计时提议的目录布局，尚未创建：

```text
~/tools/mac-maintenance/          (proposed, not yet created)
├── maintain.sh            # 唯一入口（cleanup + update + 写日志）
├── lib/
│   ├── cleanup.sh         # 清理逻辑
│   └── update.sh          # brew update/upgrade/cleanup
├── logs/
│   ├── history.csv        # 每次运行汇总行
│   └── runs/              # 每次完整输出（YYYY-MM-DD-MACHINE.log）
├── audit/
│   └── 2026-04-10-initial.md   # 初次大扫除记录
└── README.md
```

---

## 组件设计

### `maintain.sh` — 入口编排（拟议接口）

```text
拟议用法（尚未实现）:
  maintain.sh              # 完整维护（清理 + 更新）
  maintain.sh --preview    # 只预览，不执行
  maintain.sh --skip-update # 只清理，跳过 brew 更新
  maintain.sh --yes        # 跳过所有确认提示

拟议流程:
  1. 记录开始时间 + 磁盘快照（df -h /System/Volumes/Data）
  2. source lib/cleanup.sh && run_cleanup "$@"
  3. source lib/update.sh   && run_update "$@"
  4. 计算释放空间 = 结束可用 - 开始可用
  5. 追加一行到 logs/history.csv
  6. 完整输出 tee 到 logs/runs/YYYY-MM-DD-$(hostname -s).log
```

### `lib/cleanup.sh` — 清理逻辑

继承 `mac_cleanup_v2.sh` 的安全机制（路径在 $HOME 内检查、拒绝危险根路径、不以 root 运行），在此基础上增加：

| 清理项 | 说明 |
|--------|------|
| `~/Library/Caches/*` | 应用缓存，安全清空 |
| `~/Library/Logs/*` | 应用日志 |
| `~/Library/Logs/DiagnosticReports/` | 崩溃报告 |
| `~/.Trash/*` | 废纸篓 |
| `brew cleanup --prune=all` | Homebrew 下载缓存 |
| **cmux 缓存**（WebKit、HTTPStorages、SentryCrash） | 今日新增，防内存溢出残留 |
| **AI 模型检测**（`<optional-model-cache:lmstudio>`、`<optional-model-cache:ollama>`） | 只检测报告大小，不自动删除 |
| `npm cache clean` | 有 npm 才运行 |
| Xcode DerivedData | 有 Xcode 才运行 |
| Docker prune（`--filter until=24h`） | 有 Docker 才运行 |
| PM2 日志 | 有 PM2 才运行 |

安全规则（继承 v2）：
- 路径必须在 `$HOME` 内，否则拒绝
- 拒绝 `/`、`$HOME`、`/Users`、`/System`、`/Library`、`/Applications`
- 禁止以 root 运行
- 支持 `preview` 模式（只报告大小，不删除）

### `lib/update.sh` — Homebrew 更新（拟议逻辑）

```text
# 拟议实现伪代码，非当前可执行脚本
brew update
brew upgrade          # 记录哪些包从哪个版本升到哪个版本
brew cleanup --prune=all
brew autoremove
```

输出格式化为可读的升级摘要，写入 run log。

### `logs/history.csv` — 运行历史（拟议格式）

```text
# 拟议 CSV 格式示例，非真实数据
date,machine,freed_gb,brew_updated,duration_sec
2026-04-10,yumei-macbook,13.4,12,84
2026-04-10,yilinmac,43.1,7,102
```

字段说明：
- `freed_gb`：本次清理释放的磁盘空间（GB，保留一位小数）
- `brew_updated`：本次 brew upgrade 升级的包数量
- `duration_sec`：整个 maintain.sh 运行时长（秒）

---

## 错误处理

- `set -Eeuo pipefail`：任何命令失败立即退出并报错
- 单个清理项失败用 `log_warn` 记录，不中断整体流程（例如 bun 缓存权限问题）
- brew 命令失败只警告，不中断（网络问题不应导致清理失败）

---

## 2026-04-10 大扫除记录（拟议路径：`audit/2026-04-10-initial.md`）

独立文件，记录：
- 发现的根因（cmux/terminal 内存溢出 + 磁盘 92% 满）
- MacBook 清理项和释放量
- Mac Mini 清理项和释放量
- 停用的启动项清单
- 内存溢出防治策略
- 待用户手动执行的 sudo 命令

---

## 拟议使用约定

以下为设计时预期的使用方式，尚未落地：

- 各台机通过 `git pull` 同步脚本更新
- 建议每月运行一次 `maintain.sh`
- AI 模型需手动决策删除（脚本只报告大小）
- `sudo` 相关操作（LaunchDaemon 停用）不纳入脚本，保留在 audit 文档里作为参考

---

## 不在范围内

- LaunchDaemon 的自动停用（需要 sudo，风险高，人工执行）
- Apple Intelligence 模型删除（通过系统设置，不是文件操作）
- 远端 VPS 清理（另有 vps-roundtrip.sh 体系）
