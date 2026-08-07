import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import ClientMarketData from './client-market-data';
import ClientBreakevenCalculator from './client-breakeven-calculator';

const LUFTHANSA_NEWSROOM =
  'https://newsroom.lufthansagroup.com/en/lufthansa-group-optimises-flight-offering-in-summer-across-all-six-hubs/';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa kürzt 20.000 Flüge: Wendepunkt für nachhaltige Flugkraftstoffe?',
  description:
    'Tiefenanalyse der Lufthansa-Flugkürzungen vom April 2026. Energieökonomie, SAF-Kostendynamiken und deutsche Produktionschancen.',
  path: '/de/lufthansa-saf-2026'
});

export default function LufthansaAnalysisDE() {
  return (
    <PageTemplate
      locale="de"
      eyebrow="Tiefenanalyse Deutsche Fassung"
      title="Lufthansa kürzt 20.000 Flüge: SAF-Wendepunkt?"
      question="Sollte Lufthansa den Zeitpunkt für langfristige SAF-Abnahmeverträge jetzt neu prüfen?"
      asOf={null}
    >
      <SignalRow label="Beschaffungssignale">
        <MetricCard label="Beschaffungshaltung" value="Jetzt überprüfen" valueClassName="text-warning" hint="Kosten- und Politikdruck öffnen ein Prüffenster; aktuelle Angebote entscheiden." />
        <MetricCard label="Kapazitätssignal" value="20.000 Flüge" hint="Statische Ereignisangabe zur angekündigten Kurzstreckenkürzung." />
        <MetricCard label="Modellierter Kipppunkt" value="$115/Fass" hint="Abgeleitete Referenz, keine laufende Marktbeobachtung." />
        <MetricCard label="ReFuelEU 2030" value="6% SAF" valueClassName="text-warning" hint="Auf dieser Seite als politische Szenarioannahme verwendet." />
      </SignalRow>

      <Panel title="Aktuelle Marktindikatoren" why="Nur aktuelle, quellenmarkierte Preise können zeigen, ob das statische Prüffenster heute noch offen ist.">
        <ClientMarketData />
      </Panel>

      <Panel title="Kontext: Warum Lufthansa jetzt handelt" why="Kapazitätskürzungen zeigen, wann Treibstoffdruck von einer Kostenzeile zu einer operativen Entscheidung wird.">
        <div className="space-y-6 text-sm leading-7 text-muted tabular-nums">
          <p className="text-lg">April 2026: Lufthansa kündigt die Streichung von <strong>20.000 Kurzstreckenflügen</strong> an – oberflächlich eine Kostenmaßnahme, in dieser Analyse zugleich ein mögliches Wendepunktsignal.</p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-muted p-4"><p className="font-semibold text-accent">Öl-Schock</p><p className="mt-2">$80/Fass → $115/Fass (+43%) = modelliert +30–35% Einheitskosten auf Kurzstrecke.</p></div>
            <div className="rounded-xl border border-line bg-surface-muted p-4"><p className="font-semibold text-accent">Marge-Problem</p><p className="mt-2">Kurzstrecke: 2–3% Marge; Treibstoff: ~30% der Kosten; im Modell unrentabel bei $115/Fass.</p></div>
          </div>
          <p>Im Wettbewerb mit Billigfliegern kann Lufthansa Ticketpreise nicht beliebig schnell erhöhen. Die modellierte Reaktion ist die Kürzung margenschwacher Flüge.</p>
        </div>
      </Panel>

      <Panel title="SAF-Breakeven-Rechner" why="Mit expliziten Annahmen lässt sich prüfen, ob Ölpreis, EU ETS und Beimischung die Beschaffungslücke tatsächlich schließen.">
        <ClientBreakevenCalculator />
      </Panel>

      <Panel title="Die tiefere Logik: SAF-Inflexion" why="Die Szenarien zeigen, wie empfindlich der Beschaffungszeitpunkt gegenüber dem fossilen Referenzpreis ist.">
        <div className="space-y-6 tabular-nums">
          <div className="overflow-x-auto"><table className="w-full text-sm text-muted"><thead><tr className="border-b border-line"><th className="py-2 text-left">Ölpreis</th><th className="py-2 text-left">Jet-A Kosten</th><th className="py-2 text-left">SAF Kosten</th><th className="py-2 text-left">SAF-Aufschlag</th></tr></thead><tbody className="divide-y divide-line"><tr><td className="py-2">$80/Fass</td><td>$0,95/L</td><td>$1,60–1,85/L</td><td className="text-danger">+70% ✗</td></tr><tr><td className="py-2">$115/Fass (2026)</td><td>$1,20/L</td><td>$1,60–1,85/L</td><td className="text-warning">+35–50% ⚠</td></tr><tr><td className="py-2">$150/Fass (2030)</td><td>$1,60+/L</td><td>$1,20–1,40/L</td><td className="text-success">−15 bis +40% ✓</td></tr></tbody></table></div>
          <p className="text-sm leading-7 text-muted"><strong>Inflexion bei $115/Fass:</strong> In diesem Modell wechselt SAF von „unwirtschaftlich“ zu „prüfenswert“. Das ist eine abgeleitete Schwelle, kein beobachteter Marktpreis.</p>
        </div>
      </Panel>

      <Panel title="Deutschland als SAF-Fabrik" why="Lokale Produktionsvorteile zählen nur, wenn sie Lieferkosten und Beschaffungsrisiko nachweisbar senken.">
        <div className="grid gap-6 text-sm tabular-nums lg:grid-cols-3">
          <div className="rounded-xl border border-accent bg-accent-soft p-4"><p className="font-semibold text-accent">Warum Deutschland?</p><ul className="mt-2 space-y-2 text-muted"><li>✓ Chemie-Cluster und Raffinerie-Know-how</li><li>✓ angenommene Windkraftkosten €50–80/MWh</li><li>✓ Biotechnologie und Katalytik</li></ul></div>
          <div className="rounded-xl border border-success bg-success-soft p-4"><p className="font-semibold text-success">Möglicher Kostenvorteil</p><p className="mt-2 text-muted">Deutsches SAF mit Windstrom: im Artikel $1,25–1,50/L, etwa 10–20% unter importiertem SAF.</p></div>
          <div className="rounded-xl border border-warning bg-warning-soft p-4"><p className="font-semibold text-warning">Lufthansas Chance</p><p className="mt-2 text-muted">Heimische Lieferketten könnten 2028–2030 niedrigere Kosten ermöglichen; belastbare Angebote fehlen auf dieser Seite.</p></div>
        </div>
      </Panel>

      <Panel title="ReFuelEU: politischer Rahmen" why="Verpflichtende Beimischung hält Beschaffungsbedarf aufrecht, auch wenn der reine Ölpreisvergleich gegen SAF spricht.">
        <div className="space-y-4 text-sm text-muted tabular-nums"><div><p className="font-semibold">1. Jan. 2025</p><p>0,7% SAF-Quote (hier als Artikelannahme wiedergegeben)</p></div><div><p className="font-semibold">2030</p><p>6% SAF-Quote und angenommene Nachfrage von 420.000 Tonnen/Jahr</p></div><div><p className="font-semibold">2050</p><p>70% SAF-Quote als langfristiger politischer Pfad</p></div><p className="border-t border-line pt-4 text-xs">Der im Artikel genannte Investitionsbedarf von 200–300 Mrd. € ist nicht als aktuelle Messung verifiziert.</p></div>
      </Panel>

      <Panel title="Drei Szenarien für 2030" why="Die Bandbreite verhindert, dass ein einzelner Ölpreispfad als sichere Beschaffungsprognose gelesen wird.">
        <div className="grid gap-6 text-sm tabular-nums lg:grid-cols-3"><div className="rounded-xl border border-accent bg-accent-soft p-4"><p className="font-bold text-accent">Basis ($110–130/Fass)</p><p className="mt-2 text-muted">SAF-Spreads schrumpfen im Modell auf 20–30%; langfristige Verträge werden prüfenswert.</p></div><div className="rounded-xl border border-warning bg-warning-soft p-4"><p className="font-bold text-warning">Risiko ($85/Fass)</p><p className="mt-2 text-muted">SAF bleibt teuer; ReFuelEU-Annahmen halten die Nachfrage dennoch aufrecht.</p></div><div className="rounded-xl border border-success bg-success-soft p-4"><p className="font-bold text-success">Chance ($140+/Fass)</p><p className="mt-2 text-muted">Im Modell kann SAF Jet-A unterbieten; Lieferfähigkeit bleibt separat zu prüfen.</p></div></div>
      </Panel>

      <Panel title="Kernbotschaft" why="Die Seite empfiehlt eine erneute Prüfung des Timings, nicht den ungeprüften Abschluss eines Vertrags." action={<Link href="/analysis/lufthansa-flight-cuts-2026-04" className="text-sm text-accent underline">Chinesische Vollversion →</Link>}>
        <div className="space-y-4 text-sm leading-7 text-muted tabular-nums"><p>Lufthansas Flugkürzungen sind in dieser Analyse ein Signal strategischer Transformation. Deutschlands mögliches Zeitfenster bis 2030 hängt von realen Angeboten und nachweisbarer Kapazität ab.</p><p>Investitionen in SAF-Kapazität, Windkraft-Infrastruktur und Lieferketten müssen deshalb gegen aktuelle Marktquellen und Vertragsdaten geprüft werden.</p></div>
      </Panel>

      <SourceFooter
        locale="de"
        sources={[
          { id: 'market-api', label: 'JetScope Markt- und Quellen-API; der interaktive Indikator zeigt den Laufzeitstatus', href: '/de/sources', basis: 'assumption' },
          { id: 'lufthansa-newsroom', label: 'Lufthansa Group Newsroom: Anpassung des Sommerflugplans 2026', href: LUFTHANSA_NEWSROOM, basis: 'observed' },
          { id: 'author-cost-model', label: 'Interaktiver Breakeven-Rechner und statische Kostenszenarien', basis: 'derived' },
          { id: 'refueleu-targets', label: 'Im Artikel verwendete ReFuelEU-Beimischungsziele', basis: 'assumption' }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen- und Methodenliste"
        limitations={[
          'Der Seitenkopf hat keinen Datenstempel: Nur das clientseitige Marktmodul kennt nach dem Laden seinen eigenen Quellenzeitpunkt.',
          'Die Ereignisanalyse und ihre Kosten-, Margen-, Politik- und 2030-Werte sind ein statischer Stand und keine laufende Marktprognose.',
          'Der Rechner arbeitet mit sichtbaren Annahmen; tatsächliche Beschaffung benötigt Lieferantenangebote, Verträge, Hedge-Positionen und Streckenprofitabilität.'
        ]}
      />
    </PageTemplate>
  );
}
