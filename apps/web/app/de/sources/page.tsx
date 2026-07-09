import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getSourcesReadModel, type SourcesReadModel } from '@/lib/sources-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Quellenprüfung',
  description:
    'Deutsche JetScope-Ansicht zur Prüfung von Marktdatenquellen, Fallback-Status, Vertrauen, Verzögerung und Wiederherstellungsaktionen.',
  path: '/de/sources',
  alternateLanguages: {
    'zh-CN': '/sources',
    de: '/de/sources',
    en: '/en/sources'
  }
});

type SourceRow = SourcesReadModel['rows'][number];
type SourceFilter = 'all' | 'review' | 'fallback' | 'proxy' | 'live';

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string; hint: string }> = [
  { key: 'all', label: 'Alle', hint: 'Vollständige Quellenmatrix' },
  { key: 'review', label: 'Prüfen', hint: 'Fallback, eingeschränkte, Proxy- oder Volatilitätszeilen' },
  { key: 'fallback', label: 'Fallback', hint: 'Zeilen mit Fallback- oder Seed-Werten' },
  { key: 'proxy', label: 'Proxy', hint: 'Abgeleitete oder proxybasierte Schätzungen' },
  { key: 'live', label: 'Live', hint: 'Primäre oder offizielle Live-Quellen' }
];

const SURFACE_LABELS: Record<string, string> = {
  brent_usd_per_bbl: 'Brent',
  jet_usd_per_l: 'Jet Fuel',
  carbon_proxy_usd_per_t: 'Carbon-Proxy',
  jet_eu_proxy_usd_per_l: 'EU-Jet-Proxy',
  rotterdam_jet_fuel_usd_per_l: 'Rotterdam Jet Fuel',
  eu_ets_price_eur_per_t: 'EU ETS',
  germany_premium_pct: 'Deutschland-Premium'
};
const READ_MODEL_NO_DATA = '\u65e0\u6570\u636e';
const READ_MODEL_COVERAGE_UNAVAILABLE = '\u8986\u76d6\u4e0d\u53ef\u7528';
const READ_MODEL_DERIVED_FALLBACK = '\u6d3e\u751f\u56de\u9000';
const READ_MODEL_FALLBACK = '\u56de\u9000';

function normalizeSourceFilter(filter: string | undefined): SourceFilter {
  if (filter === 'review' || filter === 'fallback' || filter === 'proxy' || filter === 'live') {
    return filter;
  }
  return 'all';
}

function rowMatchesSourceFilter(row: SourceRow, filter: SourceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'review') {
    return row.trustState !== 'live' || row.alertLevel !== 'normal' || row.status !== 'ok';
  }
  if (filter === 'fallback') return row.trustState === 'fallback' || row.status === 'seed' || row.status === 'fallback';
  if (filter === 'proxy') return row.trustState === 'proxy';
  return row.trustState === 'live';
}

function surfaceLabel(metricKey: string): string {
  return SURFACE_LABELS[metricKey] ?? metricKey;
}

function sourceLabel(value: string): string {
  if (!value || value === READ_MODEL_NO_DATA) return 'Keine Daten';
  if (value === READ_MODEL_COVERAGE_UNAVAILABLE) return 'Abdeckung nicht verfügbar';
  if (value === `Brent ${READ_MODEL_DERIVED_FALLBACK}`) return 'Brent-abgeleiteter Fallback';
  if (/[\u4e00-\u9fff]/.test(value)) return 'Abdeckung nicht verfügbar';
  return value
    .replaceAll(READ_MODEL_DERIVED_FALLBACK, 'abgeleiteter Fallback')
    .replaceAll(READ_MODEL_FALLBACK, 'Fallback');
}

function noDataLabel(value: string): string {
  return value === READ_MODEL_NO_DATA ? 'Keine Daten' : value;
}

function trustLabel(state: string): string {
  if (state === 'live') return 'Live';
  if (state === 'proxy') return 'Proxy';
  if (state === 'fallback') return 'Fallback';
  if (state === 'degraded') return 'Eingeschränkt';
  return state;
}

function trustClass(state: string): string {
  if (state === 'live') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (state === 'proxy') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (state === 'fallback') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'Gesund';
  if (status === 'seed') return 'Seed-Fallback';
  if (status === 'fallback') return 'Fallback';
  if (status === 'error') return 'Fehler';
  if (status === 'unknown') return 'Unbekannt';
  return status;
}

function sourceTypeLabel(row: SourceRow): string {
  if (row.trustState === 'live') return 'Primär oder offiziell';
  if (row.trustState === 'proxy') return 'Proxy oder abgeleitet';
  if (row.trustState === 'fallback') return 'Fallback-Pfad';
  return 'Untersuchung nötig';
}

function alertLabel(level: SourceRow['alertLevel']): string {
  if (level === 'alert') return 'Alarm';
  if (level === 'watch') return 'Beobachtung';
  return 'Normal';
}

function alertColor(level: SourceRow['alertLevel']): string {
  if (level === 'alert') return 'text-rose-700';
  if (level === 'watch') return 'text-amber-700';
  return 'text-emerald-700';
}

function actionToneClass(priority: SourceRow['reviewAction']['priority']): string {
  if (priority === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (priority === 'review') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function reviewAction(row: SourceRow): { label: string; detail: string; href: Route } {
  if (row.reviewAction.priority === 'critical') {
    return {
      label: 'Aktualisieren und verifizieren',
      detail: 'Nach konfiguriertem Admin-Token den Aktualisierungspfad auslösen und hier prüfen, ob die Kennzahl den Fallback- oder Fehlerzustand verlässt.',
      href: '/admin' as Route
    };
  }
  if (row.reviewAction.priority === 'review') {
    return {
      label: 'Proxy-Annahmen prüfen',
      detail: 'Vor relevanten Preis-, Einkaufs- oder Offenlegungsentscheidungen Originalnotierung, Policy-Basis und Berichtstext gegenprüfen.',
      href: '/reports' as Route
    };
  }
  return {
    label: 'Snapshot-Nachweis sichern',
    detail: 'Generierungszeit, Vertrauen und Quellenzustand dokumentieren, bevor diese Kennzahl in eine wesentliche Entscheidung einfließt.',
    href: '/de/dashboard' as Route
  };
}

function reasonFor(row: SourceRow): string {
  if (row.trustState === 'fallback') return 'Live-Abdeckung ist nicht verfügbar oder ein Fallback wurde genutzt.';
  if (row.status !== 'ok') return `Quellenstatus ist ${statusLabel(row.status)}.`;
  if (row.trustState === 'proxy') return 'Proxy oder abgeleitete Kennzahl; Annahmen vor wesentlicher Nutzung prüfen.';
  if (row.alertLevel !== 'normal') return `Jüngste Volatilität ist als ${alertLabel(row.alertLevel)} markiert.`;
  return 'Primäre oder offizielle Quelle ohne Degradierungsmarkierung.';
}

function sparklineDataUrl(encoded: string): string | null {
  if (!encoded) return null;
  const values = encoded
    .split(',')
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item));
  if (values.length < 2) return null;
  const width = 120;
  const height = 28;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = Number((index * step).toFixed(2));
      const y = Number((height - (value / 100) * height).toFixed(2));
      return `${x},${y}`;
    })
    .join(' ');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
    `<polyline fill='none' stroke='rgb(56 189 248)' stroke-width='2' points='${points}'/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function sourceFilterHref(filter: SourceFilter, focusMetricKey?: string): Route {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('filter', filter);
  if (focusMetricKey) params.set('focus', focusMetricKey);
  const query = params.toString();
  return (query ? `/de/sources?${query}` : '/de/sources') as Route;
}

function sourceFocusHref(metricKey: string, activeFilter: SourceFilter): Route {
  const params = new URLSearchParams();
  if (activeFilter !== 'all') params.set('filter', activeFilter);
  params.set('focus', metricKey);
  return `/de/sources?${params.toString()}` as Route;
}

function clearFocusHref(activeFilter: SourceFilter): Route {
  return (activeFilter === 'all' ? '/de/sources' : `/de/sources?filter=${activeFilter}`) as Route;
}

export default async function GermanSourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const focusRaw = resolvedParams?.focus;
  const filterRaw = resolvedParams?.filter;
  const focusMetricKey = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const activeFilter = normalizeSourceFilter(Array.isArray(filterRaw) ? filterRaw[0] : filterRaw);
  const readModel = await getSourcesReadModel();
  const visibleRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, activeFilter));
  const reviewRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, 'review'));
  const actionRows = reviewRows.filter((row) => row.reviewAction.priority !== 'normal').slice(0, 4);

  return (
    <Shell
      locale="de"
      eyebrow="Quellenprüfung"
      title="Quellenprüfung"
      description="Prüfe vor operativen Entscheidungen, ob jede Markteingabe live, proxygestützt oder im Fallback-Zustand ist."
    >
      <section className="grid gap-4 md:grid-cols-4">
        <InfoCard title="Live" subtitle="Primär oder offiziell">
          <p className="text-3xl font-semibold text-emerald-700">{readModel.summary.liveCount}</p>
        </InfoCard>
        <InfoCard title="Proxy" subtitle="Abgeleitete Annahmen">
          <p className="text-3xl font-semibold text-sky-700">{readModel.summary.proxyCount}</p>
        </InfoCard>
        <InfoCard title="Fallback" subtitle="Wiederherstellung nötig">
          <p className="text-3xl font-semibold text-amber-700">{readModel.summary.fallbackCount}</p>
        </InfoCard>
        <InfoCard title="Vertrauen" subtitle="Durchschnittliches Quellenvertrauen">
          <p className="text-3xl font-semibold text-slate-950">{Math.round(readModel.summary.averageConfidence * 100)}%</p>
        </InfoCard>
      </section>

      <section className="mt-6">
        <InfoCard
          title="Wiederherstellungsaktionen"
          subtitle={actionRows.length ? 'Eingeschränkte Zeilen als operative Checkliste' : 'Keine kritische Quellenwiederherstellung nötig'}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              Prüfzeilen {reviewRows.length}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              Priorisierte Zeilen {actionRows.length}
            </span>
            <Link
              href={'/admin' as Route}
              className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 font-semibold text-sky-800 hover:bg-sky-100"
            >
              Admin-Aktualisierung öffnen
            </Link>
            <Link
              href={'/de/sources?filter=review' as Route}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            >
              Prüfzeilen anzeigen
            </Link>
            <Link
              href={'/de/dashboard' as Route}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            >
              Zurück zum Dashboard
            </Link>
          </div>
          {actionRows.length ? (
            <ol className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {actionRows.map((row) => {
                const action = reviewAction(row);
                return (
                  <li key={row.metricKey} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(10rem,14rem)_1fr_auto] md:items-start">
                    <div>
                      <p className="font-semibold text-slate-950">{surfaceLabel(row.metricKey)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {sourceLabel(row.source)} · {statusLabel(row.status)}
                      </p>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${actionToneClass(row.reviewAction.priority)}`}>
                        {action.label}
                      </span>
                      <p className="mt-2 leading-6 text-slate-700">{action.detail}</p>
                    </div>
                    <Link
                      href={action.href}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                    >
                      Aktion öffnen
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 border-y border-slate-200 py-3 text-sm leading-6 text-slate-700">
              Keine Fallback- oder Degradierungszeile ist aktuell kritisch. Proxy-Zeilen sollten vor größeren Preis-, Einkaufs- oder Offenlegungsentscheidungen trotzdem manuell geprüft werden.
            </p>
          )}
        </InfoCard>
      </section>

      <section className="mt-6">
        <InfoCard title="Quellenmatrix" subtitle={`Gesamtstatus: ${statusLabel(readModel.overallStatus)}`}>
          <p className="mb-3 text-xs text-slate-600">
            Generiert am {new Date(readModel.generatedAt).toLocaleString('de-DE')}
            {readModel.isFallback ? ' | zeigt Fallback-Schätzungen, weil Live-Abdeckung nicht verfügbar ist' : ''}
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {SOURCE_FILTERS.map((filter) => {
              const count = readModel.rows.filter((row) => rowMatchesSourceFilter(row, filter.key)).length;
              const isActive = activeFilter === filter.key;
              return (
                <Link
                  key={filter.key}
                  href={sourceFilterHref(filter.key, focusMetricKey)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? 'border-sky-500 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
                  }`}
                  title={filter.hint}
                >
                  {filter.label} <span className="ml-1 text-slate-500">{count}</span>
                </Link>
              );
            })}
            <span className="text-xs text-slate-500">
              Anzeige {visibleRows.length} / {readModel.rows.length}
            </span>
          </div>
          {focusMetricKey ? (
            <p className="mb-3 text-xs text-sky-700">
              Fokus von einer anderen Ansicht: <code>{focusMetricKey}</code>{' '}
              <Link href={clearFocusHref(activeFilter)} className="underline text-sky-800">
                Zurücksetzen
              </Link>
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-3 pr-4">Kennzahl</th>
                  <th className="py-3 pr-4">Quelle</th>
                  <th className="py-3 pr-4">Vertrauen</th>
                  <th className="py-3 pr-4">Geltung</th>
                  <th className="py-3 pr-4">Konfidenz</th>
                  <th className="py-3 pr-4">Verzögerung</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Wert</th>
                  <th className="py-3 pr-4">1T</th>
                  <th className="py-3 pr-4">7T</th>
                  <th className="py-3 pr-4">30T</th>
                  <th className="py-3 pr-4">Volatilität</th>
                  <th className="py-3 pr-4">Trend</th>
                  <th className="py-3 pr-4">Aktion</th>
                  <th className="py-3">Begründung</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const action = reviewAction(row);
                  const sparkline = sparklineDataUrl(row.sparkline);
                  return (
                    <tr
                      key={row.surface}
                      id={`metric-${row.metricKey}`}
                      className={`border-b border-slate-200 ${
                        focusMetricKey === row.metricKey
                          ? 'ring-1 ring-sky-400/60 bg-sky-50'
                          : row.alertLevel === 'alert'
                            ? 'bg-rose-50'
                            : row.alertLevel === 'watch'
                              ? 'bg-amber-50'
                              : ''
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-slate-950">{surfaceLabel(row.metricKey)}</td>
                      <td className="py-3 pr-4">{sourceLabel(row.source)}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] ${trustClass(row.trustState)}`}>
                          {trustLabel(row.trustState)}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">{sourceTypeLabel(row)}</span>
                      </td>
                      <td className="py-3 pr-4">{row.scope}</td>
                      <td className="py-3 pr-4">{row.confidence}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.lag)}</td>
                      <td className="py-3 pr-4">{statusLabel(row.status)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.value)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.change1d)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.change7d)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.change30d)}</td>
                      <td className={`py-3 pr-4 font-medium ${alertColor(row.alertLevel)}`}>
                        {alertLabel(row.alertLevel)}
                      </td>
                      <td className="py-3 pr-4">
                        {sparkline ? (
                          <img
                            src={sparkline}
                            alt={`${surfaceLabel(row.metricKey)} Trend`}
                            width={120}
                            height={28}
                          />
                        ) : (
                          <span className="text-slate-500">n/a</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex min-w-24 flex-col gap-2">
                          <Link
                            href={sourceFocusHref(row.metricKey, activeFilter)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-center text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                          >
                            Fokussieren
                          </Link>
                          <Link
                            href={action.href}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-center text-xs font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                          >
                            {row.reviewAction.priority === 'normal' ? 'Dokumentieren' : 'Bearbeiten'}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="block text-slate-700">{reasonFor(row)}</span>
                        <span className="mt-2 block text-xs font-semibold text-slate-600">{action.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{action.detail}</span>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-6 text-center text-sm text-slate-500">
                      Keine Quellenzeilen passen zu diesem Filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </InfoCard>
      </section>
    </Shell>
  );
}
