# 🖥️ 分布式集群诊断报告
**生成时间**: 2026-04-20 19:26 CEST  
**诊断范围**: 本地 macOS + 远程节点 (mac-mini/coco/windows-wsl) + VPS  
**当前任务**: 验证基础设施，为 Wave-2 并行部署做准备

---

## 📊 系统架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    任务调度中枢 (Local macOS)                    │
│  ~/.codex/config.toml (Codex CLI) + AGENTS.md (规程)            │
└──────────────────┬──────────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
   【Node A】  【Node B】  【Node C】
   mac-mini   coco      windows-wsl
   (SSH OK)   (SSH OK)   (WSL OK)
        │          │          │
        └──────────┼──────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
    【VPS Europe】      【API Router】
   (france-vps)    (relay.nf.video)
   (spare)        (primary/secondary)
```

---

## 🔍 【第 1 层】本地主机诊断 (macOS)

### 1.1 Codex CLI 配置
```toml
model_provider     = "codex"           # ✅ 指向 relay.nf.video
model              = "gpt-5.3-codex"   # → gpt-5.4 (自动迁移)
model_context      = 1,000,000 tokens
auto_compact_limit = 900,000 tokens
agents.max_threads = 6                 # ✅ 允许最多 6 并发 agents
```

**状态**: ✅ **就绪**

### 1.2 内网节点连接性 (已验证)
```
mac-mini    → SSH 可达     ✅ (REMOTE_SHELL_WRAP 支持)
coco        → SSH 可达     ✅ (Codex dispatch 已测)
windows-wsl → WSL bash -c  ✅ (首次 Wave-1 A3 成功)
```

**状态**: ✅ **3/3 节点在线**

### 1.3 本地 Lane 限制
```
Local Codex lanes (hard limit) = 2
Current active sessions        = 0 ✅ (已清理)
Available lanes               = 2 (充足)
```

**建议**: Wave-2 可在本地启动监控/合并 lane，不会触发限制。

---

## 💰 【第 2 层】API 配额分析

### 2.1 Multi-Tier API 路由表

| API | Tier | 日限额 | 剩余 | 模型 | 并发 | 备注 |
|-----|------|---------|-------|------|------|------|
| **longcat_flash** | free | 50M toks | 50M ✅ | Flash-Lite | 4 | 简单任务优先 |
| **longcat_thinking** | free | 5M toks | 5M ✅ | Thinking-2601 | 2 | 推理任务 |
| **openrouter_free** | free | ∞ | ∞ ✅ | gemma-3-12b | 3 | 备用免费模型 |
| **primary (paid)** | paid | $130 = ~260M toks | ~9M ⚠️ | gpt-5.4 | 2 | 强模型保留 |
| **secondary (paid)** | paid | $30 = ~60M toks | 30M ✅ | gpt-5.4-mini | 4 | 辅助 key |

**关键发现**:
- 🟢 **免费额度充足**: longcat + openrouter ≈ 55M token/天
- 🟡 **主力 key 紧张**: primary 仅剩 9M (每日 $130 预算)
- 🟢 **辅助充足**: secondary 30M 未使用

### 2.2 Wave-2 预估成本
根据 Wave-1 实际数据:
```
Wave-1 总耗时: A0(625s) + 并行(3×500s平均)
代码审查每次: ~2-3M token (CompanyProfilePage refactor)

Wave-2 预估:
├─ A4 (FrameworkResults)  → 2.5M token → 3.5 min
├─ A5 (TrendSection)      → 2.5M token → 3.5 min  
├─ A6 (NarrativeSection)  → 2.5M token → 3.5 min
└─ 本地 merge + npm run check → 2 min
────────────────────────────
总计: ~7.5M token (全部使用免费 tier)
```

✅ **完全可用免费额度完成，不需动用 primary key**

---

## 🚀 【第 3 层】分布式执行框架

### 3.1 调度器架构
```python
# 主入口
/Users/yumei/scripts/ai_distributed_dev_orchestrator.py

# 配置文件
~/tools/automation/runtime/distributed-dev-workflow/task-batch.template.json

# 执行方式 (3 种)
1. 广播模式 (broadcast)    → 同一任务 → 所有节点 → 取最快
2. 最快赢 (fastest)       → 同一任务 → 所有节点 → 第一个成功
3. 拆分模式 (split)       → 不同任务 → 不同节点 → 并行执行
```

### 3.2 当前 Wave-1 验证结果

| Node | 首次运行 | 成功率 | 时间 | 状态 |
|------|---------|--------|------|------|
| mac-mini (CR-A1) | ✅ | 100% | 325s | ✅ 合并 |
| coco (CR-A2) | ✅ | 100% | 502s | ✅ 合并 |
| windows-wsl (CR-A3) | ✅ | 100% | 544s | ✅ 合并 |

**发现**: Windows WSL 首次运行 (~540s) 稍长，可能是初次 JIT 编译或网络延迟。后续应当加速。

### 3.3 Merge Gate & Pull-back 策略
```
当前配置: artifacts_only (最安全)
├─ 只 pull 集合文件 + 远程日志
├─ 不会覆盖本地代码
├─ 冲突处理: git apply --3way

建议 Wave-2: 保持 artifacts_only (已验证)
```

---

## ⚙️ 【第 4 层】集群化开发工作流

### 4.1 标准步骤

```bash
# 【Phase 1】基础设施检查 (5-10 分钟)
./scripts/cluster-diagnostics.sh --full  # ← 我现在生成的内容
./scripts/node-healthcheck.sh            # ← SSH ping + disk + API 连接

# 【Phase 2】沙盒验证 (15 分钟)
python3 /Users/yumei/scripts/ai_distributed_dev_orchestrator.py \
  --manifest wave-2-manifest.json \
  --task-class dev \
  --dry-run                              # ← 模拟执行，不真正跑

# 【Phase 3】金丝雀执行 (30 分钟)
# 先只派发 1 个节点 (mac-mini A4)，验证成功后再开启其他 2 个
--nodes mac-mini --limit 1

# 【Phase 4】全量并行派发 (40 分钟)
--nodes mac-mini,coco,windows-wsl  # ← Wave-2 完整执行

# 【Phase 5】本地合并 & Gate (5 分钟)
git fetch origin
npm run check
git push origin main
```

### 4.2 故障恢复路径

| 失败场景 | 检测 | 恢复 |
|---------|------|------|
| 单节点超时 | timeout_at | 自动重试 (最多 3 次) |
| SSH 连接断 | network error | 故障转移到备用节点 |
| API 率限 | 429 Too Many Requests | 自动降速 + 使用免费 tier |
| 合并冲突 | git apply 失败 | 回滚该节点，通知操作员 |
| 全部失败 | all tasks dead_letter | `ready_for_next_dev_cycle=false` |

---

## 📈 【第 5 层】性能基准线 (Baseline)

### 5.1 Wave-1 实际表现

```
A0 (CompanyProfilePage.tsx utils.ts 19 helpers)
├─ Duration:  625s = 10.4 分钟
├─ Token:     ~3-4M
├─ Node:      mac-mini (本地)
└─ Result:    ✅ 1382→1191 行代码 (-191 行, 减 13%)

Wave-1 并行 (3 节点同时)
├─ A1 Duration: 325s (并行速度 -48% ✓ 预期)
├─ A2 Duration: 502s (并行速度 -20% ✓ 预期)
├─ A3 Duration: 544s (并行速度 -13%, WSL 首次较慢)
├─ Wall-clock:  ~11-12 分钟 (vs 序列化 1875s=31 分钟)
└─ 加速比:     2.6x (并行效率 ~87%)
```

### 5.2 预期 Wave-2 性能

基于 Wave-1 基准线:
```
单任务耗时: ~500s 平均 (CompanyProfilePage 相似复杂度)
并行成倍数: 3 节点

预期:
├─ 序列化总时间: 3 × 500s = 1500s = 25 分钟
├─ 并行实际:     ~600s = 10 分钟 (假设 2.5x 加速比)
├─ 本地 merge:   ~5 分钟
└─ 总耗时:       ~15-18 分钟 (允许偏差)
```

---

## 🎯 【第 6 层】前置条件检查清单

在启动 Wave-2 之前，需要验证:

### ✅ 基础设施 (已验证)
- [x] Codex 配置就绪 (model_provider=codex)
- [x] 3 个节点全部在线 (SSH 连接正常)
- [x] 本地 lane 充足 (0/2 使用中)
- [x] API 路由器就绪 (免费 + 付费 tier)

### ⚠️ 待验证 (启动前必做)

#### 1. 节点 API 调用能力

```bash
# 【测试 mac-mini API 连接】
ssh mac-mini 'curl -s https://api.longcat.chat/openai/health' | jq
  → 应返回 {"status": "ok"} 或类似

# 【测试 coco 网络延迟】
time ssh coco 'echo "ping"'
  → 往返时间应 < 500ms

# 【测试 windows-wsl Codex 执行】
ssh windows-pc "wsl bash -lc 'codex --version'"
  → 应返回 codex version 1.0.x
```

**Action**: 我为你生成这些测试脚本

#### 2. 任务清单 (task-batch.template.json)

需要验证:
```json
{
  "tasks": [
    {
      "id": "wave-2-a4",
      "node": "mac-mini",
      "section": "FrameworkResultsSection",
      "component_extract": true,
      "test_after": true
    },
    ...
  ]
}
```

**Action**: 需要生成 Wave-2 具体的 manifest

#### 3. 分支隔离

```bash
# 确认当前 branch 是 main
git branch -v
git status (应该是 clean)

# 确认已推送上一个 Wave-1
git log origin/main | head -5
```

**Action**: 确认 Wave-1 已全部推送到 origin/main

---

## 🚦 【第 7 层】集群就绪度评分

```
Readiness Score = (基础设施 + API + 节点 + 脚本 + 验证) / 5

【基础设施】 5/5 ✅
├─ Codex 就绪
├─ Lane 充足  
└─ SSH 连接正常

【API 配额】 4/5 ⚠️
├─ 免费额度充足 ✅
├─ primary key 紧张 (9M 剩余) ⚠️ 
└─ secondary 完整 ✅

【节点可用性】 5/5 ✅
├─ mac-mini ✅
├─ coco ✅
└─ windows-wsl ✅

【脚本框架】 5/5 ✅
├─ 调度器完整
├─ 路由器完整
└─ 分支隔离完整

【前置验证】 3/5 ⚠️ (需补全)
├─ 节点 API 能力未测 → 需测
├─ manifest 未准备 → 需生成
└─ Wave-1 推送状态未确认 → 需确认

─────────────────
总分:  21 / 25 = 84% 【黄灯】
```

---

## 📋 立即行动计划

### 👉 **推荐执行顺序**

#### STEP 1: 验证前置条件 (10-15 分钟) ← 现在立即做
```bash
# 检查 Wave-1 是否全部推送到 origin/main
cd ~/projects/esg-research-toolkit
git log --oneline origin/main | head -5
git status

# 测试 3 个节点 API 连接
ssh mac-mini 'curl -s https://api.longcat.chat/health | head -c 100'
ssh coco 'curl -s https://api.longcat.chat/health | head -c 100'
ssh windows-pc "wsl bash -lc 'codex --version'"

# 查看当前 free tier 额度
python3 /Users/yumei/tools/ai-router/api-router.js --config local --show-budget
```

#### STEP 2: 生成 Wave-2 SOP + Manifest (20-30 分钟)
```bash
# 参考 Wave-1 文档
cat ~/projects/esg-research-toolkit/docs/wave-1-sop.md

# 生成 Wave-2 manifest (3 个 CR)
# A4: FrameworkResultsSection (mac-mini)
# A5: TrendSection (coco)
# A6: NarrativeSection (windows-wsl)

# 生成 prompt
./scripts/generate-wave-2-prompts.sh
```

#### STEP 3: 沙盒执行 (15 分钟)
```bash
python3 /Users/yumei/scripts/ai_distributed_dev_orchestrator.py \
  --manifest wave-2-manifest.json \
  --task-class dev \
  --dry-run
```

#### STEP 4: 金丝雀执行 (30 分钟) — 只 mac-mini
```bash
python3 /Users/yumei/scripts/ai_distributed_dev_orchestrator.py \
  --manifest wave-2-manifest.json \
  --task-class dev \
  --nodes mac-mini
```

#### STEP 5: 全量并行 (40 分钟)
```bash
python3 /Users/yumei/scripts/ai_distributed_dev_orchestrator.py \
  --manifest wave-2-manifest.json \
  --task-class dev \
  --nodes mac-mini,coco,windows-wsl
```

#### STEP 6: 本地合并 (5 分钟)
```bash
git fetch origin
npm run check
git push origin main
```

---

## 🔧 故障排查 (常见问题)

### Q1: Windows WSL 连接超时
**症状**: `ssh windows-pc` 卡住  
**原因**: WSL bash path 不可达  
**修复**:
```bash
ssh windows-pc "wsl bash -lc 'cd /home/wyl26/projects/esg-research-toolkit && pwd'"
```

### Q2: API 速率限制 429
**症状**: 多个并行任务时 429 错误  
**原因**: 免费 tier 达到并发限制  
**修复**: 降低 maxConcurrency
```json
{
  "longcat_flash": {
    "maxConcurrency": 2  // 从 4 降到 2
  }
}
```

### Q3: git apply 冲突
**症状**: Merge gate 失败，提示 "conflicting state"  
**原因**: Wave-1 某个 CR patch 与后续更改冲突  
**修复**:
```bash
git apply --reject patch-a4.patch  # 产生 .rej 文件
# 手动解决 .rej，然后
git apply --3way patch-a4.patch
```

---

## 📊 监控仪表盘建议

启动 Wave-2 时，建议实时监控:

```bash
# Terminal 1: 监控调度器进度
tail -f ~/.codex/logs | grep -E "dispatch|wave-2|node"

# Terminal 2: 监控 API 配额
watch -n 5 'python3 /Users/yumei/tools/ai-router/api-router.js --show-budget'

# Terminal 3: 监控 SSH 连接
watch -n 10 'for n in mac-mini coco windows-pc; do echo -n "$n: "; ssh -o ConnectTimeout=2 $n "echo OK" 2>&1; done'

# Terminal 4: 监控本地资源
watch -n 2 'ps aux | grep -E "codex|python"'
```

---

## ✅ 总结

**现状**: 84% 就绪  
**主要准备工作**: 5 个前置检查 + Manifest 生成  
**预计完成时间**: 
- 前置验证: 15 min
- 沙盒 → 金丝雀 → 全量: 80-90 min
- **总计: 2-2.5 小时**

**建议下一步**: 
1. ✅ 执行 STEP 1 (前置检查) — 立即
2. ✅ 我帮你生成 Wave-2 manifest — 立即
3. ⏳ 你审查 manifest — 5 min
4. 🚀 启动沙盒执行 — 20 min

**关键风险**:
- 🔴 primary key 紧张 (但 Wave-2 用免费 tier 完全够)
- 🟡 windows WSL 首次运行较慢 (预期, 可接受)
- 🟡 需要 Wave-1 全部推送确认

**立即行动**: 告诉我你要开始哪个 STEP！
