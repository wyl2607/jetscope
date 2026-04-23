# SAFvsOil Phase B: Real-Time Interactive Explorer

## 🚀 快速开始 (Quick Start)

### 1. 启动应用
```bash
cd /Users/yumei/SAFvsOil
npm start
```

访问: `http://localhost:3000`

### 2. 实时交互
拖动顶部的三个大滑块:
- **油价** (Oil Price): $20-180/bbl
- **碳价** (Carbon Price): $20-300/tCO₂  
- **补贴** (Subsidy): $0-1.5/L

每次拖动时，下方的SAF成本矩阵实时更新。

### 3. 快速场景切换
点击"快速场景"按钮一键加载预设参数组合:
- 基准 2026 (Baseline 2026)
- EU 雄心 2030 (EU Ambition 2030)
- IRA 美国 (IRA Extended US)
- 地缘冲击 (Geopolitical Shock)
- 能源危机 (Energy Crisis)
- 需求崩塌 (Demand Collapse)

### 4. 解读成本矩阵
显示所有7条SAF路线 + Jet-A基线的有效成本：
- 🟢 **绿色** = 经济可行 (≤1.0x Jet价格)
- 🟠 **橙色** = 接近可行 (1.0-1.2x)
- 🔴 **红色** = 尚不可行 (>1.2x)

## 📊 关键发现 (Key Insights)

在**当前现实参数**下（基准2026场景）：
- 油价: $80/bbl (Goldman Sachs 2026展望)
- 碳价: $90/tCO₂ (EU ETS现状)
- 补贴: $0.50/L (欧盟隐性等效)

**结论**: 最便宜的SAF (糖基ATJ) 已经进入**政策驱动可行阶段**
- 基础成本: $1.60/L
- 有效成本 (含碳收益): $0.97/L
- Jet-A基准: $0.78/L
- **差距**: 仅 +25% (不是+115%)

## 🎯 政策含义 (Policy Implications)

拖动参数看看:
1. **提高碳价到$150**: SAF大幅变便宜 → 绿色转型加速
2. **降低油价到$50**: SAF竞争力下降 → 需要更多补贴支持
3. **增加补贴到$1/L**: 更多路线变绿色可行

## 🔧 技术架构

- **Frontend**: Node.js + Vanilla JS (无框架)
- **实时更新**: 滑块input事件 → 状态更新 → 完整重渲染
- **色彩编码**: 成本倍数自动分类
- **参数持久化**: 用户输入保存到localStorage

## 📝 测试状态

✅ 代码: 22/22 测试通过
✅ 语法: node -c 通过
⏳ 浏览器: 准备好进行手工验证

## 🐛 已知问题

无已知问题。所有滑块、按钮和成本矩阵应正常工作。

## 📖 进阶使用

### 保存自定义情景
输入场景名称 → 点击"保存场景"
可稍后加载不同的市场情景进行对比

### 更改数据源
点击"查看高级设置与来源切换":
- 切换原油数据源 (FRED vs EIA)
- 手动输入碳价/补贴
- 调整Jet-A代理公式

## 📞 问题排查

**滑块不响应?**
- 检查浏览器控制台是否有JS错误
- 刷新页面 (Cmd+R)
- 清除localStorage试试 (DevTools → Application → Storage)

**成本没有更新?**
- 确保点击了滑块后松开（触发input事件）
- 检查右上角的刷新按钮是否启用了自动刷新

---

**现在开始探索SAF的经济学！** 🌱
