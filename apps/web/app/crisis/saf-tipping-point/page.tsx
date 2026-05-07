import { Shell } from '@/components/shell';
import { getDashboardReadModel, toDecisionReadModel, toTippingPointReadModel } from '@/lib/product-read-model';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'SAF 临界点分析',
  description:
    '交互式分析传统航油价格在何种条件下会让可持续航空燃料（SAF）对欧洲航司具备经济竞争力。',
  path: '/crisis/saf-tipping-point'
});

export default async function SafTippingPointPage() {
  const readModel = await getDashboardReadModel();
  const tippingPoint = toTippingPointReadModel(readModel.tippingPoint);
  const airlineDecision = toDecisionReadModel(readModel.airlineDecision);
  const liveFuel = readModel.market.values?.jet_eu_proxy_usd_per_l ?? readModel.market.values?.jet_usd_per_l ?? 1.3;
  const liveCarbonUsd = readModel.market.values?.carbon_proxy_usd_per_t ?? 102.6;

  return (
    <Shell
      eyebrow="危机分析"
      title="SAF 临界点"
      description="定位可持续航空燃料（SAF）成为欧洲航空运营方理性选择的关键价格区间。"
    >
      {/* Top navigation */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/crisis/eu-jet-reserves"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-500 hover:text-slate-950"
        >
          ← 储备监测
        </Link>
        <Link
          href="/de/lufthansa-saf-2026"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-500 hover:text-slate-950"
        >
          Lufthansa 分析 →
        </Link>
      </div>

      {/* Introduction */}
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-bold text-slate-950">核心问题</h2>
        <p className="mt-3 text-slate-700 leading-relaxed">
          在什么燃油价格、碳价与供应约束下，SAF 会从
          <strong className="text-slate-800">合规成本</strong>转为
          <strong className="text-emerald-700">理性采购选择</strong>？
        </p>
        <p className="mt-4 text-sm text-slate-600">
          本页提供交互工具，用于评估航空燃料转型经济性。
          所有计算使用实时市场数据与最新 SAF 路径成本研究。
        </p>
      </section>

      <TippingPointWorkbench
        initialTippingPoint={tippingPoint}
        initialDecision={airlineDecision}
        initialReserveWeeks={readModel.reserve?.coverage_weeks ?? 3.0}
        liveDefaults={{
          fossilJetUsdPerL: liveFuel,
          carbonPriceEurPerT: Number((liveCarbonUsd / 1.08).toFixed(2)),
          subsidyUsdPerL: 0,
          blendRatePct: 6,
          reserveWeeks: readModel.reserve?.coverage_weeks ?? 3.0,
          pathwayKey: 'hefa'
        }}
      />

      {/* Source Coverage */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-bold text-slate-950 mb-4">数据来源与可信度</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">市场数据</h3>
            <p className="text-sm text-slate-700">
              Brent 原油、航油代理价与 EU ETS 价格来自实时来源或高置信度代理。
              来源元数据可在数据来源页查看。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">SAF 路径</h3>
            <p className="text-sm text-slate-700">
              成本曲线基于 2026 年研究（Energy Solutions、RMI、EASA）。
              路径成熟度分级：commercial、scaling、limited、future。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">储备信号</h3>
            <p className="text-sm text-slate-700">
              EU 航油储备估算由 IATA 与 EUROCONTROL 评估人工维护。
              每周更新。人工信号置信度为 0.62。
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600 mb-2">分析模型</h3>
            <p className="text-sm text-slate-700">
              临界点与航司决策引擎作为共享 Python 服务运行。
              模型与 API 合约由后端分析服务维护。
            </p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
