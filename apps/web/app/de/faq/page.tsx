import { PageTemplate } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const metadata: Metadata = buildPageMetadata({
  title: 'Häufige Fragen',
  description:
    'JetScope FAQ zu Startbereitschaft, Quellenprüfung, Forschungswerkstatt, Szenario-Schreibvorgängen und geschützten Operationen.',
  path: '/de/faq',
  alternateLanguages: {
    'zh-CN': '/faq',
    en: '/en/faq',
    de: '/de/faq'
  }
});

const questions = [
  {
    title: 'Was kann JetScope heute prüfen?',
    why: 'Der konkrete Prüfumfang zeigt, für welche Entscheidungen das Produkt belastbar eingesetzt werden kann.',
    body:
      'JetScope verbindet Jet-Fuel-Preise, SAF-Kostendruck, EU-Reserve-Stress, Quellenqualität, gespeicherte Szenarioannahmen und Forschungssignale in einem prüfbaren Ablauf.',
    href: '/de/dashboard' as Route,
    action: 'Entscheidungscockpit öffnen'
  },
  {
    title: 'Warum kann die Startbereitschaft nicht bereit sein?',
    why: 'Nur wenn Konfigurationslücken von Produktfehlern getrennt werden, ist der nächste Schritt eindeutig.',
    body:
      'Die Startbereitschaft zeigt den echten Umgebungszustand. Fehlende Verwaltungskonfiguration, deaktivierte Forschung, Datenbankprobleme oder eingeschränkte Quellenabdeckung werden als Blocker oder Prüfpunkte offengelegt.',
    href: '/de/admin' as Route,
    action: 'Startbereitschaft öffnen'
  },
  {
    title: 'Wie lese ich eingeschränkte Quellen oder Fallbacks?',
    why: 'Eine eingeschränkte Quelle verändert die Verwendungsgrenze einer Zahl und muss vor ihrer Weitergabe geprüft werden.',
    body:
      'Die Quellenprüfung trennt Live-, Proxy-, Fallback-, nicht verfügbare und Fehlerzustände. Eingeschränkte Quellen können nutzbar sein, sollten aber vor Beschaffung oder Berichtsnutzung geprüft werden.',
    href: '/de/sources' as Route,
    action: 'Quellenprüfung öffnen'
  },
  {
    title: 'Warum kann die Forschungswerkstatt deaktiviert sein?',
    why: 'Deaktivierte Forschung darf nicht mit einem Markt ohne neue Signale verwechselt werden.',
    body:
      'Die Forschungswerkstatt gibt deaktivierte Forschung oder fehlende Voraussetzungen ehrlich aus. Sie zeigt die Grenze und die nächsten Prüfschritte, statt Live-Analyse vorzutäuschen.',
    href: '/de/research' as Route,
    action: 'Forschungswerkstatt öffnen'
  },
  {
    title: 'Kann ich hier Szenarien speichern oder Marktdaten aktualisieren?',
    why: 'Geschützte Schreibvorgänge brauchen eine klare Berechtigung, bevor ein fehlender Zugriff als Fehler bewertet wird.',
    body:
      'Szenario-Schreibvorgänge und Aktualisierungen sind geschützt. Ohne konfigurierte Verwaltungsberechtigung bleiben FAQ und lokalisierte Prüfflächen lesend und verlinken zu den primären Arbeitsbereichen.',
    href: '/de/scenarios' as Route,
    action: 'Szenario-Workbench öffnen'
  }
] as const;

export default function GermanFaqPage() {
  return (
    <PageTemplate
      locale="de"
      eyebrow="Hilfe · Startgrenze"
      title="Häufige Fragen"
      question="Ist dieser Zustand ein Produktfehler oder eine bewusst nicht aktivierte Funktion?"
      asOf={null}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {questions.map((item) => (
          <Panel key={item.title} locale="de" title={item.title} why={item.why}>
            <p className="text-sm leading-7 text-muted">{item.body}</p>
            <p className="mt-4 text-sm">
              <Link className="font-semibold text-accent underline" href={item.href}>
                {item.action}
              </Link>
            </p>
          </Panel>
        ))}
      </div>

      <SourceFooter
        locale="de"
        sources={[
          {
            id: 'ui-contract',
            label: 'docs/UI_CONTRACT.md (Vertrag für Seitenzustände und Interaktionen)',
            basis: 'assumption'
          },
          {
            id: 'launch-readiness-contract',
            label: 'Aktuelle Konventionen der Startbereitschaft und Quellenprüfung',
            basis: 'assumption'
          }
        ]}
        methodHref="/de/sources"
        methodLabel="Quellenzustände und Konventionen öffnen"
        limitations={[
          'Diese Antworten beschreiben die beabsichtigte Funktion des aktuellen Deployments und ändern sich nicht mit Echtzeitdaten; die konkrete Bereitschaft steht auf der Admin-Seite.',
          'Die FAQ ersetzt nicht die aktuellen Zustände und Grenzen auf den Quellen-, Forschungs- oder Szenarioseiten.'
        ]}
      />
    </PageTemplate>
  );
}
