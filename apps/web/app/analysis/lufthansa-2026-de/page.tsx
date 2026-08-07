import { LufthansaAnalysisDE } from '../lufthansa-flight-cuts-2026-04/page';
import { PageTemplate } from '@/components/page-template';
import { SourceFooter } from '@/components/source-footer';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

const LUFTHANSA_NEWSROOM =
  'https://newsroom.lufthansagroup.com/en/lufthansa-group-optimises-flight-offering-in-summer-across-all-six-hubs/';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa-Treibstoffkrise 2026: SAF-Chancen für Deutschland',
  description: 'Analyse: Warum Lufthansas Kürzung von 20.000 Flügen die SAF-Nachfrage in Deutschland transformiert. Energiewirtschaft, Kosteneffektivität, ReFuelEU-Roadmap.',
  path: '/analysis/lufthansa-2026-de',
  alternateLanguages: {
    en: '/analysis/lufthansa-flight-cuts-2026-04',
    zh: '/analysis/lufthansa-flight-cuts-2026-04'
  }
});

export default function LufthansaAnalysisDEPage() {
  return (
    <PageTemplate
      locale="de"
      eyebrow="Tiefenanalyse · Deutsch"
      title="Lufthansa kürzt 20.000 Flüge: Wendepunkt für nachhaltige Flugkraftstoffe?"
      question="Verändert diese Kapazitätskürzung den richtigen Zeitpunkt für die SAF-Beschaffung?"
      asOf={null}
    >
      <LufthansaAnalysisDE />
      <SourceFooter
        locale="de"
        sources={[
          { id: 'lufthansa-newsroom', label: 'Lufthansa Group Newsroom: Anpassung des Sommerflugplans 2026', href: LUFTHANSA_NEWSROOM, basis: 'observed' },
          { id: 'author-cost-model', label: 'JetScope-Kostenzerlegung und Kipppunkt-Szenarien', basis: 'derived' },
          { id: 'refueleu-targets', label: 'Im Artikel verwendete ReFuelEU-Beimischungsziele', basis: 'assumption' }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellen- und Methodenliste"
        limitations={[
          'Diese namentlich gezeichnete Ereignisanalyse ist auf April 2026 fixiert und wird nicht mit Marktpreisen aktualisiert.',
          'Kosten-, Margen- und Kipppunktwerte sind Modellannahmen oder Ableitungen und keine Lieferantenangebote.',
          'Beschaffungsentscheidungen benötigen zusätzlich aktuelle Angebote, Vertragsbedingungen, Hedge-Positionen und Streckenprofitabilität.'
        ]}
      />
    </PageTemplate>
  );
}
