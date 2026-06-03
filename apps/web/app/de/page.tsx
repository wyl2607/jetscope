import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Deutschland',
  description:
    'Indexierbare deutsche Startseite für JetScope mit Einstieg in Dashboard und Deutschland Jet-Fuel-Preisbeobachtung.',
  path: '/de'
});

export default function GermanIndexPage() {
  return (
    <Shell
      locale="de"
      eyebrow="Startseite · Deutsch"
      title="JetScope Deutschland"
      description="Einstieg für den deutschen Markt: Live-Dashboard für SAF-vs-Kerosin-Entscheidungen und indexierbare Preisseite für Deutschland."
    >
      <section className="grid gap-5 lg:grid-cols-2 lg:grid-cols-3">
        <InfoCard title="Dashboard (DE)" subtitle="/de/dashboard">
          <p className="text-sm leading-7 text-slate-300">
            Live-Marktstatus, Szenario-Registry und Risikosignale für operative Entscheidungen.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/dashboard">
              Dashboard öffnen
            </Link>
          </p>
        </InfoCard>
        <InfoCard title="Deutschland Jet-Fuel Preise" subtitle="/de/prices/germany-jet-fuel">
          <p className="text-sm leading-7 text-slate-300">
            Serverseitige Preisbeobachtung für Brent, Jet global, EU-Jet-Proxy und Carbon-Proxy mit 1d/7d/30d-Veränderung.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/prices/germany-jet-fuel">
              Preisansicht öffnen
            </Link>
          </p>
        </InfoCard>
        <InfoCard title="Quellenprüfung" subtitle="/de/sources">
          <p className="text-sm leading-7 text-slate-300">
            Zeilenbasierte Prüfung von Live-, Proxy- und Fallback-Quellen mit Wiederherstellungsaktionen für Markteingaben.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/sources">
              Quellen öffnen
            </Link>
          </p>
        </InfoCard>
        <InfoCard title="Szenario-Workbench" subtitle="/de/scenarios">
          <p className="text-sm leading-7 text-slate-300">
            Lesende Prüfung gespeicherter SAF-Annahmen mit Marktkontext, Risikosignal und geschützter Schreibgrenze.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/scenarios">
              Szenarien prüfen
            </Link>
          </p>
        </InfoCard>
        <InfoCard title="Startbereitschaft" subtitle="/de/admin">
          <p className="text-sm leading-7 text-slate-300">
            Lesende Prüfung von Datenbank, Markt-Snapshot, Quellenabdeckung, Admin-Token und AI-Research-Pipeline vor dem Start.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/admin">
              Bereitschaft prüfen
            </Link>
          </p>
        </InfoCard>
        <InfoCard title="Lufthansa-Analyse (DE)" subtitle="Tiefenanalyse">
          <p className="text-sm leading-7 text-slate-300">
            Tiefenanalyse der Lufthansa-Flugkürzungen 2026 und des SAF-Wendepunkts. Deutsche Fassung mit lokalen Daten zur Energieökonomie und Produktionschancen.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/lufthansa-saf-2026">
              Zur Analyse (Deutsch) →
            </Link>
          </p>
        </InfoCard>
      </section>
    </Shell>
  );
}
