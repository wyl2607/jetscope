import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
    body:
      'JetScope verbindet Jet-Fuel-Preise, SAF-Kostendruck, EU-Reserve-Stress, Quellenqualität, gespeicherte Szenarioannahmen und Forschungssignale in einem prüfbaren Ablauf.',
    href: '/de/dashboard' as Route,
    action: 'Entscheidungscockpit öffnen'
  },
  {
    title: 'Warum kann die Startbereitschaft nicht bereit sein?',
    body:
      'Die Startbereitschaft zeigt den echten Umgebungszustand. Fehlende Verwaltungskonfiguration, deaktivierte Forschung, Datenbankprobleme oder eingeschränkte Quellenabdeckung werden als Blocker oder Prüfpunkte offengelegt.',
    href: '/de/admin' as Route,
    action: 'Startbereitschaft öffnen'
  },
  {
    title: 'Wie lese ich eingeschränkte Quellen oder Fallbacks?',
    body:
      'Die Quellenprüfung trennt Live-, Proxy-, Fallback-, nicht verfügbare und Fehlerzustände. Eingeschränkte Quellen können nutzbar sein, sollten aber vor Beschaffung oder Berichtsnutzung geprüft werden.',
    href: '/de/sources' as Route,
    action: 'Quellenprüfung öffnen'
  },
  {
    title: 'Warum kann die Forschungswerkstatt deaktiviert sein?',
    body:
      'Die Forschungswerkstatt gibt deaktivierte Forschung oder fehlende Voraussetzungen ehrlich aus. Sie zeigt die Grenze und die nächsten Prüfschritte, statt Live-Analyse vorzutäuschen.',
    href: '/de/research' as Route,
    action: 'Forschungswerkstatt öffnen'
  },
  {
    title: 'Kann ich hier Szenarien speichern oder Marktdaten aktualisieren?',
    body:
      'Szenario-Schreibvorgänge und Aktualisierungen sind geschützt. Ohne konfigurierte Verwaltungsberechtigung bleiben FAQ und lokalisierte Prüfflächen lesend und verlinken zu den primären Arbeitsbereichen.',
    href: '/de/scenarios' as Route,
    action: 'Szenario-Workbench öffnen'
  }
] as const;

export default function GermanFaqPage() {
  return (
    <Shell
      locale="de"
      eyebrow="Hilfe · Startgrenze"
      title="Häufige Fragen"
      description="Ein praktischer Überblick zu JetScope Startbereitschaft, Quellenvertrauen, Forschungsgrenzen und geschützten Schreibvorgängen."
    >
      <section className="grid gap-4 md:grid-cols-2">
        {questions.map((item) => (
          <InfoCard key={item.title} title={item.title} subtitle={item.action}>
            <p className="text-sm leading-7 text-slate-700">{item.body}</p>
            <p className="mt-4 text-sm">
              <Link className="font-semibold text-sky-700 underline" href={item.href}>
                {item.action}
              </Link>
            </p>
          </InfoCard>
        ))}
      </section>
    </Shell>
  );
}
