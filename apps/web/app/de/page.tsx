import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Deutschland',
  description:
    'Indexierbare deutsche Startseite fuer JetScope mit Einstieg in Dashboard und Deutschland Jet-Fuel Preisbeobachtung.',
  path: '/de'
});

export default function GermanIndexPage() {
  return (
    <Shell
      eyebrow="Startseite · Deutsch"
      title="JetScope Deutschland"
      description="Einstieg fuer den deutschen Markt: Live-Dashboard fuer SAF-vs-Kerosin Entscheidungen und indexierbare Preisseite fuer Deutschland."
    >
      <section className="grid gap-5 lg:grid-cols-2 lg:grid-cols-3">
        <InfoCard title="Dashboard (DE)" subtitle="/de/dashboard">
          <p className="text-sm leading-7 text-slate-300">
            Live-Marktstatus, Szenario-Registry und Risikosignale fuer operative Entscheidungen.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/dashboard">
              Dashboard oeffnen
            </Link>
          </p>
        </InfoCard>
        <InfoCard title="Deutschland Jet-Fuel Preise" subtitle="/de/prices/germany-jet-fuel">
          <p className="text-sm leading-7 text-slate-300">
            SSR-Preisbeobachtung fuer Brent, Jet global, EU Jet Proxy und Carbon mit 1d/7d/30d Veraenderung.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/de/prices/germany-jet-fuel">
              Preisansicht oeffnen
            </Link>
          </p>
        </InfoCard>
        <InfoCard title="Lufthansa-Analyse (DE)" subtitle="Tiefenanalyse">
          <p className="text-sm leading-7 text-slate-300">
            Tiefenanalyse der Lufthansa-Flugkuerzungen 2026 und SAF-Wendepunkt. Deutsche Fassung mit lokalen Daten zur Energieokonomie und Produktionschancen.
          </p>
          <p className="mt-4 text-sm">
            <Link className="text-sky-300 underline" href="/analysis/lufthansa-flight-cuts-2026-04">
              Zur Analyse (Deutsch) →
            </Link>
          </p>
        </InfoCard>
      </section>
    </Shell>
  );
}
