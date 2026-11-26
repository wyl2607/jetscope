'use client';

import { useEffect, useState } from 'react';
import type { SourceCoverageMetric, SourceCoverageResponse } from '@/lib/source-coverage-contract';

interface MarketSnapshot {
  generated_at: string;
  source_status: {
    overall: string;
  };
  values: Record<string, number | null>;
}

type MetricDisplay = {
  text: string;
  badge: string | null;
  missing: boolean;
};

const MISSING_LABEL = 'Daten fehlen';
const STALE_LABEL = 'veraltet';
const ESTIMATED_LABEL = 'geschätzt';

function metricDisplay(
  raw: number | null | undefined,
  detail: SourceCoverageMetric | undefined,
  format: (value: number) => string
): MetricDisplay {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  const status = detail?.status;
  const degraded = Boolean(detail?.fallback_used) ||
    status === 'seed' || status === 'fallback' || status === 'missing' ||
    status === 'error' || status === 'unavailable';

  if (value == null || degraded) {
    return { text: '—', badge: MISSING_LABEL, missing: true };
  }
  if (status === 'stale') {
    return { text: format(value), badge: STALE_LABEL, missing: false };
  }
  if (status === 'estimated') {
    return { text: format(value), badge: ESTIMATED_LABEL, missing: false };
  }
  if (detail && status !== 'live' && status !== 'ok') {
    return { text: '—', badge: MISSING_LABEL, missing: true };
  }
  return { text: format(value), badge: null, missing: false };
}

export default function ClientMarketData() {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [coverageByMetric, setCoverageByMetric] = useState<Record<string, SourceCoverageMetric>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetch('/api/market')
      .then(r => {
        if (!r.ok) throw new Error(`market HTTP ${r.status}`);
        return r.json() as Promise<MarketSnapshot>;
      })
      .then((marketSnapshot) => {
        if (!isMounted) return;
        setData(marketSnapshot);
        setLoading(false);

        fetch('/api/sources')
          .then(r => {
            if (!r.ok) return null;
            return r.json() as Promise<SourceCoverageResponse>;
          })
          .then((sourceCoverage) => {
            if (!isMounted) return;
            setCoverageByMetric(
              Object.fromEntries(
                (sourceCoverage?.metrics ?? []).map((metric) => [metric.metric_key, metric])
              )
            );
          })
          .catch(() => {});
      })
      .catch(e => {
        if (!isMounted) return;
        setError(e.message);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <section className="rounded-lg border border-line bg-surface p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-surface rounded w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-16 bg-surface rounded" />
            <div className="h-16 bg-surface rounded" />
            <div className="h-16 bg-surface rounded" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-lg border border-danger bg-danger-soft p-6">
        <p className="text-danger text-sm">Marktdaten nicht verfügbar: {error || 'unbekannte Ursache'}</p>
      </section>
    );
  }

  const v = data.values;
  const brent = metricDisplay(v.brent_usd_per_bbl, coverageByMetric.brent_usd_per_bbl, (value) => `$${value.toFixed(2)}`);
  const jetEu = metricDisplay(v.jet_eu_proxy_usd_per_l, coverageByMetric.jet_eu_proxy_usd_per_l, (value) => `$${value.toFixed(3)}`);
  const rotterdam = metricDisplay(v.rotterdam_jet_fuel_usd_per_l, coverageByMetric.rotterdam_jet_fuel_usd_per_l, (value) => `$${value.toFixed(3)}`);
  const euEts = metricDisplay(v.eu_ets_price_eur_per_t, coverageByMetric.eu_ets_price_eur_per_t, (value) => `€${value.toFixed(2)}`);
  const germanyPremium = metricDisplay(v.germany_premium_pct, coverageByMetric.germany_premium_pct, (value) => `+${value.toFixed(1)}%`);
  const sourceStatus = data.source_status?.overall ?? 'unknown';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
        <span className={`text-xs px-2 py-1 rounded ${
          sourceStatus === 'ok' ? 'bg-success-soft text-success' :
          sourceStatus === 'degraded' ? 'bg-warning-soft text-warning' :
          'bg-danger-soft text-danger'
        }`}>
          {sourceStatusLabel(sourceStatus)}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard
          label="Brent"
          value={brent.text}
          unit="USD/bbl"
          detail={coverageByMetric.brent_usd_per_bbl}
          badge={brent.badge}
          missing={brent.missing}
        />
        <MetricCard
          label="Jet EU"
          value={jetEu.text}
          unit="USD/L"
          detail={coverageByMetric.jet_eu_proxy_usd_per_l}
          badge={jetEu.badge}
          missing={jetEu.missing}
        />
        <MetricCard
          label="Rotterdam"
          value={rotterdam.text}
          unit="USD/L"
          detail={coverageByMetric.rotterdam_jet_fuel_usd_per_l}
          badge={rotterdam.badge}
          missing={rotterdam.missing}
        />
        <MetricCard
          label="EU ETS"
          value={euEts.text}
          unit="EUR/tCO₂"
          detail={coverageByMetric.eu_ets_price_eur_per_t}
          badge={euEts.badge}
          missing={euEts.missing}
        />
        <MetricCard
          label="DE-Aufschlag"
          value={germanyPremium.text}
          unit="auf Jet"
          detail={coverageByMetric.germany_premium_pct}
          badge={germanyPremium.badge}
          missing={germanyPremium.missing}
          highlight
        />
      </div>

      <p className="text-xs text-muted">
        Stand: {new Date(data.generated_at).toLocaleString('de-DE')}
      </p>
    </section>
  );
}

function MetricCard({ label, value, unit, detail, highlight, badge, missing }: {
  label: string;
  value: string;
  unit: string;
  detail?: SourceCoverageMetric;
  highlight?: boolean;
  badge?: string | null;
  missing?: boolean;
}) {
  const statusColor = missing ? 'border-danger' :
    detail?.fallback_used || detail?.status === 'seed' ? 'border-warning' :
    detail?.status === 'ok' ? 'border-success' :
    detail?.status === 'stale' || detail?.status === 'estimated' ? 'border-warning' :
    detail ? 'border-danger' :
    'border-line';

  return (
    <div className={`p-3 rounded border ${statusColor} ${highlight ? 'bg-accent-soft' : 'bg-surface-muted'}`}>
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-ink mt-1">{value}</p>
      <p className="text-xs text-muted">{unit}</p>
      {badge && (
        <p className={`text-xs mt-1 ${missing ? 'text-danger' : 'text-warning'}`}>{badge}</p>
      )}
      {detail?.confidence_score !== undefined && (
        <p className="text-xs text-muted mt-1">
          Vertrauen: {(detail.confidence_score * 100).toFixed(0)}%
        </p>
      )}
    </div>
  );
}

function sourceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ok: 'OK',
    degraded: 'EINGESCHRÄNKT',
    offline: 'OFFLINE',
    unknown: 'UNBEKANNT'
  };
  return labels[status] ?? status.toUpperCase();
}
