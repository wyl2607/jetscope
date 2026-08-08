import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
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
  if (state === 'live') return 'border-success bg-success-soft text-success';
  if (state === 'proxy') return 'border-accent bg-accent-soft text-accent';
  if (state === 'fallback') return 'border-warning bg-warning-soft text-warning';
  return 'border-danger bg-danger-soft text-danger';
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
  if (level === 'alert') return 'text-danger';
  if (level === 'watch') return 'text-warning';
  return 'text-success';
}

function actionToneClass(priority: SourceRow['reviewAction']['priority']): string {
  if (priority === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (priority === 'review') return 'border-warning bg-warning-soft text-warning';
  return 'border-line bg-surface-muted text-muted';
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
  const asOf = readModel.isFallback ? null : readModel.generatedAt;
  const needsReview = reviewRows.length;
  const reviewTone = needsReview > 0
    ? readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
      ? 'text-danger'
      : 'text-warning'
    : 'text-success';
  const trustTone = readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
    ? 'text-danger'
    : readModel.summary.proxyCount > 0
      ? 'text-warning'
      : 'text-success';
  const trustPosture = readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
    ? 'Degradierung prüfen'
    : readModel.summary.proxyCount > 0
      ? 'Mit Proxy-Quellen'
      : 'Live-Quellen bereit';

  return (
    <PageTemplate
      locale="de"
      eyebrow="Quellenprüfung"
      title="Quellenprüfung"
      question="Welche Markteingaben können aktuell noch nicht direkt als Entscheidungsgrundlage verwendet werden?"
      asOf={asOf}
    >
      <SignalRow label="Vertrauenssignale">
        <MetricCard
          label="Prüfzeilen"
          value={`${needsReview}`}
          valueClassName={`${reviewTone} tabular-nums`}
          hint={needsReview > 0 ? `${readModel.summary.fallbackCount} Fallback-, ${readModel.summary.degradedCount} eingeschränkte oder proxy-/volatilitätsmarkierte Zeilen.` : 'Keine Zeile braucht aktuell zusätzliche Prüfung.'}
        />
        <MetricCard
          label="Vertrauenshaltung"
          value={trustPosture}
          valueClassName={trustTone}
          hint={readModel.summary.trustLabel}
        />
        <MetricCard
          label="Durchschnittliche Konfidenz"
          value={`${Math.round(readModel.summary.averageConfidence * 100)}%`}
          valueClassName={`${trustTone} tabular-nums`}
          hint={`Abdeckung ${readModel.completeness.value == null ? '—' : `${Math.round(readModel.completeness.value)}%`} · ${readModel.summary.freshnessLabel}`}
        />
        <MetricCard
          label="Input-Struktur"
          value={`${readModel.summary.liveCount} live`}
          valueClassName="tabular-nums"
          hint={`Proxy ${readModel.summary.proxyCount} · Fallback ${readModel.summary.fallbackCount} · eingeschränkt ${readModel.summary.degradedCount}`}
        />
      </SignalRow>

      <Panel
        locale="de"
        title="Wiederherstellungsaktionen"
        why="Eingeschränkte Zeilen werden zu einer operativen Checkliste, damit eine Datenlücke nicht nur als Label stehen bleibt."
      >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              Prüfzeilen {reviewRows.length}
            </span>
            <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              Priorisierte Zeilen {actionRows.length}
            </span>
            <Link
              href={'/admin' as Route}
              className="rounded-xl border border-accent bg-accent-soft px-3 py-1.5 font-semibold text-accent hover:bg-accent-hover"
            >
              Admin-Aktualisierung öffnen
            </Link>
            <Link
              href={'/de/sources?filter=review' as Route}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 font-semibold text-muted hover:border-accent hover:bg-accent-soft"
            >
              Prüfzeilen anzeigen
            </Link>
            <Link
              href={'/de/dashboard' as Route}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 font-semibold text-muted hover:border-accent hover:bg-accent-soft"
            >
              Zurück zum Dashboard
            </Link>
          </div>
          {actionRows.length ? (
            <ol className="mt-4 divide-y divide-line border-y border-line">
              {actionRows.map((row) => {
                const action = reviewAction(row);
                return (
                  <li key={row.metricKey} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(10rem,14rem)_1fr_auto] md:items-start">
                    <div>
                      <p className="font-semibold text-ink">{surfaceLabel(row.metricKey)}</p>
                      <p className="mt-1 text-xs text-subtle">
                        {sourceLabel(row.source)} · {statusLabel(row.status)}
                      </p>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-xl border px-2.5 py-1 text-xs font-semibold ${actionToneClass(row.reviewAction.priority)}`}>
                        {action.label}
                      </span>
                      <p className="mt-2 leading-6 text-muted">{action.detail}</p>
                    </div>
                    <Link
                      href={action.href}
                      className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                    >
                      Aktion öffnen
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 border-y border-line py-3 text-sm leading-6 text-muted">
              Keine Fallback- oder Degradierungszeile ist aktuell kritisch. Proxy-Zeilen sollten vor größeren Preis-, Einkaufs- oder Offenlegungsentscheidungen trotzdem manuell geprüft werden.
            </p>
          )}
      </Panel>

      <Panel
        locale="de"
        title="Quellenmatrix"
        why="Jede Zeile verbindet Quelle, Zeit, Verzögerung, Wert und Aktion, damit Markteingaben vor ihrer Verwendung prüfbar bleiben."
      >
          <p className="mb-3 text-xs text-muted">
             {asOf ? `Generiert am ${new Date(asOf).toLocaleString('de-DE')}` : 'Generierungszeit ist kein Datenstand'}
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
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:bg-surface-muted'
                  }`}
                  title={filter.hint}
                >
                  {filter.label} <span className="ml-1 text-subtle">{count}</span>
                </Link>
              );
            })}
            <span className="text-xs text-subtle">
              Anzeige {visibleRows.length} / {readModel.rows.length}
            </span>
          </div>
          {focusMetricKey ? (
            <p className="mb-3 text-xs text-accent">
              Fokus von einer anderen Ansicht: <code>{focusMetricKey}</code>{' '}
              <Link href={clearFocusHref(activeFilter)} className="underline text-accent">
                Zurücksetzen
              </Link>
            </p>
          ) : null}
          <div className="overflow-x-auto">
             <table className="min-w-full text-left text-sm tabular-nums text-muted">
              <thead>
                <tr className="border-b border-line text-muted">
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
                      className={`border-b border-line ${
                        focusMetricKey === row.metricKey
                          ? 'ring-1 ring-accent/60 bg-accent-soft'
                          : row.alertLevel === 'alert'
                            ? 'bg-danger-soft'
                            : row.alertLevel === 'watch'
                              ? 'bg-warning-soft'
                              : ''
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-ink">{surfaceLabel(row.metricKey)}</td>
                      <td className="py-3 pr-4">{sourceLabel(row.source)}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] ${trustClass(row.trustState)}`}>
                          {trustLabel(row.trustState)}
                        </span>
                        <span className="mt-1 block text-xs text-subtle">{sourceTypeLabel(row)}</span>
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
                          <span className="text-subtle">n/a</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex min-w-24 flex-col gap-2">
                          <Link
                            href={sourceFocusHref(row.metricKey, activeFilter)}
                            className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                          >
                            Fokussieren
                          </Link>
                          <Link
                            href={action.href}
                            className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-muted hover:border-accent hover:bg-accent-soft"
                          >
                            {row.reviewAction.priority === 'normal' ? 'Dokumentieren' : 'Bearbeiten'}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="block text-muted">{reasonFor(row)}</span>
                        <span className="mt-2 block text-xs font-semibold text-muted">{action.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-subtle">{action.detail}</span>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-6 text-center text-sm text-subtle">
                      Keine Quellenzeilen passen zu diesem Filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'sources-read-model',
            label: readModel.isFallback
              ? `Quellen-Read-Model nicht verfügbar; Fallback-Schätzungen werden verwendet (${readModel.error ?? 'unbekannter Grund'})`
              : 'Quellen-Read-Model (Abdeckung, Konfidenz, Verzögerung, Fallback- und Prüfstatus)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          }
        ]}
        methodHref="/de/sources"
        methodLabel="Methode der Quellenabdeckung und Prüfung"
        limitations={[
          'Der Quellenstatus beschreibt die Qualität der Eingabe, nicht die Gültigkeit jedes Werts für jeden Flughafen, Vertrag oder Trade.',
          'Proxy-, abgeleitete, Fallback- und eingeschränkte Zeilen müssen vor wesentlichen Preis-, Einkaufs- oder Offenlegungsentscheidungen manuell geprüft werden.',
          'Die Fallback-Generierungszeit ist keine Beobachtungszeit; deshalb wird sie nicht als Datenstand ausgegeben.'
        ]}
      />
    </PageTemplate>
  );
}
