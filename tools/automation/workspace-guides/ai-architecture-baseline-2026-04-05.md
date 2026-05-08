# AI Architecture Baseline

日期: 2026-04-05
范围: `/Users/yumei` 工作区级盘点
用途: 给未来回看时保留一份“设备角色 + API/模型分布 + 今日可观测用量基线”

## 一句话结论

当前这套体系已经形成了比较清晰的三层结构:

- 本地开发机: 主开发入口，也是 `Codex` / `OpenClaw` / `OpenCode` 的实际交互面。
- Mac mini: 控制面中枢，不是主 AI 计算面，主要负责同步、分发、汇总、健康检查、自愈和调度。
- 云端节点:
  - `usa-vps`: 主执行面，承担 `meichen-web` 队列执行、`home-lab-app` 远端部署位、`sustainos` 的无人值守 runner。
  - `france-vps`: 轻任务/待机节点，更多是备用与低负载执行面。

API 也已经分成了三层:

- 免费层: `LongCat`
- 免费聚合层: `OpenRouter`
- 付费强模型层: `relay.nf.video`

但要特别注意:

- `CC Switch` 今天能看到的 usage 主要是 `probe traffic`，不是完整真实业务流量。
- 真实业务 usage 还没有统一拦截层，`proxy_request_logs` 当前为空。
- 所以今天能做的是:
  - 明确当前架构和调用分布
  - 保存“已证实配置真相”
  - 保存“已证实 probe 用量”
  - 对真实业务用量给出保守估算，而不是伪精确统计

## 设备身份

### 1. 本地开发机

职责:

- 主工作站
- 工作区主入口
- `CC Switch` / `Codex` / `OpenClaw` / `OpenCode` 的本地控制与交互入口
- 本地代码编辑、验证、发起同步
- `sustainos` / `meichen-web` / `home-lab-app` 的源头开发环境

证据:

- `~/.codex/config.toml`
- `~/.config/opencode/opencode.json`
- `~/.cc-switch/cc-switch.db`
- `infra/api-switch/ai-router-nodes.json`

### 2. Mac mini

职责:

- 控制面，不是主业务 AI 推理面
- 作为统一中控，把项目镜像分发到 USA/France VPS
- 负责健康汇总、watchdog、pullback 边界、待机/运行态判定
- 在 `meichen-web` 里是 secondary compute，默认未 fully ready

证据:

- `projects/sustainos/PROJECT_PROGRESS.md`
- `projects/sustainos/QUEUED.md`
- `projects/sustainos/.automation/project.conf`
- `projects/meichen-web/.automation/project.conf`

### 3. USA VPS

职责:

- 主云执行面
- `meichen-web` 的 primary queue host / online app
- `home-lab-app` 的 remote host
- `sustainos` 的主要无人值守执行位

证据:

- `projects/meichen-web/AGENTS.md`
- `projects/meichen-web/.automation/project.conf`
- `projects/home-lab-app/.automation/project.conf`
- `projects/sustainos/.automation/project.conf`

### 4. France VPS

职责:

- 备用/轻任务云节点
- `meichen-web` light task node
- `sustainos` standby 节点

证据:

- `projects/meichen-web/AGENTS.md`
- `projects/sustainos/.automation/project.conf`
- `projects/sustainos/PROJECT_PROGRESS.md`

## 当前 API 与模型分布

### 工作区级 API 栈

1. `LongCat`
   - Base URL: `https://api.longcat.chat/openai`
   - 用途: 免费快速层
   - 典型模型:
     - `LongCat-Flash-Lite`
     - `LongCat-Flash-Chat`

2. `OpenRouter`
   - Base URL: `https://openrouter.ai/api/v1`
   - 用途: 免费聚合层
   - 当前看到的是备用/补充层，不是主要生产执行面

3. `relay.nf.video`
   - Base URL: `https://relay.nf.video/v1`
   - 用途: 付费强模型层
   - 典型模型:
     - `gpt-5.4`
     - `gpt-5`

4. `Anthropic`
   - 用途: `sustainos` 业务代码里的直接 Claude 调用
   - 典型模型:
     - `claude-sonnet-4-6`

5. `Context7`
   - 用途: `home-lab-app` 的知识服务 API，不是通用 LLM provider

## 当前每个主要软件实际落到什么 API / 模型

### Codex

- 当前配置:
  - provider: `codex`
  - base URL: `https://relay.nf.video/v1`
  - model: `gpt-5.4`
- 证据:
  - `~/.codex/config.toml`
- `CC Switch` 当前选中:
  - `codex = default`
  - 对应显示名: `Codex 130 (GPT-5.4)`
- `CC Switch` 当前健康:
  - `default` healthy
  - `relay-backup` quota exceeded

### OpenCode

- 当前配置:
  - active model: `codex-relay-backup/gpt-5.4`
  - 备选 provider:
    - `codex-relay`
    - `codex-relay-backup`
    - `longcat-a-lite`
    - `longcat-b-lite`
    - `longcat-a-chat`
    - `longcat-b-chat`
- 证据:
  - `~/.config/opencode/opencode.json`
- `CC Switch` 当前选中:
  - `opencode = codex-relay-backup`

### OpenClaw

- 当前 provider 池:
  - `relay-main -> gpt-5`
  - `nfvideo -> gpt-5.4`
  - `longcat-a-lite -> LongCat-Flash-Lite`
  - `longcat-b-lite -> LongCat-Flash-Lite`
  - `longcat-a-chat -> LongCat-Flash-Chat`
  - `longcat-b-chat -> LongCat-Flash-Chat`
  - `moonshot -> kimi-k2.5`
- `CC Switch` 当前选中:
  - `openclaw = relay-main`
- 当前 scene:
  - `strong`
- 证据:
  - `~/.cc-switch-sidecar/state.json`
  - `~/.cc-switch/cc-switch.db`

### SustainOS

分成两层:

- 业务代码直接调用:
  - provider: `Anthropic`
  - model: `claude-sonnet-4-6`
  - 证据:
    - `projects/sustainos/core/config.py`
    - `projects/sustainos/core/claude.py`
- 无人值守 runner:
  - model: `custom/gpt-5.4`
  - reviewer models: `custom/gpt-5.4,longcat/LongCat-Flash-Chat`
  - 运行位置: VPS root 环境
  - 证据:
    - `projects/sustainos/scripts/ops/overnight-codex.sh`

### Meichen Web

- 队列执行主线:
  - `codex-primary`
  - `codex-backup`
  - fallback `claude`
- 当前运行证据显示 done task 主要由:
  - `codex-primary`
- 运行位置:
  - `usa-vps`
- 证据:
  - `projects/meichen-web/queue/worker.sh`
  - `projects/meichen-web/queue/overnight-runner.sh`
  - `projects/meichen-web/queue/persistent-worker.sh`
  - `projects/meichen-web/queue/queue-runtime-report.json`

### Home Lab App

- 当前明确看到的外部智能/知识 API:
  - `Context7`
- 远端部署位:
  - `usa-vps`
- 没看到明确的大模型业务调用链落在 OpenAI/Anthropic
- 证据:
  - `projects/home-lab-app/lib/context7.ts`
  - `projects/home-lab-app/.automation/project.conf`

## 当前 CC Switch 真实状态

来源:

- `~/.cc-switch/cc-switch.db`
- `~/.cc-switch-sidecar/state.json`

2026-04-05 当前状态:

- `scene = strong`
- `auto_switch = true`
- selected:
  - `codex = default`
  - `openclaw = relay-main`
  - `opencode = codex-relay-backup`

健康结论:

- 可用:
  - `codex:default -> gpt-5.4`
  - `openclaw:relay-main -> gpt-5`
  - `openclaw:longcat-a-lite -> LongCat-Flash-Lite`
  - `openclaw:longcat-a-chat -> LongCat-Flash-Chat`
  - `openclaw:longcat-b-lite -> LongCat-Flash-Lite`
  - `opencode:codex-relay-backup -> gpt-5.4`
  - `opencode:opencode-longcat-a-lite -> LongCat-Flash-Lite`
  - `opencode:opencode-longcat-a-chat -> LongCat-Flash-Chat`
  - `opencode:opencode-longcat-b-lite -> LongCat-Flash-Lite`
- 不可用:
  - `relay-backup` / `nfvideo` / `codex-relay` 当前报 `Daily quota exceeded`
  - `longcat-b-chat` / `opencode-longcat-b-chat` 当前报 `429`
  - `moonshot` 当前缺失 `api_key/base_url/model`

## 今日已证实用量

### A. CC Switch Probe Usage

这是今天唯一已经结构化落盘、可直接查询的 usage 数据。

但它不是完整真实业务流量，只是 sidecar 探测流量。

来源:

- `~/.cc-switch/cc-switch.db -> usage_daily_rollups`
- `~/.cc-switch/cc-switch.db -> stream_check_logs`

2026-04-05 汇总:

- requests: `1803`
- successes: `1135`
- input tokens: `11656`
- output tokens: `17440`
- probe cost: `$0.148462`
- latest probe time: `2026-04-05T15:22:00Z`

按 app 汇总:

- `codex`
  - requests: `258`
  - successes: `127`
  - input: `1397`
  - output: `635`
  - cost: `$0`
- `openclaw`
  - requests: `774`
  - successes: `509`
  - input: `5191`
  - output: `15429`
  - cost: `$0.148462`
- `opencode`
  - requests: `771`
  - successes: `499`
  - input: `5068`
  - output: `1376`
  - cost: `$0`

按主要 provider/model 看:

- `openclaw / relay-main / gpt-5`
  - `129 req / 128 success / 16075 tokens / $0.148462`
- `codex / default / gpt-5.4`
  - `129 req / 127 success / 2032 tokens / $0`
- `opencode / codex-relay-backup / gpt-5.4`
  - `128 req / 126 success / 2016 tokens / $0`
- `openclaw / longcat-a-chat / LongCat-Flash-Chat`
  - `129 req / 124 success / 2232 tokens / $0`
- `opencode / opencode-longcat-a-chat / LongCat-Flash-Chat`
  - `128 req / 119 success / 2142 tokens / $0`

### B. CC Switch Quota Buckets

来源:

- `~/.cc-switch-sidecar/state.json`

2026-04-05 当前记录:

- `nf.video A:usd`
  - total: `130`
  - used: `0.03651`
- `LongCat A:LongCat-Flash-Lite`
  - total: `50000000`
  - used: `540`
- `LongCat B:LongCat-Flash-Lite`
  - total: `50000000`
  - used: `540`
- `LongCat A:LongCat-Flash-Chat`
  - total: `5000000`
  - used: `1062`

注意:

- 这也是 sidecar 视角下的 probe/quota 记录，不等于完整真实业务日账单。

## 今日真实业务用量能不能精确说

还不能。

原因:

- `~/.cc-switch/cc-switch.db` 里的 `proxy_request_logs` 当前是 `0 rows`
- `tools/cc-switch-sidecar/README.md` 明确写了:
  - current usage dashboard is still `probe traffic only`
  - real traffic accounting is not done

所以今天最严格的说法应该是:

- 我们已经能稳定记录:
  - 选路状态
  - provider 健康
  - probe request 数
  - probe token 数
  - probe cost
- 我们还不能稳定记录:
  - 每个真实用户/真实任务/真实业务调用的完整 token/cost
  - 每台设备的真实 LLM 业务日消耗

## 保守估算版设备日用量

下面这部分是“基于代码职责和运行状态的保守估算”，不是账单。

### 本地开发机

- 使用强度: 高
- 主要 API / 模型:
  - `Codex -> relay.nf.video / gpt-5.4`
  - `OpenCode -> relay.nf.video / gpt-5.4`
  - `OpenClaw -> relay-main / gpt-5`
  - 免费回退: `LongCat`
- 估算:
  - 这是当前最可能消耗付费强模型额度的核心设备
  - 如果按现状看，真实业务 AI 消耗里本地应当是第一梯队
- 可信度: 中

### Mac mini

- 使用强度: 低到中
- 主要身份:
  - 控制面
  - 调度/同步/健康检查
  - 非主业务推理节点
- 估算:
  - 日常 AI 调用应该明显低于本地机和 USA VPS
  - 在 `M05` 真正切到 Mac mini 发起任务之前，它更像 orchestrator，不像 heavy inference node
- 可信度: 高

### USA VPS

- 使用强度: 中到高
- 主要 API / 模型:
  - `meichen-web -> codex-primary / codex-backup / claude fallback`
  - `sustainos runner -> custom/gpt-5.4 + LongCat reviewer`
  - `sustainos app code -> Anthropic Claude`
- 估算:
  - 它是当前最主要的云端 AI 执行节点
  - 若看“无人值守任务”这一类 usage，USA VPS 大概率是第一名
- 可信度: 高

### France VPS

- 使用强度: 低
- 主要身份:
  - standby / light worker
  - 备用与轻任务节点
- 估算:
  - 当前日用量应远低于 USA VPS
  - 更接近“有路由能力但非主承载面”
- 可信度: 高

## 今天最适合当长期基线的数字

如果要做“10 年后还能回看”的起点，今天建议先把下面这些当 baseline:

1. 架构身份
   - local = 主开发面
   - mac-mini = 控制面
   - usa-vps = 主执行面
   - france-vps = 轻任务/待机面

2. 当前选路
   - codex = `gpt-5.4 @ relay.nf.video`
   - openclaw = `gpt-5 @ relay-main`
   - opencode = `gpt-5.4 @ codex-relay-backup`
   - scene = `strong`

3. 今日 probe usage
   - requests = `1803`
   - successes = `1135`
   - input tokens = `11656`
   - output tokens = `17440`
   - probe cost = `$0.148462`

4. 真实业务计量成熟度
   - 状态: `未完成`
   - 原因: `proxy_request_logs` 为空，统一 request interception 尚未接好

## 现在最大的缺口

不是“我们完全没有统计”，而是“我们只有 probe 统计，没有真实业务统计”。

最关键的下一步不是重做架构，而是把真实 usage 事件打通:

- 记录真实 request count
- 记录真实 input/output/cache tokens
- 记录真实 estimated cost
- 记录 app / provider / model / device 归因
- 把 probe 和 real usage 分开存

## 风险备注

- 多处配置和脚本仍直接保存 live secret，这属于真实运营风险。
- `relay` 主备 key 与 LongCat 多 key 已经进入多个本地配置面，后续应该逐步收敛到 env 或集中 secret 管理。
- 如果未来把今天的 `usage_daily_rollups` 当成“真实账单”，会导致结论失真。

## 主要证据路径

- `/Users/yumei/.cc-switch/cc-switch.db`
- `/Users/yumei/.cc-switch-sidecar/state.json`
- `/Users/yumei/tools/cc-switch-sidecar/controller.py`
- `/Users/yumei/tools/cc-switch-sidecar/README.md`
- `/Users/yumei/.codex/config.toml`
- `/Users/yumei/.config/opencode/opencode.json`
- `/Users/yumei/infra/api-switch/ai-router-nodes.json`
- `/Users/yumei/infra/api-switch/ai-router-nodes-usa.json`
- `/Users/yumei/infra/api-switch/ai-router-nodes-france.json`
- `projects/meichen-web/.automation/project.conf` (2026-04-05 historical reference; current local file may be absent)
- `/Users/yumei/projects/home-lab-app/.automation/project.conf`
- `projects/sustainos/.automation/project.conf` (2026-04-05 historical reference; current local file may be absent)
- `/Users/yumei/projects/sustainos/core/config.py`
- `/Users/yumei/projects/sustainos/core/claude.py`
