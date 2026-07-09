import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { AI_RESEARCH_ENABLED, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Tipping-Point Report',
  description:
    'English JetScope report detail for SAF tipping-point evidence, market source confidence, reserve stress, and research posture.',
  path: '/en/reports/tipping-point-analysis',
  alternateLanguages: {
    'zh-CN': '/reports/tipping-point-analysis',
    de: '/de/reports/tipping-point-analysis',
    en: '/en/reports/tipping-point-analysis'
  }
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatPrice(value: number | null | undefined): string {
  return `${formatNumber(value, 3)} USD/L`;
}

function formatPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'healthy';
  if (status === 'degraded') return 'degraded';
  if (status === 'offline') return 'offline';
  if (status === 'unknown') return 'unknown';
  return status;
}

function reserveStressLabel(level: string | undefined): string {
  if (level === 'critical') return 'critical';
  if (level === 'elevated') return 'elevated';
  if (level === 'normal') return 'normal';
  return 'review';
}

function researchPosture(status: string, count: number): string {
  if (!AI_RESEARCH_ENABLED) return 'disabled boundary';
  if (status === 'error') return 'degraded';
  if (status === 'not_found') return 'not deployed';
  return count > 0 ? 'signal-backed' : 'waiting for signals';
}

export default async function EnglishTippingPointReportPage() {
  const [readModel, reserve, events, research] = await Promise.all([
    getDashboardReadModel('en'),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 20 }),
    getResearchSignals()
  ]);
  const sourceStatus = readModel.market.source_status;
  const tippingPoint = readModel.tippingPoint;
  const decision = readModel.airlineDecision;
  const reserveWeeks = reserve?.coverage_weeks ?? readModel.reserve?.coverage_weeks ?? null;
  const latestEvent = events[0] ?? null;
  const fossilPrice =
    tippingPoint?.effective_fossil_jet_usd_per_l ??
    readModel.market.values.jet_eu_proxy_usd_per_l ??
    readModel.market.values.jet_usd_per_l;
  const hefaPathway = tippingPoint?.pathways.find((pathway) => pathway.pathway_key === 'hefa') ?? tippingPoint?.pathways[0];
  const switchProbability = Math.round(
    Math.max(
      decision?.probabilities.buy_spot_saf ?? 0,
      decision?.probabilities.sign_long_term_offtake ?? 0
    ) * 100
  );
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(research.status, research.signals.length);

  return (
    <Shell
      locale="en"
      eyebrow="Report detail"
      title="Tipping-Point Report"
      description="A localized, source-backed report view for deciding whether SAF is moving from compliance cost toward operating logic."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Fossil effective cost"
          value={formatPrice(fossilPrice)}
          hint={`Signal: ${tippingPoint?.signal ?? 'review'} | blend ${formatPercent(tippingPoint?.inputs.blend_rate_pct)}`}
        />
        <MetricCard
          label="SAF pathway spread"
          value={hefaPathway ? `${formatNumber(hefaPathway.spread_low_pct, 0)}-${formatNumber(hefaPathway.spread_high_pct, 0)}%` : 'n/a'}
          hint={hefaPathway ? `${hefaPathway.display_name} net cost ${formatPrice(hefaPathway.net_cost_low_usd_per_l)}-${formatPrice(hefaPathway.net_cost_high_usd_per_l)}` : 'No pathway model returned by the API.'}
        />
        <MetricCard
          label="Reserve stress"
          value={reserveWeeks == null ? 'n/a' : `${formatNumber(reserveWeeks, 1)} weeks`}
          hint={`EU reserve posture: ${reserveStressLabel(reserve?.stress_level ?? readModel.reserve?.stress_level)}`}
        />
        <MetricCard
          label="Decision probability"
          value={`${switchProbability}%`}
          hint="Maximum probability across spot SAF purchase and long-term offtake actions."
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <InfoCard title="Core argument" subtitle="Evidence chain for reviewers">
          <div className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              JetScope treats the tipping point as a convergence of fossil fuel cost, carbon exposure, reserve stress,
              and the SAF pathway spread. This page uses the same FastAPI-backed read models as the cockpit and keeps
              source quality visible before any report is treated as decision evidence.
            </p>
            <p>
              The current source status is <strong>{sourceStatusLabel(sourceStatus.overall)}</strong> with source
              confidence at <strong>{sourceConfidence}</strong>. If fallback or degraded rows are active, the report
              remains readable but should be routed through source review before publication.
            </p>
          </div>
        </InfoCard>

        <InfoCard title="Source confidence" subtitle="Launch-review posture">
          <dl className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-4">
              <dt>Market status</dt>
              <dd className="font-semibold text-slate-950">{sourceStatusLabel(sourceStatus.overall)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Fallback rate</dt>
              <dd className="font-semibold text-slate-950">{formatPercent(sourceStatus.fallback_rate)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Latest event</dt>
              <dd className="font-semibold text-slate-950">{latestEvent ? latestEvent.event_type.toLowerCase() : 'none'}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Research posture</dt>
              <dd className="font-semibold text-slate-950">{researchStatus}</dd>
            </div>
          </dl>
        </InfoCard>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        {[
          {
            title: 'Review market sources',
            description: 'Check live, proxy, fallback, and degraded inputs before using the report externally.',
            href: '/en/sources?filter=review' as Route
          },
          {
            title: 'Compare scenario assumptions',
            description: 'Confirm saved assumptions and protected write boundaries before changing procurement posture.',
            href: '/en/scenarios' as Route
          },
          {
            title: 'Return to report workbench',
            description: 'Use the landing page to review launch posture and report catalog status.',
            href: '/en/reports' as Route
          }
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70 transition hover:border-sky-300 hover:bg-sky-50"
          >
            <p className="text-base font-semibold text-slate-950">{action.title}</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{action.description}</p>
          </Link>
        ))}
      </section>
    </Shell>
  );
}
