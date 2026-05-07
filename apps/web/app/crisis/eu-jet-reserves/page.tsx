import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { getReserveSeverity } from '@/lib/market-signals';
import { getDashboardReadModel } from '@/lib/product-read-model';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'EU 航油储备危机监测',
  description:
    '实时跟踪欧洲航油储备、价格冲击与 SAF 竞争力拐点的危机看板。',
  path: '/crisis/eu-jet-reserves'
});

// ---------------------------------------------------------------------------
// Reserve data — currently manually maintained (no public API for EU reserves).
// Update weekly. Format: { weeks: number, updatedAt: ISO, source: string }
// Override via SAFVSOIL_RESERVE_WEEKS env at build time if needed.
// ---------------------------------------------------------------------------
function getReserveData(): { weeks: number; updatedAt: string; source: string; nextUpdate: string } {
  const raw = process.env.SAFVSOIL_RESERVE_WEEKS;
  const weeks = Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : 3.0;
  const updatedAt = '2026-04-23T06:00:00Z';
  return {
    weeks,
    updatedAt,
    source: 'IATA / EUROCONTROL estimates (manually curated)',
    nextUpdate: '2026-04-30T06:00:00Z'
  };
}

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function CurrentSafBreakpointRow() {
  const jetA = (115 / 158.987) * 1.20;
  const premiumLow = ((1.60 / jetA) - 1) * 100;
  const premiumHigh = ((1.85 / jetA) - 1) * 100;

  return (
    <tr className="ring-2 ring-amber-300 bg-amber-50 text-slate-950 shadow-sm">
      <td className="py-4 pr-4 font-semibold">
        <span className="mr-2 rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          当前拐点
        </span>
        $115/bbl（当前）
      </td>
      <td className="py-4 pr-4 font-semibold">~${formatNumber(jetA, 2)}/L</td>
      <td className="py-4 pr-4">$1.60–1.85/L</td>
      <td className="py-4 pr-4 font-semibold text-amber-700">
        +{formatNumber(premiumLow, 0)}–{formatNumber(premiumHigh, 0)}%
      </td>
      <td className="py-4 font-semibold text-amber-800">拐点区间</td>
    </tr>
  );
}

export default async function EuJetReserveCrisisPage() {
  const [readModel, priceChartData] = await Promise.all([
    getDashboardReadModel(),
    getPriceTrendChartReadModel()
  ]);

  const fallbackReserve = getReserveData();
  const reserve = readModel.reserve
    ? {
        weeks: readModel.reserve.coverage_weeks,
        updatedAt: readModel.reserve.generated_at,
        source: readModel.reserve.source_name,
        nextUpdate: fallbackReserve.nextUpdate
      }
    : fallbackReserve;
  const level = getReserveSeverity(reserve.weeks);
  const market = readModel.market.values;

  const brent = market.brent_usd_per_bbl ?? 114.93;
  const jetEu = market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l ?? 0.99;
  const carbon = market.carbon_proxy_usd_per_t ?? 88.79;

  // SAF competitiveness gap at current prices
  const safHeffaLow = 1.60;
  const safHeffaHigh = 1.85;
  const safSpreadLow = ((safHeffaLow - jetEu) / jetEu) * 100;
  const safSpreadHigh = ((safHeffaHigh - jetEu) / jetEu) * 100;

  return (
    <Shell
      eyebrow="危机监测"
      title="EU 航油储备危机"
      description="欧洲正在面对结构性航空燃料挤压。本看板实时跟踪储备水平、价格冲击与 SAF 竞争力拐点。"
    >
      {/* Top alert banner */}
      <section className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className={`text-sm font-semibold uppercase tracking-wider ${level.color}`}>{level.label}</p>
            <p className="mt-1 text-4xl font-bold text-slate-950">
              {formatNumber(reserve.weeks, 1)} <span className="text-lg font-medium text-slate-600">周</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">
              更新于 {formatDate(reserve.updatedAt)} · 下次更新：{formatDate(reserve.nextUpdate)} · {reserve.source}
            </p>
          </div>
          <div className="w-full md:w-1/2">
            <div className="h-4 w-full overflow-hidden rounded-full bg-white">
              <div
                className={`h-full ${level.barColor} transition-all duration-500`}
                style={{ width: `${Math.min(100, Math.max(5, (reserve.weeks / 8) * 100))}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-600">
              <span>0w</span>
              <span className="text-rose-700">2周（严重）</span>
              <span className="text-amber-700">4周（偏高）</span>
              <span className="text-emerald-700">8周+（正常）</span>
            </div>
          </div>
        </div>
      </section>

      {/* Market snapshot row */}
      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Brent 原油" subtitle="全球基准">
          <p className="text-3xl font-semibold text-slate-950">${formatNumber(brent)}/bbl</p>
          <p className="mt-2 text-xs text-slate-600">
            每 $1/bbl 波动约对应 ${formatNumber(1 / 158.987, 4)} USD/L 航油影响
          </p>
        </InfoCard>

        <InfoCard title="航油（EU 代理）" subtitle="ARA / Rotterdam basis">
          <p className="text-3xl font-semibold text-slate-950">${formatNumber(jetEu, 3)}/L</p>
          <p className="mt-2 text-xs text-slate-600">
            与储备稀缺直接相关。价格越高，有效储备压力越大。
          </p>
        </InfoCard>

        <InfoCard title="碳价代理" subtitle="CBAM + EU ETS 压力">
          <p className="text-3xl font-semibold text-slate-950">${formatNumber(carbon)}/tCO₂</p>
          <p className="mt-2 text-xs text-slate-600">
            当碳价达到 €150/tCO₂（2030 目标）时，SAF 盈亏平衡会明显前移。
          </p>
        </InfoCard>
      </section>

      {/* Narrative chain */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold text-slate-950">危机链条：储备 → 价格 → SAF 拐点</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">步骤 1</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">储备消耗</p>
            <p className="mt-1 text-xs text-slate-700">
              EU 航油库存降至约 {formatNumber(reserve.weeks, 1)} 周。地缘扰动与炼化瓶颈共同推高压力。
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">步骤 2</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">价格跳升</p>
            <p className="mt-1 text-xs text-slate-700">
              Jet-A 现货随稀缺性上行。当前 EU 代理价 ${formatNumber(jetEu, 3)}/L，高于 2024 年约 $0.75/L 的水平。
            </p>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-yellow-700">步骤 3</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">航线经济性承压</p>
            <p className="mt-1 text-xs text-slate-700">
              短途航线利润率被压缩（燃油约占成本 30%）。Lufthansa 已削减 20,000 个航班。
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">步骤 4</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">SAF 采购变得理性</p>
            <p className="mt-1 text-xs text-slate-700">
              HEFA SAF 当前较 Jet-A 高 {formatNumber(safSpreadLow, 0)}–{formatNumber(safSpreadHigh, 0)}%。当油价达到 $130/bbl，SAF 具备胜出条件。
            </p>
          </div>
        </div>
      </section>

      {/* SAF competitiveness table */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold text-slate-950">当前与压力情景下的 SAF 竞争力</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2 text-sm text-slate-700">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-3 pr-4">油价情景</th>
                <th className="py-3 pr-4">Jet-A 成本</th>
                <th className="py-3 pr-4">HEFA SAF 成本</th>
                <th className="py-3 pr-4">SAF 溢价</th>
                <th className="py-3">信号</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-slate-50">
                <td className="py-3 pr-4">$80/bbl（2024 基准）</td>
                <td className="py-3 pr-4">~$0.95/L</td>
                <td className="py-3 pr-4">$1.60–1.85/L</td>
                <td className="py-3 pr-4 text-rose-700">+70–95%</td>
                <td className="py-3 text-rose-700">SAF 经济性不足</td>
              </tr>
              <CurrentSafBreakpointRow />
              <tr className="bg-slate-50">
                <td className="py-3 pr-4">$130/bbl（压力）</td>
                <td className="py-3 pr-4">~${formatNumber((130 / 158.987) * 1.20, 2)}/L</td>
                <td className="py-3 pr-4">$1.60–1.85/L</td>
                <td className="py-3 pr-4 text-yellow-700">+{formatNumber(((1.60 / ((130 / 158.987) * 1.20)) - 1) * 100, 0)}–{formatNumber(((1.85 / ((130 / 158.987) * 1.20)) - 1) * 100, 0)}%</td>
                <td className="py-3 text-yellow-700">边际切换</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="py-3 pr-4">$150/bbl（2030 预测）</td>
                <td className="py-3 pr-4">~${formatNumber((150 / 158.987) * 1.20, 2)}/L</td>
                <td className="py-3 pr-4">$1.20–1.40/L (scaled)</td>
                <td className="py-3 pr-4 text-emerald-700">−10 to +15%</td>
                <td className="py-3 text-emerald-700">SAF 占优</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Lufthansa context */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold text-slate-950">Lufthansa 削减航班：领先指标</h2>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          2026 年 4 月，Lufthansa 宣布取消 <strong>20,000 个短途航班</strong>。
          表层原因是降本；更深层逻辑是航空能源经济性已经到达拐点。
          燃油目前约占短途运营成本的 30%。在当前航油价格下，
          利润率仅 2–3% 的航线会转为亏损。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={"/de/lufthansa-saf-2026" as Route}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            德语分析 →
          </Link>
          <Link
            href="/analysis/lufthansa-flight-cuts-2026-04"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-500 hover:text-slate-950"
          >
            中文完整分析 →
          </Link>
        </div>
      </section>

      {/* Price trends */}
      <section className="mt-8">
        <InfoCard title="历史价格趋势" subtitle="1d / 7d / 30d — 与驾驶舱使用同一数据，来自本地 market_snapshots 历史库">
          <PriceTrendsChart
            metrics={priceChartData.metrics}
            isLoading={false}
            error={priceChartData.error}
          />
        </InfoCard>
      </section>

      {/* Action checklist */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold text-slate-950">运营方决策清单</h2>
        <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
          <li className="flex gap-3">
            <span className="text-rose-700">✗</span>
            <span><strong>观望</strong> — 这样的低储备水平在历史上通常先于配给或价格跳升出现。继续等待会增加敞口。</span>
          </li>
          <li className="flex gap-3">
            <span className="text-amber-700">△</span>
            <span><strong>远期套保</strong> — 若交易对手仍提供固定价格航油合约，应尽快锁定。窗口正在收窄。</span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-700">✓</span>
            <span><strong>锁定 SAF offtake</strong> — 在 2025–2026 年需求上行前，立即谈判长期 SAF 采购协议（LOI）。</span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-700">✓</span>
            <span><strong>持续监测本看板</strong> — 储备估算每周更新，市场数据每 10 分钟更新。建议用于每日检查。</span>
          </li>
        </ul>
      </section>
    </Shell>
  );
}
