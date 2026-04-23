'use client';

import { useEffect, useState } from 'react';

interface MarketSnapshot {
  generated_at: string;
  source_status: {
    overall: string;
  };
  values: Record<string, number>;
  source_details: Record<string, {
    source: string;
    status: string;
    value: number | null;
    region?: string;
    confidence_score?: number;
  }>;
}

export default function ClientMarketData() {
  const [data, setData] = useState<MarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/market')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: MarketSnapshot) => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-700 bg-slate-900 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-slate-700 rounded w-1/3" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-16 bg-slate-800 rounded" />
            <div className="h-16 bg-slate-800 rounded" />
            <div className="h-16 bg-slate-800 rounded" />
          </div>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-lg border border-red-800/50 bg-red-950/20 p-6">
        <p className="text-red-300 text-sm">Marktdaten nicht verfügbar: {error || 'unknown'}</p>
      </section>
    );
  }

  const v = data.values;
  const brent = v.brent_usd_per_bbl ?? 0;
  const jetEu = v.jet_eu_proxy_usd_per_l ?? 0;
  const euEts = v.eu_ets_price_eur_per_t ?? 0;
  const germanyPremium = v.germany_premium_pct ?? 0;
  const rotterdam = v.rotterdam_jet_fuel_usd_per_l ?? 0;

  return (
    <section className="rounded-lg border border-sky-800/50 bg-slate-950 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-sky-300">Echtzeit-Marktdaten</h2>
        <span className={`text-xs px-2 py-1 rounded ${
          data.source_status?.overall === 'ok' ? 'bg-green-900/50 text-green-300' :
          data.source_status?.overall === 'degraded' ? 'bg-yellow-900/50 text-yellow-300' :
          'bg-red-900/50 text-red-300'
        }`}>
          {(data.source_status?.overall ?? 'unknown').toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard
          label="Brent"
          value={`$${brent.toFixed(2)}`}
          unit="USD/bbl"
          detail={data.source_details.brent}
        />
        <MetricCard
          label="Jet EU"
          value={`$${jetEu.toFixed(3)}`}
          unit="USD/L"
          detail={data.source_details.jet_eu_proxy ?? data.source_details.jet_eu_proxy_usd_per_l}
        />
        <MetricCard
          label="Rotterdam"
          value={`$${rotterdam.toFixed(3)}`}
          unit="USD/L"
          detail={data.source_details.rotterdam_jet_fuel}
        />
        <MetricCard
          label="EU ETS"
          value={`€${euEts.toFixed(2)}`}
          unit="EUR/tCO₂"
          detail={data.source_details.eu_ets ?? data.source_details.eu_ets_price_eur_per_t}
        />
        <MetricCard
          label="DE Premium"
          value={`+${germanyPremium.toFixed(1)}%`}
          unit="auf Jet"
          detail={data.source_details.germany_premium ?? data.source_details.germany_premium_pct}
          highlight
        />
      </div>

      <p className="text-xs text-slate-500">
        Stand: {new Date(data.generated_at).toLocaleString('de-DE')}
      </p>
    </section>
  );
}

function MetricCard({ label, value, unit, detail, highlight }: {
  label: string;
  value: string;
  unit: string;
  detail?: { status?: string; confidence_score?: number };
  highlight?: boolean;
}) {
  const statusColor = detail?.status === 'ok' ? 'border-green-800/50' :
    detail?.status === 'fallback' ? 'border-yellow-800/50' :
    'border-slate-800';

  return (
    <div className={`p-3 rounded border ${statusColor} ${highlight ? 'bg-sky-950/30' : 'bg-slate-900/50'}`}>
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-white mt-1">{value}</p>
      <p className="text-xs text-slate-500">{unit}</p>
      {detail?.confidence_score !== undefined && (
        <p className="text-xs text-slate-600 mt-1">
          conf: {(detail.confidence_score * 100).toFixed(0)}%
        </p>
      )}
    </div>
  );
}
