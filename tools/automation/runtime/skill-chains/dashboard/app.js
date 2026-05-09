(function () {
  var VALID_VIEWS = ["overview", "assistants", "traces", "skills", "dedupe", "repoEvolver", "dispatch"];
  var STALE_THRESHOLD_MS = 5 * 60 * 1000;
  var data = null;
  var watchLog = null;
  var skillLibrary = window.__SKILL_LIBRARY_DATA__ || null;
  var skillLibraryLoadedAt = skillLibrary ? Date.now() : 0;
  var skillLibraryPromise = null;
  var SKILL_LIBRARY_TTL_MS = 5 * 60 * 1000;
  var selectedKey = "";
  var dispatchFocusKey = "";
  var initialParams = new URLSearchParams(window.location.search);
  var selectedAssistantId = initialParams.get("assistant") || "";
  var assistantDrawerOpen = Boolean(selectedAssistantId);
  var selectedSkillId = initialParams.get("skill") || "";
  var skillDrawerOpen = Boolean(selectedSkillId);
  var currentView = resolveView();
  var traceProjectFilter = initialParams.get("trace_project") || initialParams.get("project") || "";
  var traceKindFilter = initialParams.get("trace_kind") || "";
  var skillSearchTimer = null;
  var skillFilter = { query: "", categories: [], duplicate: false, important: false, merge: false };
  var showArchive = false;
  var lastDrawerFocus = null;
  var lang = resolveLang();
  var i18n = window.__SKILL_CHAIN_I18N__ || {};
  var stateClass = {
    pending: "state-pending",
    gate_ready: "state-active",
    implementing: "state-active",
    local_green: "state-done",
    broad_green: "state-done",
    reviewed: "state-done",
    push_ready: "state-done"
  };
  var assistantLabels = {
    claude: "Claude",
    codex: "Codex",
    open_code: "OpenCode",
    opencode: "OpenCode",
    user: "User",
    user_approved: "User",
    claude_or_codex: "Claude/Codex"
  };

  var els = {
    title: document.getElementById("title"),
    meta: document.getElementById("meta"),
    summary: document.getElementById("summary"),
    assistantView: document.getElementById("assistantView"),
    advisoryView: document.getElementById("advisoryView"),
    traceExplorerView: document.getElementById("traceExplorerView"),
    skillLibraryView: document.getElementById("skillLibraryView"),
    dedupeView: document.getElementById("dedupeView"),
    repoEvolverView: document.getElementById("repoEvolverView"),
    dispatchView: document.getElementById("dispatchView"),
    viewNav: document.getElementById("viewNav"),
    projectCount: document.getElementById("projectCount"),
    projectList: document.getElementById("projectList"),
    chainName: document.getElementById("chainName"),
    chainView: document.getElementById("chainView"),
    stateName: document.getElementById("stateName"),
    stateView: document.getElementById("stateView"),
    traceCount: document.getElementById("traceCount"),
    traceList: document.getElementById("traceList"),
    error: document.getElementById("error"),
    staleBanner: document.getElementById("stale-banner"),
    reload: document.getElementById("reload"),
    showArchive: document.getElementById("showArchive"),
    language: document.getElementById("language")
  };

  function resolveLang() {
    var query = new URLSearchParams(window.location.search).get("lang");
    if (query === "zh" || query === "en") {
      localStorage.setItem("skillChainDashboardLang", query);
      return query;
    }
    return localStorage.getItem("skillChainDashboardLang") || "zh";
  }

  function resolveView() {
    var params = new URLSearchParams(window.location.search);
    var query = params.get("view");
    if (VALID_VIEWS.indexOf(query) >= 0) return query;
    if (params.get("skill")) return "skills";
    if (params.get("assistant")) return "assistants";
    if (params.get("focus") === "watch") return "dedupe";
    if (params.get("focus") === "traces") return "traces";
    return "overview";
  }

  function t(key) {
    var table = i18n[lang] || i18n.en || {};
    return table[key] || (i18n.en && i18n.en[key]) || key;
  }

  function fillTemplate(value, params) {
    return String(value || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
      return params && params[name] !== undefined ? params[name] : match;
    });
  }

  function mergeI18nJson(json) {
    Object.keys(json || {}).forEach(function (locale) {
      i18n[locale] = Object.assign({}, i18n[locale] || {}, json[locale] || {});
    });
    window.__SKILL_CHAIN_I18N__ = i18n;
  }

  function loadI18nJson() {
    return fetch("./i18n.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(function (err) { return loadTextViaFrame("./i18n.json", err).then(JSON.parse); })
      .then(mergeI18nJson)
      .catch(function () {});
  }

  var zhSkillText = {
    "pr-review-guard": {
      purpose: "在打开、更新或准备 PR 前做本地复核，检查 diff 质量、测试证据、风险文件、摘要和目标分支，避免把错误内容推到错误仓库。",
      effect: "把 PR 前的隐性风险转成可检查清单，给出是否可以继续 push/PR 的结论。",
      why_independent: "它专门守 PR 前的质量和目标边界，和普通代码审查不同，是远端动作前的门禁 skill。",
      optimization: "下一步可把检查结果写成结构化字段，供 dashboard 直接显示 PR readiness。",
      sop: ["确认 PR 目标仓库和分支", "检查 diff 是否聚焦且可解释", "核对测试和验证证据", "扫描高风险路径与敏感内容", "给出继续、阻塞或补证据结论"]
    },
    plan: {
      purpose: "在动手写代码前，把宽泛、模糊、高风险或跨模块需求整理成可执行计划。适合用于方案评审、范围界定、共识判断、验收标准、风险边界和验证步骤。",
      effect: "把模糊请求转成结构化规格、执行计划和可交给 AI 的 goal packet。",
      why_independent: "它是多个 skill-chain 的可复用规划步骤，职责是先澄清目标和边界，而不是直接改代码。",
      optimization: "下一步可把 plan 输出固定成 Goal / Context / Constraints / Done criteria，方便 dashboard 直接生成任务卡。",
      sop: [
        "先收集需求，不急着写代码",
        "把明确请求转成直接执行计划",
        "评审已有计划，找风险和缺口",
        "高风险工作给出多方案对比",
        "补齐验收标准、验证命令、边界和回滚逻辑"
      ]
    },
    "test-harness": {
      purpose: "在实现或修改代码时，先找最小相关测试并运行，基于失败信息推进，再逐步扩大验证范围。",
      effect: "让改动有清晰的测试证据，避免只靠肉眼或主观判断宣布完成。",
      why_independent: "它聚焦测试选择、运行和解释，是执行链路里的验证基础设施，不直接承担需求规划。",
      optimization: "下一步可把最小测试命令和广域验证命令写回 trace，供进度卡显示。",
      sop: ["识别最小相关测试", "先运行并读懂失败", "按失败做最小修复", "重复直到局部变绿", "风险变大时扩大验证范围"]
    },
    analyze: {
      purpose: "只读分析架构、行为、因果、回归、影响或取舍，用仓库证据回答“为什么”和“怎么关联”。",
      effect: "输出带文件证据和推理边界的结论，帮助后续计划或实现少走弯路。",
      why_independent: "它的职责是读和解释，不写代码；和执行型 skill 分开能保护只读边界。",
      optimization: "下一步可把 evidence / inference / unknowns 结构输出给 dashboard 做可视化。",
      sop: ["先复述问题", "搜索最小证据集", "读取关键文件", "区分证据、推理和未知", "给出按可信度排序的结论"]
    },
    "goal-driven-execution": {
      purpose: "按结构化 goal packet 执行一个有边界的任务，遵守允许/禁止路径、验证命令和完成标准。",
      effect: "把聊天里的任务变成可重复、可审计、可交接的执行单元。",
      why_independent: "它是执行协议本身，和具体 coding / review / QA skill 解耦。",
      optimization: "下一步应写入 goal_run_id 和阶段 trace，让 dashboard 能监控执行进度。",
      sop: ["读取 goal packet", "确认允许和禁止范围", "先跑验收或最小验证", "小步实现并复跑", "交付改动、验证和剩余风险"]
    },
    "auto-merge-action": {
      purpose: "只在 release-readiness 通过、远端 CI 对准 exact head SHA 且用户明确批准后，触发 GitHub auto-merge。",
      effect: "把自动合并变成显式审批后的末端动作，避免本地工具误触远端合并。",
      why_independent: "它涉及远端合并，是高风险动作，必须从 readiness 检查中拆出来单独受控。",
      optimization: "下一步可把 dry-run 结果和 approval 状态结构化展示在 release 面板。",
      sop: ["确认 release-readiness 已通过", "运行 auto-merge dry-run", "核对 head SHA 和 required CI", "等待用户明确批准", "批准后才执行远端动作"]
    },
    "pr-push-guard": {
      purpose: "push、建 PR 或发布前验证目标安全、分支保护、禁推路径和安全门禁。",
      effect: "在远端动作前拦住错仓库、错分支、敏感文件和未分类本地工件。",
      why_independent: "它专管 push/PR 前的安全边界，不负责代码质量审查细节。",
      optimization: "下一步可把 guard 输出转成 pass/block/reason 字段进入 dashboard。",
      sop: ["确认远端和目标分支", "运行 security check", "运行 review push guard", "检查禁推路径", "给出是否允许远端动作结论"]
    },
    "chain-router": {
      purpose: "根据用户意图和项目身份选择合适的 skill-chain，并写入运行状态。",
      effect: "把自然语言需求路由到可执行治理链路，形成后续 dashboard 可读的 state。",
      why_independent: "它是链路选择入口，必须保持只读判断和状态初始化职责清晰。",
      optimization: "下一步可输出更明确的 route rationale，帮助推荐面板解释为什么选某条 chain。",
      sop: ["读取 intent 和项目身份", "匹配 registry 中的 chain", "检查禁用动作和 write_permission", "写入 runtime state", "返回机器可读路由结果"]
    },
    "grouped-commit-cycle": {
      purpose: "把混杂 dirty tree 按关注点切成安全提交组，并分别跑门禁和写 trace。",
      effect: "避免把行为变更、i18n、生成物、运行产物混成一个不可审的 commit。",
      why_independent: "它是 commit 治理链路，职责横跨分类、验证和提交边界，和普通实现 skill 不同。",
      optimization: "下一步可把每组 dirty group 状态输出给 dashboard 做进度分栏。",
      sop: ["分类 dirty tree", "识别 forbidden/generated/private 路径", "按关注点拆组", "每组运行对应 gate", "生成分组 commit 和 trace"]
    },
    "acceptance-gate-development": {
      purpose: "把需求先转成可运行验收门，再围绕红灯迭代实现，直到门禁变绿。",
      effect: "用可执行证据约束实现，减少“看起来完成但不可验证”的改动。",
      why_independent: "它是测试优先的开发协议，适合行为变更，不应和普通测试运行或代码审查合并。",
      optimization: "下一步可把 acceptance gate 的红/绿状态写进 state.raw.gates。",
      sop: ["把需求转成可观察行为", "先写或更新验收门", "确认旧行为失败", "做最小实现", "反复运行直到验收通过"]
    },
    "release-readiness-runner": {
      purpose: "在 push、PR 更新或合并资格判断前，按顺序核验本地门禁、远端审批点、分支保护和 exact head SHA 的远端 CI。",
      effect: "给发布/合并前状态一个可审计结论，并在 auto-merge 前停止。",
      why_independent: "它聚焦发布就绪度，不直接执行合并；和 auto-merge-action 分开能保留人工批准边界。",
      optimization: "下一步可把 local gates、push gate、branch protection、remote CI 分阶段写入 dashboard。",
      sop: ["确认本地门禁已绿", "检查 push 前审批点", "核对 PR 目标和分支保护", "确认远端 CI 绑定 exact head SHA", "停止在 auto-merge 前等待批准"]
    }
  };

  var zhTerms = {
    planning: "规划",
    analysis: "分析",
    quality: "质量",
    orchestration: "调度",
    delegation: "委派",
    knowledge: "知识",
    health: "健康",
    gate: "门禁",
    cleanup: "清理",
    "goal-routing": "目标路由",
    "read-only-analysis": "只读分析",
    "release-gates": "发布门禁",
    "visual-qa": "视觉 QA",
    "workspace-ops": "工作区运维",
    utility: "工具箱",
    "utility/toolbox": "工具箱",
    duplicate: "重复",
    important: "重要",
    merge_candidate: "可合并候选",
    keep: "保留",
    split_candidate: "可拆分候选",
    retire_candidate: "可退役候选",
    pass: "通过",
    weak: "偏弱",
    fail: "失败",
    ready: "可用",
    cooldown: "冷却",
    fatal: "致命",
    unavailable: "未注册",
    unknown: "未知",
    true: "是",
    false: "否"
  };

  var zhValueTerms = {
    gate: {
      acceptance_red: "验收红灯",
      task_packet: "任务包",
      release_readiness: "发布就绪",
      characterization: "特征化验证",
      harness_artifact: "Harness 工件",
      local_three_gates_green: "本地三门禁已绿",
      none: "无"
    },
    risk: {
      unknown: "未知",
      low: "低",
      medium: "中",
      high: "高"
    },
    effect: {
      unknown: "未知",
      real: "真实有效",
      cosmetic: "表面变化",
      regression: "回归",
      none: "无"
    },
    role: {
      executor: "执行者",
      router: "路由",
      reviewer: "复审",
      classifier: "分类器",
      validator: "验证器",
      local_gates: "本地门禁",
      dry_run: "Dry-run",
      orchestrator: "编排",
      artifact_writer: "工件写入",
      parent_controller: "父控",
      approval: "审批"
    },
    traceKind: {
      issue: "问题",
      session: "会话",
      goal_status: "Goal 状态"
    },
    goalStatus: {
      queued: "排队中",
      accepted: "已接手",
      running: "运行中",
      blocked: "阻塞",
      done: "已完成",
      failed: "失败",
      cancelled: "已取消"
    }
  };

  function localTerm(value) {
    var raw = text(value, "");
    if (lang !== "zh") return raw;
    return zhTerms[raw] || raw;
  }

  function skillLocalized(skill, field) {
    if (lang !== "zh" || !skill) return skill && skill[field];
    var item = zhSkillText[skill.id];
    return item && item[field] !== undefined ? item[field] : skill[field];
  }

  function skillSopSummary(skill) {
    if (lang === "zh" && skill && zhSkillText[skill.id] && zhSkillText[skill.id].sop) {
      return zhSkillText[skill.id].sop;
    }
    return skill && skill.sop && skill.sop.summary;
  }

  function text(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "object") {
      if (value.name || value.status) {
        return [value.name, value.status].filter(Boolean).join(": ");
      }
      try { return JSON.stringify(value).slice(0, 160); }
      catch (err) { return fallback; }
    }
    return String(value);
  }

  function compact(value, fallback, max) {
    var raw = text(value, fallback);
    var limit = max || 72;
    if (raw.length <= limit) return raw;
    return raw.slice(0, limit - 1) + "…";
  }

  function stateLabel(value) {
    return t("state." + value) || text(value, t("unknown"));
  }

  function classificationLabel(value) {
    return t("classification." + value) || text(value, t("unclassified"));
  }

  function localValue(kind, value) {
    var raw = text(value, "");
    if (lang !== "zh") return raw;
    return (zhValueTerms[kind] && zhValueTerms[kind][raw]) || localTerm(raw);
  }

  function displayGate(value) {
    if (value && typeof value === "object") {
      return [localValue("gate", value.name || value.gate || ""), localValue("gate", value.status || "")].filter(Boolean).join(": ") || text(value, t("none"));
    }
    return localValue("gate", value || "none");
  }

  function node(tag, className, content) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  }

  function listItems(values, emptyText) {
    var list = node("ul", "detail-list");
    (values || []).slice(0, 8).forEach(function (value) {
      list.appendChild(node("li", "", text(value, "")));
    });
    if (!list.children.length) list.appendChild(node("li", "muted", emptyText || t("none")));
    return list;
  }

  function updateSkillUrl(skillId) {
    var url = new URL(window.location.href);
    if (skillId) url.searchParams.set("skill", skillId);
    else url.searchParams.delete("skill");
    window.history.pushState({}, "", url.toString());
  }

  function updateViewUrl(view) {
    var url = new URL(window.location.href);
    url.searchParams.set("view", view || "overview"); // keep view=overview explicit for shareable links.
    window.history.pushState({}, "", url.toString());
  }

  function setView(view) {
    currentView = view || "overview";
    updateViewUrl(currentView);
    applyView();
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  function applyView() {
    var sections = {
      overview: [els.advisoryView, document.querySelector(".grid")],
      assistants: [els.assistantView],
      traces: [els.traceExplorerView],
      skills: [els.skillLibraryView],
      dedupe: [els.dedupeView],
      repoEvolver: [els.repoEvolverView],
      dispatch: [els.dispatchView]
    };
    [els.assistantView, els.advisoryView, els.traceExplorerView, els.skillLibraryView, els.dedupeView, els.repoEvolverView, els.dispatchView, document.querySelector(".grid")].forEach(function (section) {
      if (section) section.hidden = true;
    });
    (sections[currentView] || sections.overview).forEach(function (section) {
      if (section) section.hidden = false;
    });
    if (els.viewNav) {
      Array.prototype.forEach.call(els.viewNav.querySelectorAll("button"), function (button) {
        var active = button.getAttribute("data-view") === currentView;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        if (active) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
    }
  }

  function openSkillDrawer(skillId) {
    lastDrawerFocus = document.activeElement;
    selectedSkillId = skillId;
    skillDrawerOpen = Boolean(skillId);
    updateSkillUrl(skillId);
    renderSkillLibrary();
  }

  function updateAssistantUrl(assistantId) {
    var url = new URL(window.location.href);
    if (assistantId) url.searchParams.set("assistant", assistantId);
    else url.searchParams.delete("assistant");
    window.history.pushState({}, "", url.toString());
  }

  function openAssistantDrawer(assistantId) {
    lastDrawerFocus = document.activeElement;
    selectedAssistantId = assistantId;
    assistantDrawerOpen = Boolean(assistantId);
    updateAssistantUrl(assistantId);
    renderAssistants();
  }

  function closeAssistantDrawer() {
    selectedAssistantId = "";
    assistantDrawerOpen = false;
    updateAssistantUrl("");
    renderAssistants();
    restoreDrawerFocus();
  }

  function closeSkillDrawer() {
    selectedSkillId = "";
    skillDrawerOpen = false;
    updateSkillUrl("");
    renderSkillLibrary();
    restoreDrawerFocus();
  }

  function restoreDrawerFocus() {
    var target = lastDrawerFocus;
    lastDrawerFocus = null;
    if (target && typeof target.focus === "function" && document.contains(target)) {
      window.setTimeout(function () { target.focus(); }, 0);
    }
  }

  function focusableIn(root) {
    return Array.prototype.slice.call(root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  }

  function wireDialogKeyboard(panel, closeFn) {
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.tabIndex = -1;
    panel.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeFn();
        return;
      }
      if (event.key !== "Tab") return;
      var items = focusableIn(panel);
      if (!items.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    window.setTimeout(function () {
      var first = focusableIn(panel)[0];
      (first || panel).focus();
    }, 0);
  }

  function toggleCategoryFilter(category) {
    var index = skillFilter.categories.indexOf(category);
    if (index >= 0) skillFilter.categories.splice(index, 1);
    else skillFilter.categories.push(category);
  }

  function activeState(project) {
    var states = project && Array.isArray(project.states) ? project.states : [];
    return states[0] || {};
  }

  function chainMap() {
    var map = {};
    (data && data.chains || []).forEach(function (chain) {
      if (chain && chain.name) map[chain.name] = chain;
    });
    return map;
  }

  function assistantById() {
    var map = {};
    (data && data.assistants || []).forEach(function (assistant) {
      if (assistant.id) map[assistant.id] = assistant;
      if (assistant.name) map[String(assistant.name).toLowerCase().replace(/\s+/g, "-")] = assistant;
    });
    return map;
  }

  function capabilityFor(assistant, chainName) {
    var matrix = assistant && (assistant.support_matrix || assistant.support || []);
    return matrix.find(function (item) { return item.chain === chainName; }) || null;
  }

  function gateName(gate) {
    if (!gate) return "";
    if (typeof gate === "string") return gate;
    return text(gate.name || gate.gate || gate.id || gate.current, "");
  }

  function gateStatus(gate) {
    if (!gate || typeof gate === "string") return "";
    return text(gate.status || gate.result || "", "").toLowerCase();
  }

  function rawGateEntries(state) {
    var gates = [];
    var raw = state.raw || {};
    ["before", "after"].forEach(function (key) {
      var list = raw.gates && raw.gates[key];
      if (Array.isArray(list)) gates = gates.concat(list);
    });
    return gates;
  }

  function expectedRedGatePassed(requiredGate, state) {
    var required = String(requiredGate || "").toLowerCase();
    if (required.indexOf("red_acceptance_gate") < 0) return false;
    var raw = state.raw || {};
    return rawGateEntries(state).some(function (gate) {
      var name = gateName(gate).toLowerCase();
      var status = gateStatus(gate);
      return status === "red" && (
        name === required ||
        name.indexOf("acceptance") >= 0 ||
        raw.gate_type === "acceptance_red"
      );
    });
  }

  function requiredGatePassed(requiredGate, state) {
    var required = String(requiredGate || "").toLowerCase();
    if (!required) return false;
    if (expectedRedGatePassed(requiredGate, state)) return true;
    return rawGateEntries(state).some(function (gate) {
      var name = gateName(gate).toLowerCase();
      var status = gateStatus(gate);
      if (status !== "green" && status !== "passed" && status !== "pass") return false;
      if (name === required) return true;
      if (required.indexOf("green_acceptance_gate") >= 0 && name.indexOf("acceptance") >= 0) return true;
      return false;
    });
  }

  function passedGates(state, required) {
    if (Array.isArray(required) && required.length) {
      return required.filter(function (gate) { return requiredGatePassed(gate, state); });
    }
    var gates = [];
    if (state.gate && gateStatus(state.gate) === "green") gates.push(gateName(state.gate));
    rawGateEntries(state).forEach(function (gate) {
      var status = gateStatus(gate);
      if (status === "green" || status === "passed" || status === "pass") gates.push(gateName(gate));
    });
    return gates;
  }

  function uniqueCount(list, keyFn) {
    var seen = {};
    list.forEach(function (item) {
      var key = keyFn(item);
      if (key) seen[key] = true;
    });
    return Object.keys(seen).length;
  }

  function projectStatusCounts(projects) {
    var counts = {};
    projects.forEach(function (project) {
      var state = activeState(project).state || "unknown";
      counts[state] = (counts[state] || 0) + 1;
    });
    return counts;
  }

  function stepTitle(step) {
    if (typeof step === "string") return step;
    if (!step || typeof step !== "object") return t("unknownStep");
    return text(step.skill || step.stage || step.action || step.command, t("unknownStep"));
  }

  function stepMeta(step) {
    if (!step || typeof step !== "object") return "";
    var parts = [];
    if (step.role) parts.push(localValue("role", step.role));
    if (Array.isArray(step.skills)) parts.push(t("stepSkills") + ": " + step.skills.join(", "));
    if (Array.isArray(step.scripts)) parts.push(t("stepScripts") + ": " + step.scripts.join(", "));
    if (step.command && step.stage) parts.push(step.command);
    if (step.approval) parts.push(t("stepApproval") + ": " + step.approval);
    return parts.join(" | ");
  }

  function projectKey(project, state) {
    return text(project.project, "unknown") + "::" + text(state.file, "");
  }

  function gateText(state) {
    var raw = state && state.raw || {};
    return [
      state && state.gate,
      raw.gate_type,
      raw.gates && raw.gates.current,
      raw.remote_gates && raw.remote_gates.remote_ci_status
    ].map(function (value) { return text(value, ""); }).join(" ").toLowerCase();
  }

  function hasRiskGate(state) {
    var raw = state && state.raw || {};
    var gates = [];
    ["before", "after"].forEach(function (key) {
      var list = raw.gates && raw.gates[key];
      if (Array.isArray(list)) gates = gates.concat(list);
    });
    return gates.some(function (gate) {
      var status = String(gate && gate.status || "").toLowerCase();
      return status === "red" || status === "failed" || status === "unknown";
    });
  }

  function traceMatchesProject(trace, projectName) {
    var target = String(projectName || "").toLowerCase();
    if (!target) return false;
    var traceProject = String(trace && trace.project || "").toLowerCase();
    if (traceProject === target || traceProject.indexOf(target + " ") === 0 || traceProject.indexOf(target + "/") === 0) return true;
    return String(trace && trace.msg || "").toLowerCase().indexOf(target) >= 0;
  }

  function recentTraceSignal(project) {
    var traces = (data && data.traces || []).slice().sort(function (a, b) {
      return text(b.ts, "").localeCompare(text(a.ts, ""));
    });
    var projectName = text(project && project.project, "");
    var matched = traces.filter(function (trace) {
      return (trace.kind === "issue" || trace.kind === "session") && traceMatchesProject(trace, projectName);
    }).slice(0, 3);
    var score = matched.reduce(function (sum, trace) {
      return sum + (trace.kind === "issue" ? 6 : 3);
    }, 0);
    return { count: matched.length, score: Math.min(score, 10) };
  }

  function scoreProjectPriority(project) {
    var state = activeState(project);
    var score = 0;
    var reasons = [];
    function add(points, key) {
      if (!points) return;
      score += points;
      reasons.push({ key: key, points: points });
    }

    var stateWeight = {
      pending: 34,
      gate_ready: 40,
      implementing: 37,
      local_green: 17,
      broad_green: 14,
      reviewed: 8,
      push_ready: -8
    };
    add(stateWeight[state.state] === undefined ? 18 : stateWeight[state.state], "reasonStateBlocker");

    var gates = gateText(state);
    if (gates.indexOf("acceptance_red") >= 0 || gates.indexOf("acceptance") >= 0 && gates.indexOf("red") >= 0) add(26, "reasonAcceptanceRed");
    if (gates.indexOf("task_packet") >= 0) add(22, "reasonTaskPacket");
    if (hasRiskGate(state) || gates.indexOf("failed") >= 0 || gates.indexOf("unknown") >= 0) add(16, "reasonGateRisk");

    var classificationWeight = {
      keep: 16,
      review: 6,
      archive_candidate: -12
    };
    add(classificationWeight[state.classification] || 0, "reasonClassification");

    var chainWeight = {
      "feature-pr": 20,
      "refactor-pr": 16,
      "grouped-commit-cycle": 15,
      "release-readiness": 12,
      "dirty-tree-slice": 10,
      "harness-bootstrap": 8,
      "auto-merge-action": 2
    };
    add(chainWeight[state.chain] || 4, "reasonChainWeight");

    var trace = recentTraceSignal(project);
    if (trace.score) add(trace.score, "reasonRecentTrace");
    if (state.state === "push_ready") add(-12, "reasonPushReadyLower");

    return {
      project: project,
      state: state,
      key: projectKey(project, state),
      score: Math.max(0, Math.round(score)),
      reasons: reasons.sort(function (a, b) { return Math.abs(b.points) - Math.abs(a.points); }).slice(0, 5)
    };
  }

  function priorityRankedProjects(projects) {
    return (projects || visibleProjects()).map(scoreProjectPriority).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return text(a.project.project, "").localeCompare(text(b.project.project, ""));
    });
  }

  function dispatchFocusCandidates() {
    return priorityRankedProjects().slice(0, 5);
  }

  function ensureDefaultSelection() {
    var projects = visibleProjects();
    if (!projects.length) {
      selectedKey = "";
      return;
    }
    if (selectedKey && projects.some(function (project) { return projectKey(project, activeState(project)) === selectedKey; })) return;
    var top = priorityRankedProjects(projects)[0];
    selectedKey = top ? top.key : projectKey(projects[0], activeState(projects[0]));
  }

  function visibleProjects() {
    var stateOrder = {
      pending: 0,
      gate_ready: 1,
      implementing: 2,
      local_green: 3,
      broad_green: 4,
      reviewed: 5,
      push_ready: 9
    };
    return (data && data.projects || []).filter(function (project) {
      var state = activeState(project);
      return showArchive || state.classification !== "archive_candidate";
    }).slice().sort(function (a, b) {
      var left = activeState(a);
      var right = activeState(b);
      var leftRank = stateOrder[left.state] === undefined ? 8 : stateOrder[left.state];
      var rightRank = stateOrder[right.state] === undefined ? 8 : stateOrder[right.state];
      if (leftRank !== rightRank) return leftRank - rightRank;
      return text(a.project, "").localeCompare(text(b.project, ""));
    });
  }

  function stepAssistant(chain, step) {
    var hint = chain && chain.executor_hint || {};
    if (!hint || !step || typeof step !== "object") return "";
    var title = stepTitle(step);
    var role = String(step.role || step.stage || step.action || step.command || step.skill || "");
    var haystack = (title + " " + role).toLowerCase();
    if (hint.approval && (step.approval || haystack.indexOf("push-action") >= 0 || haystack.indexOf("auto-merge") >= 0)) return hint.approval;
    if (hint.action && (step.action || haystack.indexOf("auto-merge") >= 0)) return hint.action;
    if (hint.dry_run && haystack.indexOf("precondition") >= 0) return hint.dry_run;
    if (hint.local_gates && (haystack.indexOf("local") >= 0 || haystack.indexOf("push-gate") >= 0)) return hint.local_gates;
    if (hint.remote_review && (haystack.indexOf("remote") >= 0 || haystack.indexOf("branch-protection") >= 0 || haystack.indexOf("pr-create") >= 0)) return hint.remote_review;
    if (hint.classifier && haystack.indexOf("classifier") >= 0) return hint.classifier;
    if (hint.validator && haystack.indexOf("validation") >= 0) return hint.validator;
    if (hint.reviewer && (haystack.indexOf("review") >= 0 || haystack.indexOf("guard") >= 0 || haystack.indexOf("audit") >= 0)) return hint.reviewer;
    if (hint.executor && (haystack.indexOf("writer") >= 0 || haystack.indexOf("slicer") >= 0 || haystack.indexOf("test") >= 0 || haystack.indexOf("implementation") >= 0)) return hint.executor;
    if (hint.router && (haystack.indexOf("router") >= 0 || haystack.indexOf("analyze") >= 0 || haystack.indexOf("plan") >= 0)) return hint.router;
    if (hint.orchestrator && haystack.indexOf("orchestrator") >= 0) return hint.orchestrator;
    if (hint.artifact_writer && (haystack.indexOf("planning") >= 0 || haystack.indexOf("discovery") >= 0 || haystack.indexOf("read-only") >= 0)) return hint.artifact_writer;
    return hint.executor || hint.router || hint.orchestrator || hint.classifier || "";
  }

  function assistantBadge(value) {
    if (!value) return null;
    var key = String(value).toLowerCase();
    return node("span", "ai-badge ai-" + key.replace(/[^a-z0-9]+/g, "-"), assistantLabels[key] || value);
  }

  function assistantHintToId(value, role) {
    var hint = String(value || "").toLowerCase();
    if (hint === "claude") return "claude-code";
    if (hint === "codex") return "codex-cli";
    if (hint === "opencode" || hint === "open_code") return "opencode";
    if (hint === "claude_or_codex") return role === "executor" || role === "artifact_writer" ? "codex-cli" : "claude-code";
    if (hint === "user" || hint === "user_approved") return "claude-code";
    return "";
  }

  function advisoryRole(chainName, state) {
    if (chainName === "feature-pr" || chainName === "refactor-pr") return "executor";
    if (chainName === "dirty-tree-slice") return "executor";
    if (chainName === "grouped-commit-cycle") return state.state === "pending" ? "classifier" : "validator";
    if (chainName === "release-readiness") return "local_gates";
    if (chainName === "auto-merge-action") return "dry_run";
    if (chainName === "harness-bootstrap") return state.state === "pending" ? "orchestrator" : "artifact_writer";
    return "executor";
  }

  function orderedCandidates(preferredId, role) {
    var map = assistantById();
    var ids = [];
    function add(id) {
      if (id && ids.indexOf(id) < 0) ids.push(id);
    }
    add(preferredId);
    var preferred = map[preferredId];
    (preferred && preferred.fallbacks || []).forEach(add);
    if (role === "router" || role === "reviewer" || role === "orchestrator" || role === "dry_run") add("claude-code");
    if (role === "executor" || role === "classifier" || role === "validator" || role === "local_gates" || role === "artifact_writer") {
      add("codex-cli");
      add("opencode");
      add("claude-code");
    }
    add("claude-code");
    return ids.map(function (id) { return map[id]; }).filter(Boolean);
  }

  function recommendation(project, state) {
    var chain = chainMap()[state.chain];
    if (!project || !chain) return null;
    var role = advisoryRole(state.chain, state);
    var hint = chain.executor_hint || {};
    var preferredId = assistantHintToId(hint[role] || hint.executor || hint.router || hint.orchestrator || hint.classifier, role);
    var candidates = orderedCandidates(preferredId, role);
    var selected = candidates.find(function (assistant) {
      var cap = capabilityFor(assistant, state.chain);
      return assistant.supports_skill_chain !== false && cap && (cap.ok === true || cap.coverage > 0);
    }) || null;
    if (!selected) return null;
    var cap = capabilityFor(selected, state.chain) || {};
    return {
      project: project.project,
      chain: state.chain,
      current_state: state.state,
      next_state: nextState(state.state),
      gate: state.gate,
      role: role,
      assistant: selected,
      capability: cap,
      completion: completionStatus(state, chain),
      goal_run: goalRunFor(project.project, state),
      rationale: cap.reason || selected.rationale || t("defaultRationale"),
      draft: goalPacketDraft(project, state, chain, selected, role)
    };
  }

  function goalRunFor(projectName, state) {
    var goalPacket = state && state.raw && state.raw.goal_packet || {};
    var packetId = text(goalPacket.id, "");
    var project = text(projectName, "");
    var chain = text(state && state.chain, "");
    var runs = (data && data.goal_runs || []).filter(function (run) {
      if (packetId && run.goal_packet_id === packetId) return true;
      return run.project === project && run.chain === chain;
    }).sort(function (a, b) {
      return text(b.updated_at, "").localeCompare(text(a.updated_at, ""));
    });
    return runs[0] || null;
  }

  function goalStatusLabel(status) {
    var value = text(status, "");
    if (!value) return t("goalNotStarted");
    return localValue("goalStatus", value) || value;
  }

  function goalLifecycle(run) {
    if (!run) {
      return {
        status: "not_started",
        label: t("goalNotStarted"),
        text: t("goalNoEvents")
      };
    }
    return {
      status: run.status,
      label: goalStatusLabel(run.status),
      text: [
        text(run.agent, t("unknown")),
        text(run.goal_run_id, ""),
        text(run.updated_at, "")
      ].filter(Boolean).join(" | ")
    };
  }

  function completionStatus(state, chain) {
    var states = data && data.state_enum || [];
    var currentIndex = Math.max(0, states.indexOf(state.state));
    var finalIndex = Math.max(1, states.length - 1);
    var stateProgress = Math.round((currentIndex / finalIndex) * 100);
    var required = chain && chain.required_gates || [];
    var passed = passedGates(state, required);
    var gateProgress = required.length ? Math.round((passed.length / required.length) * 100) : stateProgress;
    var percent = Math.max(0, Math.min(100, Math.round((stateProgress * 0.65) + (gateProgress * 0.35))));
    var complete = state.state === "push_ready" || (state.state === "reviewed" && required.length > 0 && passed.length >= required.length);
    var allRequiredPassed = required.length > 0 && passed.length >= required.length;
    var reviewedIndex = states.indexOf("reviewed");
    var stateStale = allRequiredPassed && reviewedIndex >= 0 && currentIndex < reviewedIndex;
    var blocked = state.state === "pending" || hasRiskGate(state) && !expectedRedGatePassed("red_acceptance_gate_before_implementation", state);
    return {
      complete: complete,
      blocked: blocked,
      state_stale: stateStale,
      percent: complete ? 100 : percent,
      passed_gates: passed.length,
      required_gates: required.length,
      expected_red_gate_passed: expectedRedGatePassed("red_acceptance_gate_before_implementation", state),
      source_key: "progressSnapshotSource",
      updated_at: text(data && data.generated_at, ""),
      label_key: complete ? "taskComplete" : stateStale ? "taskStateStale" : blocked ? "taskNeedsWork" : "taskInProgress"
    };
  }

  function nextState(value) {
    var states = data && data.state_enum || [];
    var index = states.indexOf(value);
    return index >= 0 && index < states.length - 1 ? states[index + 1] : value || "pending";
  }

  function goalPacketDraft(project, state, chain, assistant, role) {
    var gates = (chain.required_gates || []).slice(0, 6);
    var forbidden = (assistant.forbidden || []).concat(chain.forbidden_actions || []).slice(0, 10);
    return [
      "/goal 完成 " + text(project.project, "project") + " " + text(state.chain, "skill-chain") + " 下一步",
      "",
      "目标：",
      "把 " + text(project.project, "project") + " 的 " + text(state.chain, "chain") + " 从 " + stateLabel(state.state) + " 推进到 " + stateLabel(nextState(state.state)) + "，角色：" + localValue("role", role) + "。",
      "",
      "上下文：",
      "- 项目：" + text(project.project, "unknown"),
      "- Chain：" + text(state.chain, "unknown"),
      "- 当前状态：" + stateLabel(state.state),
      "- Gate：" + displayGate(state.gate),
      "- State file：" + text(state.file, "unknown"),
      "- 推荐 AI：" + text(assistant.name, "AI"),
      "",
      "允许修改：",
      "- 仅按后续具体任务包收窄后的目标项目文件修改。",
      "- 优先复用现有 skill-chain registry、state schema、chain-gates。",
      "",
      "禁止修改：",
      "- 不写 dashboard state，不自动 push/PR/deploy。",
      "- " + (forbidden.length ? forbidden.join(", ") : "不做远端动作。"),
      "",
      "验证：",
      "- " + (gates.length ? gates.join("\n- ") : "运行目标项目最小本地 gate，并记录证据。"),
      "",
      "完成标准：",
      "- 本地验证通过，状态推进证据清楚，剩余风险写明。",
      "",
      "交付：",
      "- 报告改动文件、验证结果、剩余风险和建议下一步。"
    ].join("\n");
  }

  function assistantRole(assistant) {
    var map = {
      "Claude Code": t("roleClaude"),
      "Codex CLI": t("roleCodex"),
      "OpenCode": t("roleOpenCode"),
      "Copilot": t("roleCopilot")
    };
    return map[assistant.name] || text(assistant.role, t("unknownRole"));
  }

  function assistantOpenHint(assistant) {
    var map = {
      "Claude Code": t("openHintClaude"),
      "Codex CLI": t("openHintCodex"),
      "OpenCode": t("openHintOpenCode"),
      "Copilot": t("openHintCopilot")
    };
    return map[assistant.name] || text(assistant.open_hint, "");
  }

  function renderProjects() {
    var projects = visibleProjects();
    els.projectList.replaceChildren();
    els.projectCount.textContent = String(projects.length);
    if (!projects.length) {
      els.projectList.appendChild(node("div", "empty", t("noProjects")));
      return;
    }
    ensureDefaultSelection();
    projects.forEach(function (project) {
      var state = activeState(project);
      var key = projectKey(project, state);
      var card = node("button", "card" + (key === selectedKey ? " selected" : ""));
      card.type = "button";
      card.setAttribute("data-state", state.state || "");
      card.addEventListener("click", function () {
        selectedKey = key;
        render();
      });
      var title = node("div", "card-title");
      title.appendChild(node("strong", "name", text(project.project, "unknown")));
      title.appendChild(node("span", "badge " + (stateClass[state.state] || "state-risk"), stateLabel(state.state)));
      card.appendChild(title);
      card.appendChild(node("div", "sub", text(state.chain, t("noChain")) + " | " + classificationLabel(state.classification)));
      card.appendChild(node("div", "mini", t("gate") + " " + compact(displayGate(state.gate), t("none"), 76)));
      els.projectList.appendChild(card);
    });
  }

  function selectedProject() {
    return visibleProjects().find(function (project) {
      return projectKey(project, activeState(project)) === selectedKey;
    });
  }

  function renderChain(project, state) {
    var chain = chainMap()[state.chain];
    els.chainName.textContent = text(state.chain, "None");
    if (state.chain && chain) {
      els.chainName.setAttribute("data-chain-name", state.chain);
      els.chainName.setAttribute("role", "button");
      els.chainName.setAttribute("tabindex", "0");
      els.chainName.style.cursor = "pointer";
      els.chainName.title = t("openChainDetail");
    } else {
      els.chainName.removeAttribute("data-chain-name");
    }
    els.chainView.replaceChildren();
    if (!chain) {
      els.chainView.appendChild(node("div", "empty", t("noChainDefinition")));
      return;
    }
    var body = node("div", "chain-body");
    (chain.steps || []).forEach(function (step) {
      var row = node("div", "step");
      var title = node("div", "step-title");
      title.appendChild(node("strong", "", stepTitle(step)));
      var right = node("span", "step-right");
      var badge = assistantBadge(stepAssistant(chain, step));
      if (badge) right.appendChild(badge);
      right.appendChild(node("span", "step-index", "#" + text(step && step.step, "?")));
      title.appendChild(right);
      row.appendChild(title);
      var meta = stepMeta(step);
      if (meta) row.appendChild(node("div", "sub", meta));
      body.appendChild(row);
    });
    var passed = passedGates(state);
    var gates = node("div", "gates");
    (chain.required_gates || []).forEach(function (gate) {
      gates.appendChild(node("span", "gate" + (passed.indexOf(gate) >= 0 ? " pass" : ""), displayGate(gate)));
    });
    if (!(chain.required_gates || []).length) gates.appendChild(node("span", "gate", t("noRequiredGates")));
    body.appendChild(gates);
    els.chainView.appendChild(body);
  }

  function renderState(state) {
    var states = data && data.state_enum || [];
    var current = states.indexOf(state.state);
    els.stateName.textContent = stateLabel(state.state);
    els.stateView.replaceChildren();
    var body = node("div", "state-body");
    var track = node("div", "states");
    states.forEach(function (name, index) {
      var cls = "node" + (index < current ? " done" : "") + (index === current ? " current" : "");
      var stateNode = node("div", cls, stateLabel(name));
      stateNode.title = name;
      track.appendChild(stateNode);
    });
    body.appendChild(track);
    var facts = node("div", "facts");
    facts.appendChild(node("span", "fact", t("gate") + ": " + compact(displayGate(state.gate), t("none"), 86)));
    facts.appendChild(node("span", "fact", t("risk") + ": " + localValue("risk", state.raw && state.raw.remaining_risk || "unknown")));
    facts.appendChild(node("span", "fact", t("effect") + ": " + localValue("effect", state.raw && state.raw.real_effect || "unknown")));
    body.appendChild(facts);
    els.stateView.appendChild(body);
  }

  function renderTraces() {
    var traces = (data && data.traces || []).slice().sort(function (a, b) {
      return text(b.ts, "").localeCompare(text(a.ts, ""));
    }).slice(0, 40);
    els.traceList.replaceChildren();
    els.traceCount.textContent = String(data && data.traces ? data.traces.length : traces.length);
    traces.forEach(function (trace) {
      var row = node("div", "trace-row");
      var main = node("div", "trace-main");
      main.appendChild(node("strong", "badge", localValue("traceKind", trace.kind || "trace")));
      main.appendChild(node("span", "msg", text(trace.msg, t("noMessage"))));
      row.appendChild(main);
      row.appendChild(node("div", "trace-meta", [trace.ts, trace.project, trace.chain].map(function (v) { return text(v, "-"); }).join(" | ")));
      els.traceList.appendChild(row);
    });
  }

  function traceKinds() {
    var seen = {};
    (data && data.traces || []).forEach(function (trace) {
      if (trace.kind) seen[trace.kind] = true;
    });
    return Object.keys(seen).sort();
  }

  function traceProjects() {
    var seen = {};
    (data && data.traces || []).forEach(function (trace) {
      var project = text(trace.project, "").split(/\s+/)[0];
      if (project) seen[project] = true;
    });
    return Object.keys(seen).sort();
  }

  function updateTraceUrl() {
    var url = new URL(window.location.href);
    url.searchParams.set("view", "traces");
    if (traceProjectFilter) url.searchParams.set("trace_project", traceProjectFilter);
    else url.searchParams.delete("trace_project");
    url.searchParams.delete("project");
    if (traceKindFilter) url.searchParams.set("trace_kind", traceKindFilter);
    else url.searchParams.delete("trace_kind");
    window.history.pushState({}, "", url.toString());
  }

  function filteredTraces() {
    return (data && data.traces || []).slice().sort(function (a, b) {
      return text(b.ts, "").localeCompare(text(a.ts, ""));
    }).filter(function (trace) {
      var project = text(trace.project, "");
      return (!traceProjectFilter || project.indexOf(traceProjectFilter) === 0 || traceMatchesProject(trace, traceProjectFilter))
        && (!traceKindFilter || trace.kind === traceKindFilter);
    });
  }

  function resetTraceFilters() {
    traceProjectFilter = "";
    traceKindFilter = "";
    updateTraceUrl();
    renderTraceExplorer();
  }

  function openTraceProject(projectName) {
    focusProjectByName(projectName);
  }

  function openTraceChain(chainName) {
    var chain = text(chainName, "");
    if (!chain) return;
    if (window.G9C && window.G9C.openChainDrawer) {
      window.G9C.openChainDrawer(chain);
    } else {
      focusChain(chain);
    }
  }

  function projectByTraceName(projectName) {
    var target = String(projectName || "").split(/\s+/)[0];
    if (!target) return null;
    return visibleProjects().find(function (item) {
      return text(item.project, "").toLowerCase() === target.toLowerCase();
    }) || null;
  }

  function focusProjectByName(projectName) {
    var project = projectByTraceName(projectName);
    if (!project) return;
    selectedKey = projectKey(project, activeState(project));
    currentView = "overview";
    updateViewUrl("overview");
    render();
    var list = document.getElementById("projectList");
    if (list && typeof list.scrollIntoView === "function") list.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function traceFilterChip(label, value, clearFn) {
    var chip = node("button", "trace-filter-chip", label + ": " + value + " ×");
    chip.type = "button";
    chip.title = t("clearFilter");
    chip.addEventListener("click", clearFn);
    return chip;
  }

  function traceActiveFilters() {
    var wrap = node("div", "trace-active-filters");
    wrap.appendChild(node("span", "mini", t("activeFilters") + ":"));
    if (traceProjectFilter) {
      wrap.appendChild(traceFilterChip(t("projectFilter"), traceProjectFilter, function () {
        traceProjectFilter = "";
        updateTraceUrl();
        renderTraceExplorer();
      }));
    }
    if (traceKindFilter) {
      wrap.appendChild(traceFilterChip(t("kindFilter"), localValue("traceKind", traceKindFilter), function () {
        traceKindFilter = "";
        updateTraceUrl();
        renderTraceExplorer();
      }));
    }
    if (!traceProjectFilter && !traceKindFilter) wrap.appendChild(node("span", "mini", t("none")));
    return wrap;
  }

  function traceTargetChips(trace) {
    var chips = node("div", "trace-target-chips");
    var project = text(trace.project, "");
    var chain = text(trace.chain, "");
    if (project) chips.appendChild(node("span", "trace-target-chip", t("projectFilter") + ": " + project));
    if (chain) chips.appendChild(node("span", "trace-target-chip", "Chain: " + chain));
    if (!chips.children.length) chips.appendChild(node("span", "trace-target-chip muted", t("eventTarget") + ": " + t("none")));
    return chips;
  }

  function traceActionBar(trace) {
    var actions = node("div", "trace-open-actions");
    var project = text(trace.project, "");
    var chain = text(trace.chain, "");
    if (project && projectByTraceName(project)) {
      var projectButton = node("button", "tiny-action trace-action", t("openProject"));
      projectButton.type = "button";
      projectButton.addEventListener("click", function () { openTraceProject(project); });
      actions.appendChild(projectButton);
    }
    if (chain) {
      var chainButton = node("button", "tiny-action trace-action", t("openChain"));
      chainButton.type = "button";
      chainButton.addEventListener("click", function () { openTraceChain(chain); });
      actions.appendChild(chainButton);
    }
    return actions;
  }

  function renderTraceExplorer() {
    if (!els.traceExplorerView) return;
    els.traceExplorerView.replaceChildren();
    var matches = filteredTraces();
    var card = node("div", "trace-explorer-card");
    var head = node("div", "skill-library-head");
    head.appendChild(node("strong", "", t("traceExplorerTitle")));
    head.appendChild(node("span", "badge", matches.length + " / " + text(data && data.traces && data.traces.length, "0")));
    card.appendChild(head);
    card.appendChild(node("div", "sub", t("traceExplorerBody")));

    var toolbar = node("div", "trace-toolbar");
    toolbar.appendChild(traceSelect(t("allProjects"), traceProjectFilter, traceProjects(), function (value) {
      traceProjectFilter = value;
      updateTraceUrl();
      renderTraceExplorer();
    }));
    toolbar.appendChild(traceSelect(t("allKinds"), traceKindFilter, traceKinds(), function (value) {
      traceKindFilter = value;
      updateTraceUrl();
      renderTraceExplorer();
    }));
    card.appendChild(toolbar);
    card.appendChild(traceActiveFilters());

    var list = node("div", "trace-explorer-list");
    matches.slice(0, 80).forEach(function (trace) {
      var row = node("article", "trace-row trace-explorer-row");
      var main = node("div", "trace-main");
      main.appendChild(node("strong", "badge", localValue("traceKind", trace.kind || "trace")));
      main.appendChild(node("span", "msg", text(trace.msg, t("noMessage"))));
      main.appendChild(traceTargetChips(trace));
      row.appendChild(main);
      var meta = node("div", "trace-meta", [trace.ts, trace.project, trace.chain].map(function (v) { return text(v, "-"); }).join(" | "));
      row.appendChild(meta);
      var actions = traceActionBar(trace);
      if (actions.children.length) row.appendChild(actions);
      list.appendChild(row);
    });
    if (!list.children.length) {
      var empty = node("div", "empty trace-empty");
      empty.appendChild(node("span", "", t("noMatchingEvents") + " " + t("tryWideningFilter")));
      var reset = node("button", "tiny-action trace-action", t("resetFilters"));
      reset.type = "button";
      reset.addEventListener("click", resetTraceFilters);
      empty.appendChild(reset);
      list.appendChild(empty);
    }
    card.appendChild(list);
    els.traceExplorerView.appendChild(card);
  }

  function traceSelect(label, value, options, onChange) {
    var select = document.createElement("select");
    select.setAttribute("aria-label", label);
    var all = document.createElement("option");
    all.value = "";
    all.textContent = label;
    select.appendChild(all);
    (options || []).forEach(function (option) {
      var item = document.createElement("option");
      item.value = option;
      item.textContent = option;
      select.appendChild(item);
    });
    select.value = value || "";
    select.addEventListener("change", function (event) { onChange(event.target.value); });
    return select;
  }

  function renderSummary() {
    checkStale(data && data.generated_at);
    var projects = visibleProjects();
    var all = data && data.projects || [];
    var counts = projectStatusCounts(projects);
    var watch = latestWatch();
    var watchNote = watch ? text(watch.ts, t("unknown")) : t("watchNotLoaded");
    var watchValue = watch ? text(watch.anomalies_total, "0") : "-";
    var skillLibrary = data && data.skill_library || getSkillLibrary() || {};
    var skillGate = skillLibrary.gate || {};
    var skillSummary = skillLibrary.summary || {};
    var skillRiskCount = Number(skillSummary.active_drift_risk_names || 0);
    var skillDriftClear = skillGate.active_drift_risk_clear === true;
    var items = [
      [t("visibleProjects"), projects.length, t("totalPrefix") + " " + all.length, "projects"],
      [t("coveredChains"), uniqueCount(projects, function (project) { return activeState(project).chain; }), t("registeredPrefix") + " " + (data && data.chains || []).length, "chains"],
      [t("pending"), counts.pending || 0, t("needsStateMovement"), "pending"],
      [t("skillDrift"), skillRiskCount, skillDriftClear ? t("skillDriftGreen") : t("skillDriftRed"), "skill-drift", skillDriftClear ? "summary-ok" : "summary-risk"],
      [t("watchAnomalies"), watchValue, watchNote, "watch"],
      [t("traceEvents"), data && data.traces ? data.traces.length : 0, t("latestLedgerTail"), "traces"]
    ];
    els.summary.replaceChildren();
    items.forEach(function (item) {
      var card = node("div", "summary-card");
      if (item[3]) card.setAttribute("data-kpi", item[3]);
      if (item[4]) card.classList.add(item[4]);
      card.appendChild(node("span", "summary-label", item[0]));
      card.appendChild(node("strong", "summary-value", item[1]));
      card.appendChild(node("span", "summary-note", item[2]));
      els.summary.appendChild(card);
    });
  }

  function checkStale(generatedAt) {
    if (!els.staleBanner) return;
    var generated = Date.parse(generatedAt || "");
    if (!generated) {
      els.staleBanner.hidden = true;
      els.staleBanner.replaceChildren();
      return;
    }
    var ageMs = Date.now() - generated;
    if (ageMs <= STALE_THRESHOLD_MS) {
      els.staleBanner.hidden = true;
      els.staleBanner.replaceChildren();
      return;
    }
    var minutes = Math.ceil(ageMs / 60000);
    els.staleBanner.replaceChildren();
    els.staleBanner.appendChild(node("strong", "", t("stale.banner.title")));
    els.staleBanner.appendChild(node("span", "", fillTemplate(t("stale.banner.body"), { minutes: minutes })));
    els.staleBanner.hidden = false;
  }

  function latestWatch() {
    return watchLog && watchLog.length ? watchLog[watchLog.length - 1] : null;
  }

  function renderDedupeWatch() {
    els.dedupeView.replaceChildren();
    var card = node("div", "dedupe-card");
    var head = node("div", "dedupe-head");
    head.appendChild(node("strong", "", t("dedupeWatchTitle")));
    head.appendChild(node("span", "badge", watchLog ? watchLog.length + " " + t("snapshots") : t("notLoaded")));
    card.appendChild(head);
    var latest = latestWatch();
    if (!latest) {
      card.appendChild(node("div", "sub", t("dedupeWatchMissing")));
      card.appendChild(commandBlock("python3 /Users/yumei/tools/automation/scripts/skill-dedupe-watch.py --once"));
      els.dedupeView.appendChild(card);
      return;
    }
    var status = node("div", "watch-status " + (latest.anomalies_total ? "watch-risk" : "watch-ok"));
    status.appendChild(node("strong", "", latest.anomalies_total ? t("watchNeedsAttention") : t("watchClean")));
    status.appendChild(node("span", "", t("snapshotAt") + ": " + text(latest.ts, "-")));
    card.appendChild(status);
    var stats = node("div", "library-stats library-stats-compact");
    [
      [t("watchAnomalies"), latest.anomalies_total],
      [t("uniqueSkills"), latest.library_summary && latest.library_summary.unique_skills],
      [t("duplicates"), latest.library_summary && latest.library_summary.duplicate_skill_names],
      [t("watchedSkills"), latest.skills && latest.skills.length]
    ].forEach(function (item) {
      var stat = node("div", "library-stat");
      stat.appendChild(node("span", "", item[0]));
      stat.appendChild(node("strong", "", text(item[1], "0")));
      stats.appendChild(stat);
    });
    card.appendChild(stats);
    var skills = node("div", "watch-skill-grid");
    (latest.skills || []).forEach(function (skill) {
      var row = node("div", "watch-skill-row" + ((skill.anomalies || []).length ? " has-risk" : ""));
      row.appendChild(node("strong", "", text(skill.skill, "skill")));
      row.appendChild(node("span", "muted", text((skill.ssot_sha256 || "").slice(0, 12), "-")));
      row.appendChild(node("span", "badge thin", (skill.aliases || []).length + " " + t("aliases")));
      if ((skill.anomalies || []).length) row.appendChild(node("span", "copy-badge", skill.anomalies.length + " " + t("issues")));
      skills.appendChild(row);
    });
    card.appendChild(skills);
    card.appendChild(commandBlock("python3 /Users/yumei/tools/automation/scripts/skill-dedupe-watch.py --analyze"));
    card.appendChild(commandBlock("python3 /Users/yumei/tools/automation/scripts/skill-dedupe-watch.py --diff"));
    els.dedupeView.appendChild(card);
  }

  function commandBlock(value) {
    var wrap = node("div", "command-row");
    wrap.appendChild(node("code", "", value));
    var button = node("button", "", t("copyCommand"));
    button.type = "button";
    button.addEventListener("click", function () { copyText(value, button, "copyCommand"); });
    wrap.appendChild(button);
    return wrap;
  }

  var repoEvolverLines = [
    {
      id: "repo-evolver-maintenance",
      labelKey: "repoEvolverMaintenance",
      statusKey: "repoEvolverStatusOperational",
      evidence: [
        "runtime/self-evolution/daily-evolution-control.md",
        "runtime/self-evolution/daily-evolution-2026-05-08.md",
        "runtime/self-evolution/daily-evolution-2026-05-08-task-packets.json"
      ],
      traceTerms: ["daily evolution", "maintenance", "review-first", "task packet"],
      nextKey: "repoEvolverMaintenanceNext"
    },
    {
      id: "repo-evolver-docs",
      labelKey: "repoEvolverDocs",
      statusKey: "repoEvolverStatusReviewFirst",
      evidence: [
        "runtime/self-evolution/daily-evolution-2026-05-08.json",
        "runtime/self-evolution/daily-evolution-2026-05-08-task-packets.json",
        "plan.md"
      ],
      traceTerms: ["doc-drift", "stale", "command-example", "semantic"],
      nextKey: "repoEvolverDocsNext"
    },
    {
      id: "repo-evolver-skills",
      labelKey: "repoEvolverSkills",
      statusKey: "repoEvolverStatusGuarded",
      evidence: [
        "runtime/skill-chains/dashboard/data.json",
        "runtime/skill-chains/dashboard/skills.json",
        "runtime/self-evolution/daily-evolution-control.md"
      ],
      traceTerms: ["skill", "drift", "dashboard", "active drift"],
      nextKey: "repoEvolverSkillsNext"
    },
    {
      id: "repo-evolver-mirror",
      labelKey: "repoEvolverMirror",
      statusKey: "repoEvolverStatusApprovalGated",
      evidence: [
        "runtime/self-evolution/mirror-drift-scan.md",
        "runtime/self-evolution/mirror-drift-scan.json",
        "plan.md"
      ],
      traceTerms: ["mirror", "Obsidian", "approval", "source of truth"],
      nextKey: "repoEvolverMirrorNext"
    },
    {
      id: "repo-evolver-restore",
      labelKey: "repoEvolverRestore",
      statusKey: "repoEvolverStatusDryRun",
      evidence: [
        "runtime/self-evolution/restore-rehearsal-policy.md",
        "runtime/task-board/source-runtime-manifest.md",
        "runtime/task-board/source-runtime-manifest.json"
      ],
      traceTerms: ["restore", "backup", "source-runtime", "manifest"],
      nextKey: "repoEvolverRestoreNext"
    }
  ];

  function repoEvolverTrace(line) {
    var terms = (line.traceTerms || []).map(function (term) { return String(term).toLowerCase(); });
    return (data && data.traces || []).slice().sort(function (a, b) {
      return text(b.ts, "").localeCompare(text(a.ts, ""));
    }).find(function (trace) {
      var haystack = [trace.project, trace.chain, trace.kind, trace.msg].map(function (value) {
        return text(value, "").toLowerCase();
      }).join(" ");
      return terms.some(function (term) { return haystack.indexOf(term.toLowerCase()) >= 0; });
    });
  }

  function repoEvolverEvidence(line, trace) {
    var values = (line.evidence || []).slice();
    if (trace && trace.msg) values.unshift("runtime/skill-chains/dashboard/data.json#" + compact(trace.msg, "trace", 68));
    return values;
  }

  function repoEvolverStatusClass(status) {
    if (status === "pass") return "ok";
    if (status === "weak") return "warn";
    if (status === "fail") return "risk";
    return "";
  }

  function repoEvolverGapLabel(gap) {
    var key = "repoEvolverGapLabel." + text(gap && gap.id, "");
    var value = t(key);
    return value === key ? text(gap && gap.id, "gap") : value;
  }

  function repoEvolverGapNote(gap) {
    var key = "repoEvolverGapNote." + text(gap && gap.id, "");
    var value = t(key);
    return value === key ? text(gap && (gap.note || gap.requirement), "") : value;
  }

  function renderRepoEvolverGatePanel() {
    var snapshot = data && data.repo_evolver || {};
    var summary = snapshot.summary || {};
    var gate = snapshot.gate || {};
    var gaps = snapshot.gaps || [];
    var panel = node("section", "repo-evolver-gate-panel" + (gate.split_reconsideration_blocked ? " has-risk" : ""));
    var head = node("div", "repo-evolver-gate-head");
    head.appendChild(node("strong", "", t("repoEvolverGateTitle")));
    head.appendChild(node("span", "badge " + (gate.hard_gates_clear ? "ok" : "risk"), gate.hard_gates_clear ? t("repoEvolverHardGatesClear") : t("repoEvolverHardGatesBlocked")));
    panel.appendChild(head);

    var stats = node("div", "repo-evolver-gate-stats");
    [
      [t("repoEvolverGateChecks"), summary.checks],
      [t("repoEvolverGatePass"), summary.pass],
      [t("repoEvolverGateWeak"), summary.weak],
      [t("repoEvolverGateFail"), summary.fail],
      [t("repoEvolverGateGaps"), summary.gaps]
    ].forEach(function (item) {
      var stat = node("div", "repo-evolver-gate-stat");
      stat.appendChild(node("span", "", item[0]));
      stat.appendChild(node("strong", "", text(item[1], "0")));
      stats.appendChild(stat);
    });
    panel.appendChild(stats);

    if (snapshot.generated_at || snapshot.control_generated_at) {
      panel.appendChild(node("div", "repo-evolver-gate-generated", [
        t("generatedAt") + ": " + text(snapshot.generated_at, "-"),
        t("repoEvolverControlGeneratedAt") + ": " + text(snapshot.control_generated_at, "-")
      ].join(" | ")));
    }

    var blocker = gate.split_reconsideration_blocked ? t("repoEvolverSplitBlocked") : t("repoEvolverSplitUnblocked");
    panel.appendChild(node("p", "repo-evolver-gate-note", blocker));

    var gapList = node("div", "repo-evolver-gap-list");
    gaps.slice(0, 4).forEach(function (gap) {
      var row = node("div", "repo-evolver-gap-row");
      row.appendChild(node("span", "badge " + repoEvolverStatusClass(gap.status), localTerm(gap.status)));
      row.appendChild(node("strong", "", repoEvolverGapLabel(gap)));
      row.appendChild(node("span", "", repoEvolverGapNote(gap)));
      gapList.appendChild(row);
    });
    if (!gapList.children.length) gapList.appendChild(node("div", "muted", t("repoEvolverNoGaps")));
    panel.appendChild(gapList);
    return panel;
  }

  function renderRepoEvolver() {
    if (!els.repoEvolverView) return;
    els.repoEvolverView.replaceChildren();
    var card = node("div", "repo-evolver-card");
    var head = node("div", "repo-evolver-head");
    head.appendChild(node("strong", "", t("repoEvolverTitle")));
    head.appendChild(node("span", "badge", repoEvolverLines.length + " " + t("repoEvolverLines")));
    card.appendChild(head);
    card.appendChild(node("div", "sub", t("repoEvolverBody")));
    card.appendChild(renderRepoEvolverGatePanel());

    var grid = node("div", "repo-evolver-grid");
    repoEvolverLines.forEach(function (line) {
      var trace = repoEvolverTrace(line);
      var row = node("article", "repo-evolver-line " + line.id);
      var rowHead = node("div", "repo-evolver-line-head");
      rowHead.appendChild(node("strong", "", t(line.labelKey)));
      rowHead.appendChild(node("span", "badge ok", t(line.statusKey)));
      row.appendChild(rowHead);
      if (trace) {
        row.appendChild(node("div", "repo-evolver-trace", [text(trace.ts, "-"), text(trace.project, "-")].join(" | ")));
      }
      var evidence = detailListBlock(t("repoEvolverEvidence"), repoEvolverEvidence(line, trace));
      evidence.classList.add("repo-evolver-evidence");
      row.appendChild(evidence);
      var next = detailBlock(t("repoEvolverNextStep"), t(line.nextKey));
      next.classList.add("repo-evolver-next");
      row.appendChild(next);
      grid.appendChild(row);
    });
    card.appendChild(grid);
    els.repoEvolverView.appendChild(card);
  }

  function dispatchAssistant(match) {
    var assistants = data && data.assistants || [];
    return assistants.find(function (assistant) {
      var haystack = [assistant.id, assistant.name].map(function (value) {
        return text(value, "").toLowerCase();
      }).join(" ");
      return match.some(function (term) { return haystack.indexOf(term) >= 0; });
    }) || {};
  }

  var dispatchLanes = [
    {
      id: "dispatch-lane-codex",
      match: ["codex"],
      nameKey: "dispatchLaneCodex",
      roleKey: "dispatchLaneCodexRole",
      taskKey: "dispatchLaneCodexTask",
      invokeKey: "dispatchLaneCodexInvoke"
    },
    {
      id: "dispatch-lane-claude",
      match: ["claude"],
      nameKey: "dispatchLaneClaude",
      roleKey: "dispatchLaneClaudeRole",
      taskKey: "dispatchLaneClaudeTask",
      invokeKey: "dispatchLaneClaudeInvoke"
    },
    {
      id: "dispatch-lane-command-code-deepseek",
      match: ["deepseek", "command code", "cmd"],
      nameKey: "dispatchLaneDeepSeekFlash",
      roleKey: "dispatchLaneDeepSeekFlashRole",
      taskKey: "dispatchLaneDeepSeekFlashTask",
      invokeKey: "dispatchLaneDeepSeekFlashInvoke",
      fallbackNameKey: "dispatchLaneDeepSeekFlashModel"
    },
    {
      id: "dispatch-lane-opencode-policy",
      match: ["opencode", "open code"],
      nameKey: "dispatchLaneOpenCodeGo",
      roleKey: "dispatchLaneOpenCodeGoRole",
      taskKey: "dispatchLaneOpenCodeGoTask",
      invokeKey: "dispatchLaneOpenCodeGoInvoke",
      fallbackNameKey: "dispatchLaneOpenCodeGoModel"
    }
  ];

  function topDispatchProject() {
    var projects = visibleProjects();
    var dashboardProject = projects.find(function (project) {
      return text(project && project.project, "") === "skill-chain-dashboard";
    });
    if (dashboardProject) return dashboardProject;
    return projects.slice().sort(function (a, b) {
      return scoreProjectPriority(b).score - scoreProjectPriority(a).score;
    })[0] || null;
  }

  function dispatchPacket(lane, project) {
    var state = activeState(project);
    var projectName = text(project && project.project, "tools/automation");
    var chainName = text(state.chain, "repo-evolver");
    return [
      "/goal 完成 " + t(lane.taskKey),
      "",
      "目标：",
      t(lane.taskKey),
      "",
      "上下文：",
      "project=" + projectName + " chain=" + chainName + " state=" + text(state.state, "unknown"),
      "Dashboard evidence: runtime/skill-chains/dashboard/data.json and runtime/self-evolution task packets.",
      "",
      "推荐调用：",
      t(lane.invokeKey || "none"),
      "",
      "允许修改：",
      "Only the files explicitly named by the controller task packet.",
      "",
      "禁止修改：",
      "runtime private ledgers, secrets, push/PR/deploy/sync/SSH/rsync/launchd/destructive git actions.",
      "",
      "验证：",
      "Run the focused command from the task packet, then report changed files, validation, and remaining risk.",
      "",
      "交付：",
      "Return summary only unless the controller grants a write scope."
    ].join("\n");
  }

  function renderDispatch() {
    if (!els.dispatchView) return;
    els.dispatchView.replaceChildren();
    var card = node("div", "dispatch-card");
    var head = node("div", "dispatch-head");
    head.appendChild(node("strong", "", t("dispatchTitle")));
    head.appendChild(node("span", "badge ok", t("dispatchReadOnly")));
    card.appendChild(head);
    card.appendChild(node("div", "sub", t("dispatchBody")));

    var candidates = dispatchFocusCandidates();
    if (!candidates.length) {
      els.dispatchView.appendChild(card);
      return;
    }

    if (dispatchFocusKey && !candidates.some(function (c) { return c.key === dispatchFocusKey; })) {
      dispatchFocusKey = "";
    }
    if (!dispatchFocusKey) dispatchFocusKey = candidates[0].key;

    var project = null;
    var state = null;
    for (var ci = 0; ci < candidates.length; ci++) {
      var cp = candidates[ci].project;
      if (projectKey(cp, activeState(cp)) === dispatchFocusKey) {
        project = cp;
        state = candidates[ci].state;
        break;
      }
    }
    if (!project) {
      project = candidates[0].project;
      state = candidates[0].state;
      dispatchFocusKey = candidates[0].key;
    }

    var focus = node("div", "dispatch-focus");
    var focusRow = node("div", "dispatch-focus-row");
    focusRow.appendChild(node("span", "detail-label", t("dispatchCurrentFocus")));
    focusRow.appendChild(node("strong", "", [
      text(project && project.project, "tools/automation"),
      stateLabel(state && state.state),
      text(state && state.chain, "repo-evolver")
    ].join(" | ")));
    focus.appendChild(focusRow);

    if (candidates.length > 1) {
      var chips = node("div", "focus-chips");
      candidates.forEach(function (item) {
        var chip = node("button", "focus-chip" + (item.key === dispatchFocusKey ? " active" : ""), text(item.project.project, "?"));
        chip.type = "button";
        chip.title = [text(item.project.project, ""), stateLabel(item.state.state), text(item.state.chain, "")].join(" | ");
        chip.addEventListener("click", function () {
          dispatchFocusKey = item.key;
          renderDispatch();
        });
        chips.appendChild(chip);
      });
      focus.appendChild(chips);
    }

    card.appendChild(focus);

    var grid = node("div", "dispatch-grid");
    dispatchLanes.forEach(function (lane) {
      var assistant = dispatchAssistant(lane.match);
      var row = node("article", "dispatch-lane " + lane.id);
      var rowHead = node("div", "dispatch-lane-head");
      rowHead.appendChild(node("strong", "", t(lane.nameKey)));
      rowHead.appendChild(node("span", "badge", text(assistant.name, t(lane.fallbackNameKey || "unknownRole"))));
      row.appendChild(rowHead);
      row.appendChild(node("p", "dispatch-role", t(lane.roleKey)));
      if (lane.invokeKey) row.appendChild(commandBlock(t(lane.invokeKey)));
      row.appendChild(detailBlock(t("dispatchPacket"), t(lane.taskKey)));
      row.appendChild(detailListBlock(t("dispatchBoundaries"), [
        t("dispatchBoundaryScoped"),
        t("dispatchBoundaryNoRuntime"),
        t("dispatchBoundaryNoRemote")
      ]));
      var packet = dispatchPacket(lane, project);
      var packetBlock = node("pre", "dispatch-packet", packet);
      row.appendChild(packetBlock);
      var copy = node("button", "trace-action", t("copyGoalPacket"));
      copy.type = "button";
      copy.addEventListener("click", function () { copyText(packet, copy, "copyGoalPacket"); });
      row.appendChild(copy);
      grid.appendChild(row);
    });
    card.appendChild(grid);
    card.appendChild(commandBlock("python3 /Users/yumei/tools/automation/scripts/multi-agent-dispatch.py --help"));
    els.dispatchView.appendChild(card);
  }

  function renderAssistants() {
    var assistants = data && data.assistants || [];
    els.assistantView.replaceChildren();
    var intro = node("div", "assistant-intro");
    intro.appendChild(node("strong", "", t("dailyEntry")));
    intro.appendChild(node("span", "", t("dailyEntryBody")));
    if (data && data.daily_entry) {
      intro.appendChild(node("code", "", data.daily_entry.refresh_command));
      intro.appendChild(node("code", "", data.daily_entry.server_command || ""));
    }
    if (data && data.capability_registry && data.capability_registry.missing) {
      intro.appendChild(node("span", "warning", t("capabilityFallback")));
    }
    els.assistantView.appendChild(intro);
    els.assistantView.appendChild(renderModelRouterHealth(data && data.model_router));
    assistants.forEach(function (assistant) {
      var card = node("article", "assistant-card");
      var head = node("div", "assistant-head");
      head.appendChild(node("strong", "", text(assistant.name, "AI")));
      head.appendChild(node("span", "badge", (assistant.skills || []).length + " " + t("skillCount")));
      card.appendChild(head);
      card.appendChild(node("div", "sub", assistantRole(assistant)));

      var best = (assistant.support_matrix || assistant.support || []).slice().sort(function (a, b) {
        return (b.coverage || 0) - (a.coverage || 0);
      }).slice(0, 3);
      var support = node("div", "support-list");
      support.appendChild(node("div", "support-caption", t("skillChainSupport")));
      best.forEach(function (item) {
        var row = node("div", "support-row");
        row.appendChild(node("span", "", text(item.chain, "chain")));
        row.appendChild(node("span", "", Math.round((item.coverage || 0) * 100) + "%"));
        support.appendChild(row);
      });
      card.appendChild(support);

      var skills = (assistant.skills || []).slice(0, 8);
      var chips = node("div", "skill-chips");
      if (skills.length) {
        skills.forEach(function (skill) {
          var chip = node("span", "skill-chip", text(skill.name, ""));
          if (skill.source) chip.title = skill.source;
          chips.appendChild(chip);
        });
      } else {
        chips.appendChild(node("span", "skill-chip muted", t("noLocalSkillRuntime")));
      }
      card.appendChild(chips);
      card.appendChild(node("div", "mini", assistantOpenHint(assistant)));
      var actions = node("div", "assistant-actions");
      var detail = node("button", "", t("viewDetails"));
      detail.type = "button";
      detail.addEventListener("click", function () { openAssistantDrawer(assistant.id || assistant.name); });
      actions.appendChild(detail);
      card.appendChild(actions);
      els.assistantView.appendChild(card);
    });
    if (assistantDrawerOpen) els.assistantView.appendChild(renderAssistantDrawer(assistants));
  }

  function renderModelRouterHealth(router) {
    router = router || {};
    var summary = router.summary || {};
    var panel = node("section", "model-router-health");
    var head = node("div", "model-router-head");
    head.appendChild(node("strong", "", t("modelRouterHealth")));
    head.appendChild(node("span", "badge", router.missing ? t("notLoaded") : t("dryRunDefault")));
    panel.appendChild(head);
    var stats = node("div", "model-router-stats");
    [
      [t("models"), summary.models || 0, "ready"],
      [t("modelReady"), summary.ready || 0, "ready"],
      [t("modelCooldown"), summary.cooldown || 0, "cooldown"],
      [t("modelFatal"), summary.fatal || 0, "fatal"],
      [t("modelUnavailable"), summary.unavailable || 0, "fatal"],
      [t("modelLastSuccess"), summary.last_success || 0, "success"]
    ].forEach(function (item) {
      var stat = node("div", "model-router-stat " + item[2]);
      stat.appendChild(node("span", "", item[0]));
      stat.appendChild(node("strong", "", String(item[1])));
      panel.classList.toggle("has-risk", Number(summary.cooldown || 0) + Number(summary.fatal || 0) + Number(summary.unavailable || 0) > 0);
      stats.appendChild(stat);
    });
    panel.appendChild(stats);

    var rows = (router.models || []).filter(function (item) {
      return item.status === "cooldown" || item.status === "fatal" || item.status === "unavailable";
    }).slice(0, 6);
    var list = node("div", "model-router-list");
    if (!rows.length) {
      list.appendChild(node("span", "muted", router.missing ? t("modelRouterStateMissing") : t("modelRouterAllClear")));
    } else {
      rows.forEach(function (item) {
        var row = node("div", "model-router-row " + text(item.status, ""));
        row.appendChild(node("strong", "", text(item.model, "model")));
        row.appendChild(node("span", "badge thin", localTerm(item.status)));
        row.appendChild(node("span", "muted", compact(item.last_failure_reason || item.cooldown_until || "", "", 96)));
        list.appendChild(row);
      });
    }
    panel.appendChild(list);
    panel.appendChild(commandBlock("python3 /Users/yumei/tools/automation/scripts/ai-model-router.py --task hard_review --json"));
    return panel;
  }

  function selectedAssistant(assistants) {
    return (assistants || []).find(function (assistant) {
      return assistant.id === selectedAssistantId || assistant.name === selectedAssistantId;
    }) || (assistants || [])[0] || null;
  }

  function renderAssistantDrawer(assistants) {
    var overlay = node("div", "drawer-overlay");
    overlay.addEventListener("click", closeAssistantDrawer);
    var panel = node("aside", "skill-detail drawer-panel");
    wireDialogKeyboard(panel, closeAssistantDrawer);
    panel.addEventListener("click", function (event) { event.stopPropagation(); });
    var assistant = selectedAssistant(assistants);
    var drawerHead = node("div", "drawer-head");
    drawerHead.appendChild(node("strong", "", t("assistantDetailTitle")));
    var close = node("button", "icon-button", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("close"));
    close.addEventListener("click", closeAssistantDrawer);
    drawerHead.appendChild(close);
    panel.appendChild(drawerHead);
    if (!assistant) {
      panel.appendChild(node("div", "empty", t("unknownRole")));
      overlay.appendChild(panel);
      return overlay;
    }
    panel.appendChild(node("h3", "", text(assistant.name, "AI")));
    panel.appendChild(detailBlock(t("role"), assistantRole(assistant)));
    panel.appendChild(detailBlock(t("openHint"), assistantOpenHint(assistant)));
    panel.appendChild(detailListBlock(t("chainRoles"), assistant.chain_roles));
    panel.appendChild(detailListBlock(t("supports"), assistant.supports));
    panel.appendChild(assistantSupportBlock(assistant));
    panel.appendChild(assistantSkillBlock(assistant));
    overlay.appendChild(panel);
    return overlay;
  }

  function assistantSupportBlock(assistant) {
    var block = node("div", "detail-block");
    block.appendChild(node("span", "detail-label", t("skillChainSupport")));
    var rows = node("div", "support-list");
    (assistant.support_matrix || assistant.support || []).forEach(function (item) {
      var row = node("div", "support-row");
      row.appendChild(node("span", "", text(item.chain, "chain")));
      row.appendChild(node("span", "", Math.round((item.coverage || 0) * 100) + "%"));
      rows.appendChild(row);
    });
    if (!rows.children.length) rows.appendChild(node("div", "muted", t("none")));
    block.appendChild(rows);
    return block;
  }

  function assistantSkillBlock(assistant) {
    var block = node("div", "detail-block");
    block.appendChild(node("span", "detail-label", t("skillCount") + " (" + (assistant.skills || []).length + ")"));
    var chips = node("div", "skill-chips");
    (assistant.skills || []).forEach(function (skill) {
      var chip = node("span", "skill-chip", text(skill.name, "skill"));
      if (skill.source) chip.title = skill.source;
      chips.appendChild(chip);
    });
    if (!chips.children.length) chips.appendChild(node("span", "skill-chip muted", t("noLocalSkillRuntime")));
    block.appendChild(chips);
    return block;
  }

  function copyText(value, button, resetKey) {
    function done() {
      button.textContent = t("copied");
      window.setTimeout(function () { button.textContent = t(resetKey || "copyGoalPacket"); }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () {
        fallbackCopy(value);
        done();
      });
      return;
    }
    fallbackCopy(value);
    done();
  }

  function fallbackCopy(value) {
    var area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }

  function renderAdvisory(project, state) {
    els.advisoryView.replaceChildren();
    renderPriorityRecommendations();
    var rec = recommendation(project, state);
    if (!rec) {
      var empty = node("div", "advisory-card");
      empty.appendChild(node("strong", "", t("advisoryTitle")));
      empty.appendChild(node("span", "sub", t("advisoryEmpty")));
      els.advisoryView.appendChild(empty);
      return;
    }
    var card = node("div", "advisory-card");
    var head = node("div", "advisory-head");
    head.appendChild(node("strong", "", t("advisoryTitle")));
    head.appendChild(node("span", "badge", text(rec.assistant.name, "AI") + " / " + text(rec.role, "role")));
    card.appendChild(head);
    card.appendChild(node("div", "advisory-next", text(rec.project, "project") + " (" + text(rec.chain, "chain") + " / " + stateLabel(rec.current_state) + " -> " + stateLabel(rec.next_state) + ")"));
    card.appendChild(completionBlock(rec.completion));
    card.appendChild(goalStatusBlock(rec.goal_run));
    card.appendChild(node("div", "sub", t("recommended") + ": " + text(rec.assistant.name, "AI") + " (" + text(rec.role, "role") + ")"));
    card.appendChild(node("div", "sub", t("rationale") + ": " + text(rec.rationale, t("defaultRationale"))));
    var actions = node("div", "advisory-actions");
    var copy = node("button", "", t("copyGoalPacket"));
    copy.type = "button";
    copy.addEventListener("click", function () { copyText(rec.draft, copy, "copyGoalPacket"); });
    actions.appendChild(copy);
    card.appendChild(actions);
    var pre = node("pre", "goal-draft", rec.draft);
    card.appendChild(pre);
    els.advisoryView.appendChild(card);
  }

  function goalStatusBlock(run) {
    var lifecycle = goalLifecycle(run);
    var box = node("div", "goal-status-box goal-status-" + lifecycle.status);
    var head = node("div", "completion-head");
    head.appendChild(node("span", "completion-label", t("goalStatus") + ": " + lifecycle.label));
    head.appendChild(node("span", "completion-percent", run ? text(run.events, "1") + " " + t("events") : t("none")));
    box.appendChild(head);
    box.appendChild(node("div", "mini", lifecycle.text));
    return box;
  }

  function completionBlock(completion) {
    var box = node("div", "completion-box" + (completion.state_stale ? " stale" : ""));
    var head = node("div", "completion-head");
    head.appendChild(node("span", "completion-label", t("taskStatus") + ": " + t(completion.label_key)));
    head.appendChild(node("span", "completion-percent", completion.percent + "%"));
    box.appendChild(head);
    var meter = node("div", "completion-meter");
    var fill = node("span", "");
    fill.style.width = completion.percent + "%";
    meter.appendChild(fill);
    box.appendChild(meter);
    box.appendChild(node("div", "mini", t("gateCoverage") + ": " + completion.passed_gates + "/" + completion.required_gates));
    if (completion.expected_red_gate_passed) box.appendChild(node("div", "mini", t("expectedRedGate")));
    box.appendChild(node("div", "mini", t(completion.source_key) + (completion.updated_at ? " " + completion.updated_at : "")));
    return box;
  }

  function renderPriorityRecommendations() {
    var ranked = priorityRankedProjects().slice(0, 3);
    var card = node("div", "priority-card");
    var head = node("div", "priority-head");
    head.appendChild(node("strong", "", t("todayPriority")));
    head.appendChild(node("span", "badge", t("topProjects")));
    card.appendChild(head);
    card.appendChild(node("div", "sub", t("priorityBody")));
    if (!ranked.length) {
      card.appendChild(node("div", "empty priority-empty", t("noProjects")));
      els.advisoryView.appendChild(card);
      return;
    }
    var list = node("div", "priority-list");
    ranked.forEach(function (item, index) {
      var rec = recommendation(item.project, item.state);
      var row = node("button", "priority-row" + (item.key === selectedKey ? " selected" : ""));
      row.type = "button";
      row.addEventListener("click", function () {
        selectedKey = item.key;
        render();
      });
      row.appendChild(node("span", "priority-rank", "#" + (index + 1)));
      var main = node("span", "priority-main");
      main.appendChild(node("strong", "", text(item.project.project, "project")));
      main.appendChild(node("span", "priority-meta", text(item.state.chain, t("noChain")) + " / " + stateLabel(item.state.state) + " / " + t("recommendedAi") + ": " + text(rec && rec.assistant && rec.assistant.name, t("unknownRole"))));
      var chips = node("span", "reason-chips");
      item.reasons.forEach(function (reason) {
        var label = t(reason.key);
        var suffix = reason.points > 0 ? " +" + reason.points : " " + reason.points;
        chips.appendChild(node("span", "reason-chip", label + suffix));
      });
      main.appendChild(chips);
      row.appendChild(main);
      row.appendChild(node("span", "priority-score", t("score") + " " + item.score));
      list.appendChild(row);
    });
    card.appendChild(list);
    els.advisoryView.appendChild(card);
  }

  function renderSkillLibrary() {
    els.skillLibraryView.replaceChildren();
    var library = getSkillLibrary();
    var card = node("div", "skill-library-card library-workbench");
    var head = node("div", "skill-library-head");
    head.appendChild(node("strong", "", t("skillLibraryTitle")));
    if (!library) {
      head.appendChild(node("span", "badge", t("notGenerated")));
      card.appendChild(head);
      card.appendChild(node("div", "sub", t("skillLibraryMissing")));
      els.skillLibraryView.appendChild(card);
      return;
    }
    var summary = library.summary || {};
    head.appendChild(node("span", "badge", text(summary.unique_skills, "0") + " " + t("uniqueSkills")));
    card.appendChild(head);
    card.appendChild(node("div", "sub", t("skillLibraryBody")));

    var stats = node("div", "library-stats library-stats-compact");
    [
      [t("skillFiles"), summary.skill_files],
      [t("duplicates"), summary.duplicate_skill_names],
      [t("categories"), summary.categories],
      [t("visibleSkills"), filteredSkills(library).length]
    ].forEach(function (item) {
      var stat = node("div", "library-stat");
      stat.appendChild(node("span", "", item[0]));
      stat.appendChild(node("strong", "", text(item[1], "0")));
      stats.appendChild(stat);
    });
    card.appendChild(stats);
    card.appendChild(renderDuplicateMetadataPanel(library));

    card.appendChild(renderSkillToolbar(library));

    var body = node("div", "library-body library-workbench-body");
    body.appendChild(renderSkillList(library));

    card.appendChild(body);
    els.skillLibraryView.appendChild(card);
    if (skillDrawerOpen) els.skillLibraryView.appendChild(renderSkillDrawer(library));
  }

  function renderDuplicateMetadataPanel(library) {
    var metadata = library.duplicate_metadata || {};
    var summary = library.summary || {};
    var gate = library.gate || {};
    var panel = node("div", "duplicate-metadata-panel");
    var head = node("div", "duplicate-metadata-head");
    head.appendChild(node("strong", "", t("duplicateGovernance")));
    head.appendChild(node("span", "badge " + (gate.active_drift_risk_clear ? "ok" : "risk"), gate.active_drift_risk_clear ? t("activeDriftClear") : t("activeDriftRisk")));
    panel.appendChild(head);

    var grids = node("div", "duplicate-metadata-grid");
    grids.appendChild(metadataGroup(t("duplicateKinds"), metadata.duplicate_kinds || {}));
    grids.appendChild(metadataGroup(t("copyRoles"), metadata.copy_roles || {}));
    grids.appendChild(metadataNames(t("activeDriftRiskNames"), metadata.active_drift_risk_names || [], true));
    grids.appendChild(metadataNames(t("intentionalVariants"), metadata.intentional_variant_names || [], false, summary.intentional_variant_names));
    grids.appendChild(metadataNames(t("archiveNoise"), metadata.archive_noise_names || [], false, summary.archive_noise_names));
    grids.appendChild(metadataNames(t("aliasSystemNoise"), metadata.alias_or_system_noise_names || [], false, summary.alias_or_system_noise_names));
    panel.appendChild(grids);
    return panel;
  }

  function metadataGroup(label, values) {
    var box = node("div", "metadata-box");
    box.appendChild(node("span", "metadata-label", label));
    var list = node("div", "metadata-pills");
    Object.keys(values || {}).sort().forEach(function (key) {
      list.appendChild(node("span", "metadata-pill", localTerm(key) + " " + values[key]));
    });
    if (!list.children.length) list.appendChild(node("span", "muted", t("none")));
    box.appendChild(list);
    return box;
  }

  function metadataNames(label, names, risk, fallbackCount) {
    var box = node("div", "metadata-box" + (risk && names.length ? " has-risk" : ""));
    box.appendChild(node("span", "metadata-label", label + " · " + text(names.length || fallbackCount || 0, "0")));
    var list = node("div", "metadata-pills");
    (names || []).slice(0, 8).forEach(function (name) {
      list.appendChild(node("span", risk ? "metadata-pill risk" : "metadata-pill", name));
    });
    if (!list.children.length) list.appendChild(node("span", "muted", t("none")));
    box.appendChild(list);
    return box;
  }

  function renderSkillToolbar(library) {
    var toolbar = node("div", "library-toolbar");
    var search = document.createElement("input");
    search.type = "search";
    search.value = skillFilter.query;
    search.placeholder = t("searchSkills");
    search.setAttribute("aria-label", t("searchSkills"));
    search.addEventListener("input", function (event) {
      var value = event.target.value;
      window.clearTimeout(skillSearchTimer);
      skillSearchTimer = window.setTimeout(function () {
        skillFilter.query = value;
        renderSkillLibrary();
        var next = els.skillLibraryView.querySelector("input[type='search']");
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      }, 250);
    });
    toolbar.appendChild(search);
    toolbar.appendChild(renderSkillFilterChips(library));
    return toolbar;
  }

  function renderSkillFilterChips(library) {
    var chips = node("div", "filter-chips");
    var all = filterChip(t("allCategories"), !skillFilter.categories.length && !skillFilter.duplicate && !skillFilter.important && !skillFilter.merge, function () {
      skillFilter.categories = [];
      skillFilter.duplicate = false;
      skillFilter.important = false;
      skillFilter.merge = false;
    });
    chips.appendChild(all);
    (library.categories || []).forEach(function (category) {
      chips.appendChild(filterChip(localTerm(category.id) + " · " + text(category.count, "0"), skillFilter.categories.indexOf(category.id) >= 0, function () {
        toggleCategoryFilter(category.id);
      }));
    });
    chips.appendChild(filterChip(localTerm("duplicate") + " · " + text(library.summary && library.summary.duplicate_skill_names, "0"), skillFilter.duplicate, function () {
      skillFilter.duplicate = !skillFilter.duplicate;
    }));
    chips.appendChild(filterChip(t("importance") + " > 0.5", skillFilter.important, function () {
      skillFilter.important = !skillFilter.important;
    }));
    chips.appendChild(filterChip(localTerm("merge_candidate"), skillFilter.merge, function () {
      skillFilter.merge = !skillFilter.merge;
    }));
    return chips;
  }

  function filterChip(label, active, onClick) {
    var chip = node("button", "filter-chip" + (active ? " active" : ""), label);
    chip.type = "button";
    chip.addEventListener("click", function () {
      onClick();
      renderSkillLibrary();
    });
    return chip;
  }

  function filteredSkills(library) {
    var query = skillFilter.query.trim().toLowerCase();
    return (library.skills || []).filter(function (skill) {
      var haystack = [
        skill.id,
        skill.category,
        skill.family,
        skill.purpose,
        skill.effect,
        skill.canonical_source,
        skill.frontmatter && skill.frontmatter.description,
        (skill.chains || []).join(" ")
      ].join(" ").toLowerCase();
      var verdict = skill.consolidation && skill.consolidation.verdict || "";
      var score = skill.importance && skill.importance.score || 0;
      return (!query || haystack.indexOf(query) >= 0)
        && (!skillFilter.categories.length || skillFilter.categories.indexOf(skill.category) >= 0)
        && (!skillFilter.duplicate || (skill.copies || []).length > 1)
        && (!skillFilter.important || score > 0.5)
        && (!skillFilter.merge || verdict === "merge_candidate");
    });
  }

  function renderSkillList(library) {
    var wrap = node("div", "library-column skill-results");
    var skills = filteredSkills(library);
    wrap.appendChild(node("strong", "", t("topSkills") + " (" + skills.length + ")"));
    skills.slice(0, 32).forEach(function (skill) {
      var row = node("button", "skill-row skill-select" + (skill.id === selectedSkillId ? " selected" : ""));
      row.type = "button";
      var main = node("div", "skill-row-main");
      var title = node("div", "skill-row-title");
      title.appendChild(node("strong", "", text(skill.id, "skill")));
      title.appendChild(node("span", "badge thin", localTerm(skill.category)));
      if ((skill.copies || []).length > 1) title.appendChild(node("span", "copy-badge", "x" + skill.copies.length));
      main.appendChild(title);
      main.appendChild(node("span", "sub", text(skillLocalized(skill, "purpose"), "")));
      var meta = node("div", "skill-meta");
      meta.appendChild(node("span", "", t("family") + ": " + localTerm(skill.family || "-")));
      meta.appendChild(node("span", "", t("calls30d") + ": " + text(skill.usage && skill.usage.invoke_count_30d, "0")));
      meta.appendChild(node("span", "", t("copies") + ": " + text(skill.copies && skill.copies.length, "0")));
      main.appendChild(meta);
      row.appendChild(main);
      row.appendChild(scorePill(skill));
      row.addEventListener("click", function () {
        openSkillDrawer(skill.id);
      });
      wrap.appendChild(row);
    });
    if (!skills.length) wrap.appendChild(node("div", "empty", t("noSkills")));
    return wrap;
  }

  function scorePill(skill) {
    var score = skill.importance_score !== undefined ? skill.importance_score : Math.round(((skill.importance && skill.importance.score) || 0) * 100);
    var pill = node("span", "score-pill", String(score));
    pill.title = t("importance");
    return pill;
  }

  function selectedSkill(library) {
    return (library.skills || []).find(function (skill) { return skill.id === selectedSkillId; }) || filteredSkills(library)[0] || null;
  }

  function renderSkillDrawer(library) {
    var overlay = node("div", "drawer-overlay");
    overlay.addEventListener("click", closeSkillDrawer);
    var panel = renderSkillDetail(library);
    wireDialogKeyboard(panel, closeSkillDrawer);
    panel.addEventListener("click", function (event) { event.stopPropagation(); });
    overlay.appendChild(panel);
    return overlay;
  }

  function renderSkillDetail(library) {
    var panel = node("aside", "skill-detail drawer-panel");
    var skill = selectedSkill(library);
    var drawerHead = node("div", "drawer-head");
    drawerHead.appendChild(node("strong", "", t("skillDetail")));
    var close = node("button", "icon-button", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("close"));
    close.addEventListener("click", closeSkillDrawer);
    drawerHead.appendChild(close);
    panel.appendChild(drawerHead);
    if (!skill) {
      panel.appendChild(node("div", "empty", t("noSkills")));
      return panel;
    }
    panel.appendChild(node("h3", "", text(skill.id, "skill")));
    var chips = node("div", "detail-chips");
    [skill.category, skill.family, skill.consolidation && skill.consolidation.verdict].forEach(function (item) {
      if (item) chips.appendChild(node("span", "skill-chip", localTerm(item)));
    });
    panel.appendChild(chips);
    panel.appendChild(detailBlock(t("purpose"), skillLocalized(skill, "purpose")));
    panel.appendChild(detailBlock(t("effect"), skillLocalized(skill, "effect")));
    panel.appendChild(detailBlock(t("whyIndependent"), skillLocalized(skill, "why_independent")));
    panel.appendChild(scoreBlock(skill));
    panel.appendChild(detailBlock(t("canonicalSource"), skill.canonical_source));
    panel.appendChild(chainBlock(skill.chains));
    panel.appendChild(sopBlock(skillSopSummary(skill)));
    panel.appendChild(detailListBlock(t("nonNegotiables"), skill.sop && skill.sop.non_negotiables));
    panel.appendChild(copiesBlock(skill));
    panel.appendChild(detailBlock(t("consolidation"), localTerm(skill.consolidation && skill.consolidation.verdict || "-") + " | " + text(skill.consolidation && skill.consolidation.rationale, "")));
    panel.appendChild(detailBlock(t("optimization"), skillLocalized(skill, "optimization") || skill.next_optimization || skill.optimization));
    var actions = node("div", "detail-actions");
    var copy = node("button", "", t("copyInspectCommand"));
    copy.type = "button";
    copy.addEventListener("click", function () {
      copyText("python3 /Users/yumei/tools/automation/scripts/skill-library.py --inspect " + skill.id, copy, "copyInspectCommand");
    });
    actions.appendChild(copy);
    panel.appendChild(actions);
    return panel;
  }

  function chainBlock(values) {
    var block = node("div", "detail-block");
    block.appendChild(node("span", "detail-label", t("chains")));
    var chips = node("div", "detail-chips");
    (values || []).forEach(function (value) {
      var chip = node("button", "skill-chip chain-chip", value);
      chip.type = "button";
      chip.addEventListener("click", function () {
        focusChain(String(value).split("@")[0]);
      });
      chips.appendChild(chip);
    });
    if (!chips.children.length) chips.appendChild(node("span", "muted", t("none")));
    block.appendChild(chips);
    return block;
  }

  function focusChain(chainName) {
    var project = visibleProjects().find(function (item) {
      return activeState(item).chain === chainName;
    });
    if (project) {
      selectedKey = projectKey(project, activeState(project));
      selectedSkillId = "";
      skillDrawerOpen = false;
      currentView = "overview";
      lastDrawerFocus = null;
      var url = new URL(window.location.href);
      url.searchParams.set("view", "overview");
      url.searchParams.delete("skill");
      window.history.pushState({}, "", url.toString());
      render();
      var target = document.getElementById("chainView");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function sopBlock(values) {
    var block = node("div", "detail-block");
    block.appendChild(node("span", "detail-label", t("sop")));
    var list = node("ol", "detail-list sop-list");
    (values || []).forEach(function (value) {
      list.appendChild(node("li", "", text(value, "")));
    });
    if (!list.children.length) list.appendChild(node("li", "muted", t("none")));
    block.appendChild(list);
    return block;
  }

  function copiesBlock(skill) {
    var block = node("div", "detail-block");
    block.appendChild(node("span", "detail-label", t("copies") + " (" + text((skill.copies || []).length, "0") + ")"));
    var list = node("div", "copy-list");
    (skill.copies || []).forEach(function (copy) {
      var row = node("div", "copy-row");
      row.appendChild(node("code", "", text(copy.source, "")));
      var button = node("button", "", t("copyPath"));
      button.type = "button";
      button.addEventListener("click", function () {
        copyText(text(copy.source, ""), button, "copyPath");
      });
      row.appendChild(button);
      list.appendChild(row);
    });
    if (!list.children.length) list.appendChild(node("div", "muted", t("none")));
    block.appendChild(list);
    return block;
  }

  function detailBlock(label, value) {
    var block = node("div", "detail-block");
    block.appendChild(node("span", "detail-label", label));
    block.appendChild(node("p", "", text(value, t("none"))));
    return block;
  }

  function detailListBlock(label, values) {
    var block = node("div", "detail-block");
    block.appendChild(node("span", "detail-label", label));
    block.appendChild(listItems(values, t("none")));
    return block;
  }

  function scoreBlock(skill) {
    var block = node("div", "detail-block");
    var score = (skill.importance && skill.importance.score) || 0;
    block.appendChild(node("span", "detail-label", t("importance")));
    var meter = node("div", "score-meter");
    var fill = node("span", "");
    fill.style.width = Math.round(score * 100) + "%";
    meter.appendChild(fill);
    block.appendChild(meter);
    var factors = skill.importance && skill.importance.factors || {};
    var facts = node("div", "skill-meta");
    facts.appendChild(node("span", "", t("chainRefs") + ": " + text(factors.chain_refs, "0")));
    facts.appendChild(node("span", "", t("calls30d") + ": " + text(factors.invoke_count, "0")));
    facts.appendChild(node("span", "", t("docRefs") + ": " + text(factors.user_doc_refs, "0")));
    facts.appendChild(node("span", "", t("isGate") + ": " + localTerm(text(factors.is_gate, "false"))));
    block.appendChild(facts);
    return block;
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    if (els.language) els.language.value = lang;
    if (els.language) els.language.setAttribute("aria-label", t("language"));
    els.title.textContent = t("title");
    document.title = t("title");
    if (data) {
      els.meta.textContent = t("generatedAt") + ": " + text(data.generated_at, "unknown") + " | " + t("registryVersion") + ": " + text(data.registry_version, "unknown");
    }
    document.querySelectorAll("[data-i18n]").forEach(function (item) {
      item.textContent = t(item.getAttribute("data-i18n"));
    });
    applyView();
  }

  function render() {
    applyI18n();
    ensureDefaultSelection();
    renderSummary();
    renderAssistants();
    renderProjects();
    renderTraceExplorer();
    renderSkillLibrary();
    renderDedupeWatch();
    renderRepoEvolver();
    renderDispatch();
    var project = selectedProject();
    var state = activeState(project);
    if (!project) {
      els.chainView.textContent = t("selectProject");
      els.stateView.textContent = t("selectProject");
      renderAdvisory(project, state);
      return;
    }
    renderAdvisory(project, state);
    renderChain(project, state);
    renderState(state);
    renderTraces();
    applyView();
  }

  function acceptJson(json) {
    data = json;
    render();
  }

  function getSkillLibrary() {
    if (!skillLibrary && window.__SKILL_LIBRARY_DATA__) {
      skillLibrary = window.__SKILL_LIBRARY_DATA__;
      skillLibraryLoadedAt = Date.now();
    }
    return skillLibrary;
  }

  function loadSkillLibrary() {
    var library = getSkillLibrary();
    if (library && Date.now() - skillLibraryLoadedAt < SKILL_LIBRARY_TTL_MS) {
      return Promise.resolve(library);
    }
    if (library && window.location.protocol === "file:") {
      return Promise.resolve(library);
    }
    if (skillLibraryPromise) return skillLibraryPromise;
    skillLibraryPromise = fetch("./skills.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        skillLibrary = json;
        skillLibraryLoadedAt = Date.now();
        window.__SKILL_LIBRARY_DATA__ = json;
        return json;
      })
      .catch(function (err) {
        console.warn("Could not load skills.json", err);
        return getSkillLibrary();
      })
      .then(function (json) {
        skillLibraryPromise = null;
        return json;
      });
    return skillLibraryPromise;
  }

  function loadData() {
    if (window.location.protocol === "file:" && window.__SKILL_CHAIN_DATA__) {
      try { return Promise.resolve(window.__SKILL_CHAIN_DATA__); }
      catch (err) { /* fall through to fetch */ }
    }
    return fetch("./data.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(loadViaFrame);
  }

  function loadViaFrame(originalError) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement("iframe");
      frame.hidden = true;
      frame.src = "./data.json";
      frame.onload = function () {
        try {
          var raw = frame.contentDocument && frame.contentDocument.body ? frame.contentDocument.body.textContent : "";
          document.body.removeChild(frame);
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(originalError || err);
        }
      };
      frame.onerror = function () {
        document.body.removeChild(frame);
        reject(originalError);
      };
      document.body.appendChild(frame);
    });
  }

  function loadTextViaFrame(path, originalError) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement("iframe");
      frame.hidden = true;
      frame.src = path;
      frame.onload = function () {
        try {
          var raw = frame.contentDocument && frame.contentDocument.body ? frame.contentDocument.body.textContent : "";
          document.body.removeChild(frame);
          resolve(raw);
        } catch (err) {
          reject(originalError || err);
        }
      };
      frame.onerror = function () {
        document.body.removeChild(frame);
        reject(originalError);
      };
      document.body.appendChild(frame);
    });
  }

  function parseWatchLog(raw) {
    return String(raw || "").split(/\n+/).map(function (line) {
      if (!line.trim()) return null;
      try { return JSON.parse(line); }
      catch (err) { return null; }
    }).filter(Boolean);
  }

  function loadWatchLog() {
    var paths = ["./watch-log.jsonl", "../dedupe/watch-log.jsonl"];
    function readAt(index) {
      var path = paths[index];
      return fetch(path, { cache: "no-store" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
        .catch(function (err) { return loadTextViaFrame(path, err); })
        .then(function (raw) {
          var parsed = parseWatchLog(raw);
          if (!parsed.length && index < paths.length - 1) return readAt(index + 1);
          return parsed;
        })
        .catch(function () {
          if (index < paths.length - 1) return readAt(index + 1);
          return [];
        });
    }
    return readAt(0)
      .then(function (parsed) {
        watchLog = parsed;
        window.__SKILL_CHAIN_WATCH__ = parsed;
        renderSummary();
        renderDedupeWatch();
        applyView();
      })
      .catch(function () {
        watchLog = null;
        window.__SKILL_CHAIN_WATCH__ = null;
        renderSummary();
        renderDedupeWatch();
        applyView();
      });
  }

  function load() {
    els.error.hidden = true;
    Promise.all([loadData(), loadSkillLibrary()])
      .then(function (results) {
        acceptJson(results[0]);
        loadWatchLog();
      })
      .catch(function (err) {
        els.error.hidden = false;
        els.error.textContent = t("loadError") + " " + err.message;
      });
  }

  // G9a: filter Projects by state=pending
  var g9aPendingFilter = false;
  document.addEventListener("g9a-filter-pending", function () {
    g9aPendingFilter = !g9aPendingFilter;
    if (els.projectList) {
      els.projectList.classList.toggle("g9a-only-pending", g9aPendingFilter);
      Array.prototype.forEach.call(els.projectList.querySelectorAll(".card"), function (card) {
        var badge = card.querySelector(".badge");
        var label = (card.getAttribute("data-state") || (badge ? badge.textContent : "") || "").trim().toLowerCase();
        var isPending = label === "pending" || label === "待推进";
        if (g9aPendingFilter) {
          card.style.display = isPending ? "" : "none";
        } else {
          card.style.display = "";
        }
      });
    }
  });

  // G9c: chain name click → open chain drawer
  if (els.chainName) {
    var openChainFromEl = function () {
      var name = els.chainName.getAttribute("data-chain-name");
      if (name && window.G9C && window.G9C.openChainDrawer) {
        window.G9C.openChainDrawer(name);
      }
    };
    els.chainName.addEventListener("click", openChainFromEl);
    els.chainName.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openChainFromEl();
      }
    });
  }

  els.reload.addEventListener("click", load);
  els.showArchive.addEventListener("change", function (event) {
    showArchive = event.target.checked;
    render();
  });
  els.language.addEventListener("change", function (event) {
    lang = event.target.value;
    localStorage.setItem("skillChainDashboardLang", lang);
    render();
  });
  if (els.viewNav) {
    Array.prototype.forEach.call(els.viewNav.querySelectorAll("button"), function (button) {
      button.addEventListener("click", function () {
        setView(button.getAttribute("data-view"));
      });
    });
  }
  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && skillDrawerOpen) closeSkillDrawer();
    if (event.key === "Escape" && assistantDrawerOpen) closeAssistantDrawer();
  });
  window.addEventListener("popstate", function () {
    var params = new URLSearchParams(window.location.search);
    selectedAssistantId = params.get("assistant") || "";
    assistantDrawerOpen = Boolean(selectedAssistantId);
    selectedSkillId = params.get("skill") || "";
    skillDrawerOpen = Boolean(selectedSkillId);
    traceProjectFilter = params.get("trace_project") || params.get("project") || "";
    traceKindFilter = params.get("trace_kind") || "";
    currentView = resolveView();
    render();
  });
  applyI18n();
  loadI18nJson().then(function () {
    applyI18n();
    load();
  });
  window.setInterval(load, 30000);
}());
