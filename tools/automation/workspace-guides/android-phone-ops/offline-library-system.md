# Android Offline Library System

日期：2026-04-05

目标：把安卓手机变成一套可维护的离线知识库，而不是一堆零散 App。

## 当前设备基线

- 设备：OnePlus `CPH2653`
- 已连接：`adb` 可用
- 空闲存储：约 `741G`
- 已有核心 App：
  - `org.kiwix.kiwixmobile.standalone`
  - `net.osmand.plus`
  - `app.organicmaps`
  - `com.foobnix.pro.pdf.reader`
- 已补装：
  - `de.reimardoeffinger.quickdic`

## App 分工

- `Kiwix`
  - 管理 `.zim` 百科 / 维基 / Wiktionary / 手册镜像
  - 推荐目录：`OfflineLibrary/10-Encyclopedia-ZIM`

- `QuickDic`
  - 负责离线词典与词库查询
  - 推荐目录：`OfflineLibrary/20-Dictionaries`
  - 词典内容通常仍由 App 内部管理；导出件和说明放此目录

- `Organic Maps` / `OsmAnd`
  - 负责离线地图与导航
  - 推荐目录：`OfflineLibrary/30-Maps-And-GPX`
  - 这里主要存 GPX、导出轨迹、补充地图资料

- `Librera`
  - 负责 EPUB / PDF / HTML / TXT
  - 推荐扫描目录：
    - `OfflineLibrary/40-Books-Epub`
    - `OfflineLibrary/50-Manuals-PDF`
    - `OfflineLibrary/60-Courses-And-Notes`

## 目录规范

手机根目录：

- `/storage/emulated/0/OfflineLibrary/00-Inbox`
- `/storage/emulated/0/OfflineLibrary/10-Encyclopedia-ZIM`
- `/storage/emulated/0/OfflineLibrary/20-Dictionaries`
- `/storage/emulated/0/OfflineLibrary/30-Maps-And-GPX`
- `/storage/emulated/0/OfflineLibrary/40-Books-Epub`
- `/storage/emulated/0/OfflineLibrary/50-Manuals-PDF`
- `/storage/emulated/0/OfflineLibrary/60-Courses-And-Notes`
- `/storage/emulated/0/OfflineLibrary/90-Archive`

本机镜像根目录：

- `~/OfflineLibrary`

## 操作脚本

当前入口：

- 当前仓库未找到 `<legacy-missing-script:phone-offline-library.sh>`，旧脚本入口已失效。
- 下面是人工审批后的手机资料整理意图，不是自动 runner 或 agent 默认入口。
- 将 `<local-zim-file>` 替换为本机已经下载并确认可公开下发的 `.zim` 文件路径后，再由用户手动执行。

人工步骤：

1. 在手机共享存储中确认 `/storage/emulated/0/OfflineLibrary/10-Encyclopedia-ZIM` 目录存在。
2. 将已确认的 `<local-zim-file>` 下发到该目录。
3. 在手机端或经人工批准的 Android platform tools 会话中检查 `/storage/emulated/0/OfflineLibrary`。

## 推荐入库顺序

1. `Kiwix`：
   - 先装小而高频的 `.zim`
   - 例如：Wikipedia 精简包、Wiktionary、Wikibooks、MDN/Stack Overflow 镜像

2. `QuickDic`：
   - 先下常用双语词典
   - 例如：英汉、汉英、德英

3. `Organic Maps` / `OsmAnd`
   - 只下常用国家/州/城市
   - 轨迹、收藏点、出行文件统一放 `30-Maps-And-GPX`

4. `Librera`
   - 按电子书 / PDF 手册 / 课程笔记三段分开扫描

## 维护规则

- 新资料先落 `00-Inbox`，确认用途后再归档。
- `.zim` 不要混到 EPUB/PDF 目录里。
- 大文件下载优先在本机完成后再用 `adb push` 分类下发，避免手机下载过程失控。
- 每次做大规模手机资料整理后，补一条工程记录。
