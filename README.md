# SAFvsOil

本地随机端口运行的 SAF vs Oil 网页工具。

## 当前仓库模式

现在仓库进入双轨：

- **Phase 0 prototype**
  - 当前 Node 原型仍可运行
  - 用于继续验证交互、计算逻辑、scenario UX
- **Phase B product scaffold**
  - `apps/web`：Next.js 产品前端脚手架
  - `apps/api`：FastAPI 产品后端脚手架
  - `infra/docker-compose.yml`：本地 PostgreSQL 开发基础

产品方向采用：
- 前端：Next.js + TypeScript + Tailwind
- 后端：FastAPI
- 数据库：PostgreSQL
- 后台：admin 必做

## 当前版本做了什么

- 用公开源抓取最新市场数据：
  - Brent：FRED / EIA、EIA Daily Prices
  - Jet fuel spot：FRED / EIA Gulf Coast jet fuel
  - Carbon proxy：European Commission CBAM certificate price + ECB EUR/USD
- 用你给定的 2024–2025 SAF 路线成本做可编辑基线
- 实时计算：
  - `P_jet(proxy) = slope × crude + intercept`
  - `P_SAF有效 = P_SAF基础 − Carbon × ΔCO₂ − Subsidy`
  - 各路线盈亏平衡油价与竞争力
- 支持比较口径切换：
  - 按 crude proxy
  - 按 live jet spot（可用时）
- 支持按钮强制刷新与自动轮询刷新
- 支持本地持久化两层：
  - 浏览器本地快照：自动保存当前场景
  - 服务器本地 JSON：点击按钮显式保存到 `data/local-preferences.json`
- 支持命名 scenario：
  - 保存当前 scenario
  - 加载已保存 scenario
  - 删除已保存 scenario
  - 对比当前工作态与所选 scenario 的差异项
- 支持“恢复发货默认”：不会误回到上次服务器保存值，而是回到研究基线
- 新增盈亏平衡图和数据源对比卡，方便快速判断哪条 SAF 路线最接近切换阈值
- 当前 UI 已切换为更接近 Linear 的研究控制台风格，并支持亮色 / 深色模式切换
- 高频输入现在会批处理重绘与浏览器本地写入，减少连续编辑时的抖动
- 展示 ReFuelEU 航空时间表
- 默认监听随机端口（`PORT` 未指定时使用 `0`）

## 运行

### 运行当前 Node 原型

```bash
npm start
```

启动后终端会打印：

```bash
SAFvsOil running at http://127.0.0.1:随机端口
```

英文镜像页：

```bash
http://127.0.0.1:随机端口/en
```

### 产品脚手架准备命令

前端：

```bash
cd apps/web
npm install
npm run dev
```

后端：

```bash
cd apps/api
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

> 当前机器上后端建议固定用 **Python 3.13**。`Python 3.14 + pydantic-core` 在本轮验证里不兼容，已经实际踩过。
> 写接口默认需要 `x-admin-token`，本地默认值由 `SAFVSOIL_ADMIN_TOKEN` 控制（默认 `dev-admin-token-change-me`）。

数据库迁移（Alembic）：

```bash
npm run api:migrate
```

数据库：

```bash
cd infra
docker compose up -d
```

## 数据源说明

- Brent（live）
  - FRED / EIA `DCOILBRENTEU`
  - EIA Daily Prices 页面
- Jet fuel（live）
  - FRED / EIA `DJFUELUSGULF`
- Carbon（semi-live proxy）
  - 默认优先使用 CBAM 官方价格页面叠加 ECB 汇率生成 USD/tCO₂ 代理值
  - 如果官方页面暂时抓不到，则自动回退为手动输入
- Policy（reference）
  - ReFuelEU Aviation 官方页面 / 规则时间表
- SAF route costs
  - 当前仍是研究基线，不是假装“实时现货”；公开、免授权、稳定的 SAF 现货 API 仍然稀缺，所以前端保留本地可编辑能力

## 可用工作流

1. `npm start`
2. 打开终端打印的随机端口
3. 选择原油/碳价来源，或切回 `manual`
4. 调整路线成本、补贴、proxy 参数
5. 给当前状态命名后点击“保存当前 scenario”
6. 需要跨服务重启保留时，点击“保存到服务器”
7. 要回到研究基线时，点击“恢复发货默认”
8. 如果需要英文前端，直接打开 `/en`

## 验证

```bash
npm run check
npm test
npm run test:e2e
npm run preflight
```
