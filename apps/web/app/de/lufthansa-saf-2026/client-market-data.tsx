'use client';

import { useEffect, useState } from 'react';
import type { SourceCoverageMetric, SourceCoverageResponse } from '@/lib/source-coverage-contract';

interface MarketSnapshot {
  generated_at: string;
  source_status: {
    overall: string;
  };
  values: Record<string, number>;
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
  const brent = v.brent_usd_per_bbl ?? 0;
  const jetEu = v.jet_eu_proxy_usd_per_l ?? 0;
  const euEts = v.eu_ets_price_eur_per_t ?? 0;
  const germanyPremium = v.germany_premium_pct ?? 0;
  const rotterdam = v.rotterdam_jet_fuel_usd_per_l ?? 0;
  const sourceStatus = data.source_status?.overall ?? 'unknown';

  return (
    <section className="rounded-lg border border-accent bg-surface p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-accent">Echtzeit-Marktdaten</h2>
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
          value={`$${brent.toFixed(2)}`}
          unit="USD/bbl"
          detail={coverageByMetric.brent_usd_per_bbl}
        />
        <MetricCard
          label="Jet EU"
          value={`$${jetEu.toFixed(3)}`}
          unit="USD/L"
          detail={coverageByMetric.jet_eu_proxy_usd_per_l}
        />
        <MetricCard
          label="Rotterdam"
          value={`$${rotterdam.toFixed(3)}`}
          unit="USD/L"
          detail={coverageByMetric.rotterdam_jet_fuel_usd_per_l}
        />
        <MetricCard
          label="EU ETS"
          value={`€${euEts.toFixed(2)}`}
          unit="EUR/tCO₂"
          detail={coverageByMetric.eu_ets_price_eur_per_t}
        />
        <MetricCard
          label="DE-Aufschlag"
          value={`+${germanyPremium.toFixed(1)}%`}
          unit="auf Jet"
          detail={coverageByMetric.germany_premium_pct}
          highlight
        />
      </div>

      <p className="text-xs text-muted">
        Stand: {new Date(data.generated_at).toLocaleString('de-DE')}
      </p>
    </section>
  );
}

function MetricCard({ label, value, unit, detail, highlight }: {
  label: string;
  value: string;
  unit: string;
  detail?: SourceCoverageMetric;
  highlight?: boolean;
}) {
  const statusColor = detail?.fallback_used || detail?.status === 'seed' ? 'border-warning' :
    detail?.status === 'ok' ? 'border-success' :
    detail ? 'border-danger' :
    'border-line';

  return (
    <div className={`p-3 rounded border ${statusColor} ${highlight ? 'bg-accent-soft' : 'bg-surface-muted'}`}>
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-ink mt-1">{value}</p>
      <p className="text-xs text-muted">{unit}</p>
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
