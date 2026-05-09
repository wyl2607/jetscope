# 免费模型选择决策树（历史指南）

> Status: Historical / compatibility reference.
>
> Maintained local routing truth is `scripts/ai-model-router.py` plus
> `workspace-guides/opencode-model-policy.json`. New automation should use
> `python3 scripts/ai-model-router.py --task <task-class> --json` instead of
> copying the legacy `kilo_*` / `opencode_ask` decision tree below.
>
> Local router task classes are `fast_probe`, `structured_check`, `hard_review`,
> `large_implementation`, `chinese_reasoning`, and `codex_execution`. The
> default OpenCode policy profile is `daily-free-first`, with `strong-go` and
> `deep-review` used for heavier implementation or review lanes.

This document is kept to explain older Kilo/OpenCode helper conventions. Treat
the original examples as historical unless a local wrapper still explicitly
implements them.

---

## 🎯 历史快速决策流程

For maintained routing, prefer:

```bash
python3 scripts/ai-model-router.py --task fast_probe --json
python3 scripts/ai-model-router.py --task hard_review --json
python3 scripts/ai-model-router.py --task large_implementation --json
```

The legacy flow below is retained only for compatibility notes.

```text
我要做什么?
│
├─→ 【快速问题】(不需要深度)
│   └─→ 选择: kilo_ask model="grok" ⚡ (6.1s)
│       例: "什么是 REST API?"
│
├─→ 【代码实现】(需要好的代码)
│   └─→ 选择: kilo_code model="stepfun" 💻 (代码质量 4.5/5)
│       例: "实现一个二叉树遍历函数"
│
├─→ 【一般编程问题】
│   └─→ 选择: kilo_ask model="auto" 🤖 (质量 4.5/5)
│       例: "数据库索引如何工作?"
│
├─→ 【复杂架构设计】(需要深度思考)
│   └─→ 选择: kilo_ask model="nemotron" 🧠 (当前模型: kilo/nvidia/nemotron-3-super-120b-a12b:free)
│       例: "设计实时聊天系统架构"
│
└─→ 【不确定】
    └─→ 选择: kilo_ask model="auto" (默认安全选择)
```

---

## 📊 历史模型对比速查表

| 需求 | 首选 | 备选 1 | 备选 2 | 不要用 |
| ------ | ------ | -------- | -------- | -------- |
| 速度优先 | grok | auto | stepfun | nemotron |
| 质量优先 | auto | nemotron | stepfun | grok |
| 代码优先 | stepfun | auto | grok | nemotron |
| 推理优先 | nemotron | auto | stepfun | grok |
| 通用任务 | auto | grok | stepfun | nemotron |
| OpenCode | lite | chat | lite-b | - |

---

## 🚀 历史工具调用速查

> 2026-04-21 复测更新：
>
> - OpenCode LongCat 已恢复（shared data 模式 + 网络可达时可用）
> - Nemotron 旧模型名已下线，请使用 `kilo/nvidia/nemotron-3-super-120b-a12b:free`（`model="nemotron"` 别名保持不变）

### 场景 A: Ask Questions

```python
# 快速定义类问题
result = await kilo_ask(
    prompt="What is a REST API?",
    model="grok"  # 快速
)

# 详细解释类问题
result = await kilo_ask(
    prompt="Explain microservices architecture",
    model="auto"  # 均衡
)

# 深度分析问题
result = await kilo_ask(
    prompt="How to design a distributed cache system?",
    model="nemotron"  # 深度推理
)
```

### 场景 B: Code Implementation

```python
# 简单函数
result = await kilo_code(
    task="Write a function to check palindrome",
    dir="<example-project-dir>",
    model="stepfun"  # 代码质量最佳
)

# 不确定用什么
result = await kilo_code(
    task="Implement JWT authentication",
    dir="<example-project-dir>",
    model="grok"  # 快速 + 能用就行
)
```

---

## ⚙️ 参数速查

### `kilo_ask` / `opencode_ask`

```python
{
  "prompt": "string",           # 必需：问题或任务
  "model": "kilo: auto|grok|stepfun|nemotron; opencode: lite|chat|lite-b",  # 可选
  "cwd": "/path/to/dir"         # 可选：工作目录
}
```

**模型选择**:

- `"auto"` ← 推荐默认值（自动选最佳）
- `"grok"` ← 快速 (~6s)
- `"stepfun"` ← 代码好
- `"nemotron"` ← 推理强

### `kilo_code` / `opencode_code`

```python
{
  "task": "string",             # 必需：实现任务
  "dir": "/path/to/project",    # 可选：项目目录
  "model": "kilo: auto|grok|stepfun|nemotron; opencode: lite|chat|lite-b"  # 可选
}
```

---

## 📈 性能指标速查

| 模型 | 速度 | 质量 | 代码 | 推理 | 配额 |
| ------ | ------ | ------ | ------ | ------ | ------ |
| grok | ⚡⚡⚡ | 🟢🟢 | 🟢🟢 | 🟡 | ♾️ |
| auto | ⚡⚡⚡ | 🟢🟢🟢 | 🟢🟢 | 🟢🟢 | ♾️ |
| stepfun | ⚡⚡ | 🟢🟢 | 🟢🟢🟢 | 🟡 | ♾️ |
| nemotron | ⚡ | 🟢🟢🟢 | 🟢🟢 | 🟢🟢🟢 | ♾️ |

---

## 🎯 历史场景流程表

The `IF` / `ELSE IF` snippets in this section are archived pseudocode from the
old helper stack. They are not the current production routing contract.

### 情景 1: 用户问"如何做 X?"

```text
IF "快速简单的问题" (如定义、基础概念)
  → kilo_ask(prompt, model="grok")        [6.1s]
ELSE IF "需要详细解释"
  → kilo_ask(prompt, model="auto")        [6.3s, 质量好]
ELSE IF "需要深度分析"
  → kilo_ask(prompt, model="nemotron")    [11.8s, 推理深]
```

### 情景 2: 用户要"实现代码"

```text
IF "简单函数" (验证、转换等)
  → kilo_code(task, model="stepfun")      [代码最好]
ELSE IF "不确定难度"
  → kilo_code(task, model="auto")         [安全选择]
ELSE IF "需要快速完成"
  → kilo_code(task, model="grok")         [最快]
```

### 情景 3: 系统设计问题

```text
→ kilo_ask(prompt, model="nemotron")  [架构设计专家]
```

### 情景 4: OpenCode 需要修复

```text
LongCat 当前可用（网络通畅时）
  → opencode_ask(prompt, model="lite")    [50M tokens/天]
网络异常时回退：
  → kilo_ask(prompt, model="auto")
```

---

## 💡 智能选择算法

```python
def choose_model(task_type, priority, complexity):
    """
    task_type: "question", "code", "architecture", "unknown"
    priority: "speed", "quality", "code_quality", "reasoning", "balanced"
    complexity: "simple", "medium", "complex"
    """

    # 速度第一
    if priority == "speed":
        return "grok"  # 6.1s

    # 质量第一
    elif priority == "quality":
        if complexity == "complex":
            return "nemotron"  # 推理强
        else:
            return "auto"  # 均衡质量好

    # 代码质量
    elif priority == "code_quality":
        return "stepfun"  # 代码最好

    # 推理能力
    elif priority == "reasoning":
        return "nemotron"  # 推理深度最强

    # 默认均衡
    else:
        return "auto"  # 自动选择最佳
```

---

## 🔍 错误处理

```python
# 如果某个模型返回错误
if response.status == "error":
    # 尝试备选方案
    if model == "nemotron":
        retry_model = "auto"
    elif model == "grok":
        retry_model = "auto"
    else:
        retry_model = "grok"

    # 重新尝试
    result = await kilo_ask(prompt, model=retry_model)
```

---

## 📋 使用检查清单

在调用前，检查：

- [ ] 选择了合适的模型？
- [ ] 设置了 `dir` 参数（code 任务）？
- [ ] 提示词足够清晰？
- [ ] 期望的响应时间合理？
- [ ] 配额是否足够（KiloCode 无限，OpenCode 注意）？

---

## 🎓 学习指南

**最佳示范**:

```text
✅ kilo_code task="Write a TypeScript function to validate email addresses"
   model="stepfun" dir="<example-project-dir>"

❌ kilo_ask prompt="code?"  # 太模糊
⚠️ opencode_ask prompt="..." # 若网络异常则回退到 kilo_ask(auto)
```

---

## 🔄 何时重新测试模型

- [ ] 每周一：运行快速健康检查
- [ ] 月初：完整质量评估
- [ ] 季度初：检查新模型、下线模型
- [ ] 模型响应异常时：立即重新测试

**重新测试方式**:

```bash
python3 scripts/ai-model-router.py --task fast_probe --json
```

---

## 📞 快速支持

- **响应时间太慢?** → 用 `model="grok"` 或 `"auto"`
- **代码质量不好?** → 用 `model="stepfun"`
- **推理不够深?** → 用 `model="nemotron"`
- **模型选不对?** → 用 `model="auto"` (安全默认)
- **OpenCode 临时异常?** → 使用 KiloCode 替代（配额无限）

---

**版本**: v1.1
**最后更新**: 2026-04-21
**维护**: Copilot CLI Benchmark System
**下次复测**: 每周一或模型异常时
