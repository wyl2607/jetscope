import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import ClientMarketData from './client-market-data';
import ClientBreakevenCalculator from './client-breakeven-calculator';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa kürzt 20.000 Flüge: Wendepunkt für nachhaltige Flugkraftstoffe?',
  description:
    'Tiefenanalyse der Lufthansa-Flugkürzungen vom April 2026. Energieökonomie, SAF-Kostendynamiken und deutsche Produktionschancen.',
  path: '/de/lufthansa-saf-analysis'
});

export default function LufthansaAnalysisDE() {
  return (
    <Shell
      eyebrow="Tiefenanalyse Deutsche Fassung"
      title="Lufthansa kürzt 20.000 Flüge: SAF-Wendepunkt?"
      description="Energiemarktkrise & strategische Transformation"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* 实时市场数据看板 */}
        <ClientMarketData />

        <section className="rounded-lg border border-slate-800 bg-slate-950 p-8">
          <p className="text-lg text-slate-300 leading-relaxed">
            April 2026: Lufthansa kündigt die Streichung von <strong>20.000 Kurzstreckenflügen</strong> an – oberflächlich eine Kostenmaßnahme. Tiefere Bedeutung: Die Energiewirtschaft des Flugverkehrs durchläuft einen <strong>Wendepunkt</strong>.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Kontext: Warum Lufthansa jetzt handelt</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900 p-4 rounded border border-slate-800">
              <p className="font-semibold text-sky-300">Öl-Schock</p>
              <p className="text-slate-400 text-sm mt-2">$80/Fass → $115/Fass (+43%) 
              = +30-35% Unitkosten auf Kurzstrecke</p>
            </div>
            
            <div className="bg-slate-900 p-4 rounded border border-slate-800">
              <p className="font-semibold text-sky-300">Marge-Problem</p>
              <p className="text-slate-400 text-sm mt-2">Kurzstrecke: 2-3% Marge
              Treibstoff: ~30% der Kosten
              → Unrentabel bei $115/Fass</p>
            </div>
          </div>

          <p className="text-slate-300">
            Im brutalen Wettbewerb mit Billigfliegern kann Lufthansa nicht schnell die Ticketpreise erhöhen. Die rationale Reaktion: Niedrig-Margin-Flüge streichen.
          </p>
        </section>

        {/* 交互式盈亏平衡计算器 */}
        <ClientBreakevenCalculator />

        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Die tiefere Logik: SAF-Inflexion</h2>
          
          <div className="bg-slate-900 p-6 rounded border border-slate-800">
            <p className="font-semibold text-slate-300 mb-3">Kostenverlauf bei unterschiedlichen Ölpreisen:</p>
            
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2">Ölpreis</th>
                  <th className="text-left py-2">Jet-A Kosten</th>
                  <th className="text-left py-2">SAF Kosten</th>
                  <th className="text-left py-2">SAF teurer?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                <tr>
                  <td className="py-2">$80/Fass</td>
                  <td>$0,95/L</td>
                  <td>$1,60-1,85/L</td>
                  <td className="text-red-400">+70% ✗</td>
                </tr>
                <tr>
                  <td className="py-2">$115/Fass (2026)</td>
                  <td>$1,20/L</td>
                  <td>$1,60-1,85/L</td>
                  <td className="text-orange-400">+35-50% ⚠</td>
                </tr>
                <tr>
                  <td className="py-2">$150/Fass (2030)</td>
                  <td>$1,60+/L</td>
                  <td>$1,20-1,40/L</td>
                  <td className="text-green-400">-15 bis +40% ✓</td>
                </tr>
              </tbody>
            </table>
            
            <p className="mt-4 text-slate-400 text-xs">
              Mit EU-ETS Kohlenstoffpreisen (Ziel 2030: €150+/tCO₂) wird die Rechnung noch günstiger für SAF.
            </p>
          </div>

          <p className="text-slate-300">
            <strong>Inflexion bei $115/Fass:</strong> Das ist der genaue Punkt, an dem SAF von „total unwirtschaftlich" zu „grenzwertig akzeptabel" wechselt. Lufthansas Timing ist kein Zufall – sie positioniert sich für die SAF-Dominanz nach 2028.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">Deutschland als SAF-Fabrik</h2>
          
          <div className="space-y-3">
            <div className="bg-slate-900 border-l-4 border-sky-600 p-4 rounded">
              <p className="font-semibold text-sky-300">Warum Deutschland?</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                <li>✓ Chemie-Cluster (BASF, Covestro) → SAF-ready</li>
                <li>✓ Windkraft €50-80/MWh → global niedrigste Stromkosten</li>
                <li>✓ Biotechnologie & Katalytik → deutsche Kernstärken</li>
              </ul>
            </div>

            <div className="bg-slate-900 border-l-4 border-green-600 p-4 rounded">
              <p className="font-semibold text-green-300">Effekt: Kostenführerschaft</p>
              <p className="mt-2 text-sm text-slate-300">
                Deutsches SAF mit Windstrom: $1,25-1,50/L
                (10-20% billiger als importierte SAF)
              </p>
            </div>

            <div className="bg-slate-900 border-l-4 border-orange-600 p-4 rounded">
              <p className="font-semibold text-orange-300">Lufthansas Vorteil</p>
              <p className="mt-2 text-sm text-slate-300">
                Heimische Lieferketten + Costenführerschaft 
                = 2028-2030 niedrigere Treibstoffkosten als andere EU-Airlines
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">ReFuelEU: Der politische Rahmen</h2>
          
          <div className="bg-slate-950 border border-slate-800 rounded p-6">
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-slate-300">1. Jan 2025</p>
                <p className="text-slate-400 text-sm">0,7% SAF-Quote verpflichtend</p>
              </div>
              <div>
                <p className="font-semibold text-slate-300">2030 (Wendepunkt)</p>
                <p className="text-slate-400 text-sm">6% SAF-Quote = 420.000 Tonnen/Jahr Nachfrage</p>
              </div>
              <div>
                <p className="font-semibold text-slate-300">2050</p>
                <p className="text-slate-400 text-sm">70% SAF-Quote = volle Dekarbonisierung</p>
              </div>
            </div>
            
            <p className="mt-4 text-slate-400 text-xs border-t border-slate-700 pt-4">
              Investitionsbedarf bis 2030: 200-300 Mrd. € in neue SAF-Kapazität
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-3xl font-bold text-white">3 Szenarien für 2030</h2>
          
          <div className="space-y-4">
            <div className="bg-slate-900 border-l-4 border-blue-500 p-4 rounded">
              <p className="font-bold text-blue-300 mb-2">Basis ($110-130/Fass)</p>
              <p className="text-sm text-slate-300">
                Anhaltende Geopolitische Spannungen. SAF-Spreads schrumpfen auf 20-30%. 
                Deutsche Industrie dominiert. Lufthansa schließt Langfrist-Kontrakte.
              </p>
            </div>

            <div className="bg-slate-900 border-l-4 border-yellow-500 p-4 rounded">
              <p className="font-bold text-yellow-300 mb-2">Risiko ($85/Fass)</p>
              <p className="text-sm text-slate-300">
                Geopolitische Entspannung oder Rezession. SAF bleibt teuer, aber 
                ReFuelEU-Quoten sind bindend. Erzwungener Kauf. Branche reift schneller.
              </p>
            </div>

            <div className="bg-slate-900 border-l-4 border-green-500 p-4 rounded">
              <p className="font-bold text-green-300 mb-2">Chancen ($140+/Fass)</p>
              <p className="text-sm text-slate-300">
                Klimapolitik beschleunigt, Kohlenstoffpreise steigen. 
                SAF günstiger als Jet-A. Airlines kaufen freiwillig. 
                Deutsche Industrie profitiert massiv.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-sky-800 bg-slate-950 p-8">
          <h2 className="text-2xl font-bold text-sky-300 mb-4">Kern-Botschaft</h2>
          <p className="text-slate-300 leading-relaxed">
            Lufthansas Flugkürzungen sind <strong>kein Signal für Branchenerosion, sondern für strategische Transformation</strong>. 
            Die alte Konkurrenz war Skalierung + Kosteneffizienz. Die zukünftige wird Energiewende + Lieferkette-Kontrolle.
          </p>
          <p className="text-slate-300 leading-relaxed mt-4">
            <strong>Für Deutschland:</strong> Dies ist ein Gold-Fenster bis 2030. 
            Investitionen in SAF-Kapazität, Windkraft-Infrastruktur und Grüntechnologie-Exporte jetzt aufbauen 
            → 2035+ globale Marktführerschaft erreichen. 
            Lufthansa selbst könnte einer der größten Nutznießer sein.
          </p>
        </section>

        <section className="text-center py-8">
          <Link href="/analysis/lufthansa-flight-cuts-2026-04" className="text-sky-300 underline">
            中文完整版 (Chinese Full Version) →
          </Link>
        </section>

      </div>
    </Shell>
  );
}
