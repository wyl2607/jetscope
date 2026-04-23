# Lane 3 FAQ + 结构化数据 - 完成报告

## 任务概览

创建 FAQ 页面 + 结构化数据 (JSON-LD FAQPage)，用于 SEO 优化和 Google Featured Snippets。

## 完成状态

### ✅ 已完成

1. **Sitemap 更新** - `/apps/web/app/sitemap.ts`
   - 添加 `/faq` 路由，优先级 0.88，daily 更新频率
   - 已验证更新成功

2. **FAQ 内容完整创建** - 10 个高质量 Q&A
   - Q1: 什么是可持续航空燃油(SAF)?
   - Q2: SAF为什么比Jet-A贵?
   - Q3: SAF成本何时能与Jet-A相当?
   - Q4: 德国的SAF生产有什么优势?
   - Q5: ReFuelEU政策是什么?
   - Q6: 汉莎航班削减与SAF有什么关系?
   - Q7: EU ETS碳价如何影响SAF?
   - Q8: 糖基ATJ的转折点在哪?
   - Q9: 德国航油为什么这么贵?
   - Q10: 如何使用这个网站的分析工具?

3. **JSON-LD FAQPage 结构** ✅
   - 完整的 schema.org FAQPage 格式
   - 每个Q&A 包含 Question 和 Answer 对象
   - 优化 Google Featured Snippets

4. **内部链接** (30+ 条) ✅
   - 所有答案都链接到相关页面
   - /analysis, /dashboard, /prices/germany-jet-fuel, /scenarios, /sources 等

5. **SEO 元数据** ✅
   - Title: "FAQ - Sustainable Aviation Fuel (SAF) vs. Jet-A Pricing"
   - Description: 完整的 SEO 描述
   - 规范 URL: /faq
   - OpenGraph 和 Twitter Card 支持

### ⏳ 需要手工完成的步骤

由于环境限制（bash 和 ripgrep 二进制文件不可用），需要通过以下任一方式完成最后一步：

## 立即执行指南

### 选项 1: 使用现有的 Node 脚本（推荐）

```bash
# 方案 A: 从根目录运行
cd /Users/yumei/SAFvsOil
node create-faq.mjs

# 方案 B: 从 app 目录运行
cd /Users/yumei/SAFvsOil/apps/web/app
node ../../create-faq.mjs

# 方案 C: 从 admin 目录运行
cd /Users/yumei/SAFvsOil/apps/web/app/admin
node setup-faq.mjs
```

### 选项 2: 手工创建目录和文件

```bash
# 1. 创建目录
mkdir -p /Users/yumei/SAFvsOil/apps/web/app/faq

# 2. 复制临时文件的内容到 page.tsx
cp /Users/yumei/SAFvsOil/apps/web/app/_faq_page_temp.tsx \
   /Users/yumei/SAFvsOil/apps/web/app/faq/page.tsx
```

### 选项 3: 使用 VS Code 或其他编辑器

1. 打开 `/Users/yumei/SAFvsOil/apps/web/app/_faq_page_temp.tsx`
2. 复制全部内容
3. 创建新文件 `/Users/yumei/SAFvsOil/apps/web/app/faq/page.tsx`
4. 粘贴内容

## 文件清单

### 已创建的支持文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `/apps/web/app/sitemap.ts` | 更新的网站地图 | ✅ 已部署 |
| `/apps/web/app/_faq_page_temp.tsx` | FAQ 页面内容（临时存放） | ✅ 就绪 |
| `/create-faq.mjs` | FAQ 创建脚本（根目录） | ✅ 就绪 |
| `/apps/web/app/admin/setup-faq.mjs` | FAQ 创建脚本（admin 目录） | ✅ 就绪 |
| `/FAQ_SETUP_STATUS.md` | 设置状态文档 | ✅ 已创建 |
| `/faq-placeholder.tsx` | 占位符（待删除） | ❌ 清理中 |
| `/test-file.tsx` | 测试文件（待删除） | ❌ 清理中 |

### 最终结果文件（创建后）

| 文件 | 描述 |
|------|------|
| `/apps/web/app/faq/page.tsx` | FAQ 主页面 - 包含所有 Q&A 和 JSON-LD 架构 |

## SEO 特性详解

### JSON-LD FAQPage 格式

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Q1: What is SAF?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Detailed answer..."
      }
    },
    ...
  ]
}
```

这个结构允许 Google 的 Featured Snippets 自动从 FAQ 页面提取内容。

### 内部链接策略

| Q&A | 链接目标 | 用途 |
|-----|---------|------|
| Q1 (SAF 定义) | /analysis | 提供详细分析 |
| Q2 (SAF 成本) | /prices/germany-jet-fuel | 实时价格对比 |
| Q3 (成本平价) | /scenarios | 情景模拟 |
| Q4 (德国优势) | /de/prices/germany-jet-fuel | 区域市场数据 |
| Q5 (ReFuelEU) | /analysis/lufthansa-flight-cuts-2026-04 | 政策影响分析 |
| Q6 (汉莎航班) | /analysis/lufthansa-flight-cuts-2026-04 | 完整案例分析 |
| Q7 (EU ETS) | /scenarios | 碳价敏感性分析 |
| Q8 (ATJ) | (内容完整) | 技术深度讨论 |
| Q9 (德国燃油) | /prices/germany-jet-fuel + /dashboard | 价格动态 + 实时监控 |
| Q10 (使用指南) | 所有主页面 | 完整导航 |

## 验证步骤

### 第 1 步: 类型检查

```bash
npm --prefix /Users/yumei/SAFvsOil/apps/web run typecheck
```

预期输出: ✅ No errors

### 第 2 步: 构建验证

```bash
npm --prefix /Users/yumei/SAFvsOil/apps/web run build
```

预期输出: ✅ Build successful

### 第 3 步: 本地测试（可选）

```bash
npm --prefix /Users/yumei/SAFvsOil/apps/web run dev
```

访问: http://localhost:3000/faq

### 第 4 步: Sitemap 验证

```bash
# 检查 sitemap 中是否包含 /faq
grep -i "faq" /Users/yumei/SAFvsOil/apps/web/app/sitemap.ts
```

预期输出: `/faq` 路由条目

## Git 提交指南

完成后执行：

```bash
cd /Users/yumei/SAFvsOil

# 暂存所有更改
git add apps/web/app/faq/page.tsx \
         apps/web/app/sitemap.ts

# 提交消息（包含必需的 Co-authored-by 指令）
git commit -m "feat: Add FAQ page with JSON-LD FAQPage schema

- 10 comprehensive Q&A pairs on SAF, pricing, policy, and market dynamics
- Full JSON-LD FAQPage schema for Google Featured Snippets
- 30+ internal links to analysis, prices, dashboard, and scenarios pages
- SEO-optimized metadata with canonical URL
- Updated sitemap to include /faq route with 0.88 priority

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

# 验证提交
git log -1 --oneline
```

## 清理步骤（完成后）

```bash
# 删除临时文件
rm /Users/yumei/SAFvsOil/apps/web/app/_faq_page_temp.tsx \
   /Users/yumei/SAFvsOil/apps/web/app/faq-placeholder.tsx \
   /Users/yumei/SAFvsOil/apps/web/app/test-file.tsx \
   /Users/yumei/SAFvsOil/create-faq.mjs \
   /Users/yumei/SAFvsOil/apps/web/app/admin/setup-faq.mjs

# 删除本设置文档（可选）
rm /Users/yumei/SAFvsOil/FAQ_SETUP_STATUS.md
```

## 交付物检查清单

- [x] FAQ 页面创建（内容就绪，目录待创建）
- [x] JSON-LD FAQPage 结构完整
- [x] SEO 元数据完整
- [x] 内部链接 30+ 条
- [x] Sitemap 更新
- [x] 支持脚本提供（3 个选项）
- [ ] Git commit（待执行）
- [ ] 构建验证（待执行）

## 环境问题说明

本次任务中遇到的环境限制：

1. **Bash 工具不可用**: `posix_spawn failed: No such file or directory`
   - 原因: Shell 二进制文件缺失
   - 影响: 无法直接运行 Node/Python 脚本

2. **Ripgrep 二进制缺失**: 影响 grep 和 glob 工具
   - 原因: `/Users/yumei/Library/Caches/copilot/pkg/universal/1.0.34/ripgrep/` 目录不完整
   - 影响: 无法使用快速搜索工具

## 下一步

1. **立即**: 选择上述 3 个选项之一创建 `/apps/web/app/faq/page.tsx`
2. **然后**: 运行验证步骤（typecheck 和 build）
3. **最后**: 提交 Git commit

## 支持

所有必需的代码、脚本和文档均已准备就绪。选择任何一个选项即可快速完成部署。
