# Termux Automation Limitations

日期：2026-04-04

## 背景

目标是把 `/storage/emulated/0/Download/phone-ops-kit` 中的资料包导入 `Termux`，并让用户在 `Termux` 前台进入该目录后运行 `termux-bootstrap.sh`。这段是历史目标描述，不是 Mac/ADB 可执行入口；当前推荐的人工步骤见下方“当前推荐流程”。

以便自动安装常用运维包：

- `openssh`
- `git`
- `curl`
- `wget`
- `aria2`
- `rsync`
- `ripgrep`
- `jq`
- `tmux`
- `vim`
- `neovim`
- `python`
- `nodejs-lts`
- `openssl-tool`
- `zip`
- `unzip`

## 已确认的限制

### 1. 不能从 `adb/su` 直接执行 Termux 私有目录内的二进制

尝试执行：

- `/data/data/com.termux/files/usr/bin/bash`
- `pkg`

结果：

- 从 `adb shell` / `su -c` 路径触发时，返回 `inaccessible or not found`
- 说明当前 ROM / SELinux / app sandbox 边界阻止了这种跨上下文执行

### 2. 不能通过 root 直接写入 `Termux` 私有 home 目录

尝试写入：

- `/data/data/com.termux/files/home`
- `/data/user/0/com.termux/files/home`

结果：

- `Permission denied`
- 即使是 root，也没有直接成功跨上下文写入该 app 私有目录

### 3. `run-as com.termux` 不可用

结果：

- `run-as: package not debuggable: com.termux`

因此不能用 `run-as` 进入该应用私有空间执行命令。

### 4. 通过 UI 注入命令到 Termux 前台，本次没有形成可靠验证

尝试：

- 拉起 `TermuxActivity`
- `adb shell input text ...`
- `adb shell input keyevent ENTER`

结果：

- 没有形成可验证的文件写入或命令执行结果
- 因此不能把这条路径当作可靠自动化方案

## 已确认可行的部分

### 1. `Termux` 本体已安装，运行时已初始化

已确认存在：

- `/data/data/com.termux/files/usr/bin/bash`
- `/data/data/com.termux/files/usr/bin/pkg`
- `/data/user/0/com.termux/files/home`

这说明：

- `Termux` 自己是正常的
- 问题不在 `Termux` 没装好
- 问题在“从外部自动化驱动它”

### 2. 外部共享存储路径可正常使用

已成功下发：

- `/storage/emulated/0/Download/phone-ops-kit`

因此最短可行路径是：让用户在 `Termux` 内手动执行 bootstrap。

## 当前推荐流程

在手机里打开 `Termux`，由用户在前台确认存储授权后手动执行。下面是人工操作步骤，不是 Mac/ADB 自动化入口，不能由本仓库的 dry-run 或 agent 代为验证：

1. 执行 `termux-setup-storage`，并在手机端完成 Android 存储授权。
2. 执行 `cd /storage/emulated/0/Download/phone-ops-kit`。
3. 执行 `bash termux-bootstrap.sh`。

`termux-setup-storage` 可能触发 Android 存储权限 UI；只有看到手机端授权流程完成后，后续 `cd /storage/emulated/0/Download/phone-ops-kit` 才能作为人工步骤继续。

这是当前最稳、最短、最少踩权限边界的方案。

## 后续如果要继续自动化

可以探索但尚未验证的方向：

1. 使用 `Termux:Tasker` 或外部执行插件
2. 检查 `Termux` 是否允许 `RUN_COMMAND` 且用户开启了相关设置
3. 改为在手机本地部署专用 root helper，而不是驱动 `Termux`
4. 使用用户确认后的人机协作式 UI 自动化，而不是静默后台执行

## 结论

当前 ROM 上：

- `adb + su` 很适合做诊断和系统级设置
- 不适合无缝接管 `Termux` 私有运行时

所以对这类任务的正确操作逻辑是：

1. 自动下发资料包到共享目录
2. 自动完成系统级可控操作
3. 将 `Termux` 安装步骤收缩为最短人工步骤
4. 不要伪装成“已自动安装成功”
