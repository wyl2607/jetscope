import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import {
  ACTION_ITEMS, ATJ_COSTS, BASELINE, DE_ADVANTAGES, DE_KEROSENE_BREAKDOWN,
  DE_LH_ANNOUNCEMENT, DISCLAIMER_PARAGRAPHS, ETS_DRIVERS, EVENT_OVERVIEW, FACTS,
  GERMANY_ADVANTAGES, GERMAN_PRESSURES, GREEN_ELECTRICITY_BENEFITS, JET_A1_COSTS,
  KEY_INSIGHTS, LUFTHANSA_SHOCK_2026Q2, LUFTHANSA_STRATEGIC, NAV_ITEMS,
  OUTLOOK_SCENARIOS, REFUEL_EU_ROADMAP, SAF_INFLECTION_MATH,
  type RichParagraph
} from './data';

function RichP({ p, className }: { p: RichParagraph; className?: string }) {
  return (
    <p className={className}>
      {p.map((seg, i) => (seg.b ? <strong key={i}>{seg.t}</strong> : <span key={i}>{seg.t}</span>))}
    </p>
  );
}

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: '汉莎削减2万航班背后：可持续航油成本拐点到来',
  description:
    '深度分析汉莎2026年4月削减20,000航班事件。通过解构当前航油价格、SAF成本动态、欧盟政策驱动，揭示可持续航油的竞争力转折点与德国生产机遇。2000+字深度内容营销文章。',
  path: '/analysis/lufthansa-flight-cuts-2026-04'
});

export default function LufthansaFuelShockAnalysisPage() {
  return (
    <Shell
      eyebrow="深度分析"
      title="汉莎削减2万航班背后：可持续航油成本拐点到来"
      description="从事件背后的能源经济学看可持续航油的未来"
    >
      {/* 文章导航 */}
      <nav className="mb-8 rounded-lg border border-slate-800 bg-slate-950 p-4">
        <p className="mb-3 text-xs font-semibold uppercase text-slate-400">内容导航</p>
        <ul className="grid gap-2 text-sm text-slate-300">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>• <a href={item.href} className="text-sky-300 underline">{item.label}</a></li>
          ))}
        </ul>
      </nav>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <InfoCard title="事件事实 (source-backed)" subtitle="Lufthansa newsroom · 2026-04-21">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">{FACTS.map((fact) => <li key={fact}>• {fact}</li>)}</ul>
          <p className="mt-4 text-xs text-slate-400">
            Source:{' '}
            <a className="text-sky-300 underline" href="https://newsroom.lufthansagroup.com/en/lufthansa-group-optimises-flight-offering-in-summer-across-all-six-hubs/" target="_blank" rel="noreferrer">Lufthansa Group newsroom</a>
          </p>
        </InfoCard>

        <InfoCard title="对 JetScope 的直接影响" subtitle="Parameter delta">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4">参数</th>
                  <th className="py-2 pr-4">2026基准</th>
                  <th className="py-2 pr-4">汉莎冲击</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['原油 ($/桶)', BASELINE.crudeUsdPerBarrel, LUFTHANSA_SHOCK_2026Q2.crudeUsdPerBarrel],
                  ['碳价 ($/吨CO2)', BASELINE.carbonPriceUsdPerTonne, LUFTHANSA_SHOCK_2026Q2.carbonPriceUsdPerTonne],
                  ['补贴 ($/升)', BASELINE.subsidyUsdPerLiter.toFixed(2), LUFTHANSA_SHOCK_2026Q2.subsidyUsdPerLiter.toFixed(2)]
                ].map(([label, base, shock]) => (
                  <tr key={String(label)} className="border-b border-slate-900"><td className="py-2 pr-4">{label}</td><td className="py-2 pr-4">{base}</td><td className="py-2 pr-4">{shock}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-300">这个冲击场景的含义：航司优先削减低利润短途运力，同时对SAF成本竞争力更敏感。</p>
        </InfoCard>
      </section>

      {/* 事件概述与深层逻辑 */}
      <section id="event-overview" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">事件概述与深层逻辑</h2>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          {EVENT_OVERVIEW.map((p, i) => (
            <RichP key={i} p={p} className={i < EVENT_OVERVIEW.length - 1 ? 'mb-4 text-slate-300' : 'text-slate-300'} />
          ))}
        </div>
      </section>

      {/* 航油成本分解 */}
      <section id="fuel-cost-breakdown" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">航空燃油成本分解与德国溢价</h2>

        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">Jet-A-1成本结构</h3>
          <p className="mb-4 text-slate-300">当前（2026年4月），全球标准喷气燃料Jet-A-1的成本约为：</p>
          <div className="mb-6 space-y-3 rounded bg-slate-900 p-4">
            {JET_A1_COSTS.map((row) => (
              <div key={row.label} className="flex justify-between text-sm"><span className="text-slate-300">{row.label}</span><span className="text-slate-400">{row.value}</span></div>
            ))}
            <div className="border-t border-slate-700 pt-3 mt-3"><div className="flex justify-between font-semibold"><span className="text-slate-300">现货价格（欧洲）</span><span className="text-sky-300">$1.20/升</span></div></div>
          </div>
          <p className="mb-4 text-slate-300"><strong>德国机场溢价：</strong> 由于德国远离海运枢纽（主要依赖管道或陆运），且税收与基础设施成本较高，德国机场的航油价格通常比欧洲平均价高5-10%，即 $1.26-1.32/升。</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">为什么德国航司承压最大</h3>
          <ul className="space-y-3 text-slate-300">
            {GERMAN_PRESSURES.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}
          </ul>
        </div>
      </section>

      {/* SAF成本转折点 */}
      <section id="saf-inflection" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">SAF成本转折点：$115/桶的关键意义</h2>

        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">糖基ATJ（Alcohol-to-Jet）成本分析</h3>
          <p className="mb-4 text-slate-300">糖基ATJ是最接近商业化的SAF路线。其成本包括：</p>
          <div className="space-y-3 rounded bg-slate-900 p-4 mb-6">
            {ATJ_COSTS.map((row) => (
              <div key={row.label} className="flex justify-between text-sm"><span className="text-slate-300">{row.label}</span><span className="text-slate-400">{row.value}</span></div>
            ))}
            <div className="border-t border-slate-700 pt-3 mt-3"><div className="flex justify-between font-semibold"><span className="text-slate-300">总成本（非可再生电力）</span><span className="text-sky-300">$1.60-1.85/升</span></div></div>
          </div>
          <p className="mb-4 text-slate-300"><strong>关键发现：能源成本是SAF成本的最大驱动因素。</strong> 当使用可再生电力（德国风电成本$50-80/MWh）时，能源成本可从$0.60降至$0.25-0.35，使总成本下降至 $1.30-1.50/升。</p>
          <p className="text-slate-300">
            <strong>转折点数学：</strong><br />
            {SAF_INFLECTION_MATH.map((line) => <span key={line}>• {line}<br /></span>)}
            <br />
            $115/桶正好是这个转折点的触发价位。结合欧盟碳价上升（目标2030年$150+/吨CO2，等效增加油价$0.40-0.50）和ReFuelEU政策约束，2028年左右SAF与传统油的成本差异可能完全消失。
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">德国绿电优势的关键作用</h3>
          <p className="text-slate-300">德国风电成本全球最低（$50-80/MWh），这为本土SAF生产创造了成本竞争力：</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {GREEN_ELECTRICITY_BENEFITS.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      </section>

      {/* 市场驱动因素 */}
      <section id="market-drivers" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">市场驱动因素：ReFuelEU与碳价</h2>

        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">ReFuelEU 2025-2030政策路线图</h3>
          <div className="space-y-3 rounded bg-slate-900 p-4 mb-6 text-sm">
            {REFUEL_EU_ROADMAP.map((row) => (
              <div key={row.year}><p className="font-semibold text-slate-300">{row.year}</p><p className="text-slate-400">{row.detail}</p></div>
            ))}
          </div>
          <p className="text-slate-300">这个强制性的政策约束意味着：到2030年，欧洲需要投资200-300亿欧元建设新的SAF产能。对比之下，汉莎削减2万航班（年省4万吨油）的决定，只是这个能源转变的一个微观缩影。</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">EU ETS碳价上升对SAF竞争力的助推</h3>
          <ul className="space-y-3 text-slate-300">
            {ETS_DRIVERS.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}
          </ul>
        </div>
      </section>

      {/* 德国制造优势 */}
      <section id="germany-advantage" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">德国制造优势与产业机遇</h2>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">为什么SAF产业选择德国</h3>
          <ul className="space-y-4 text-slate-300">
            {GERMANY_ADVANTAGES.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}
          </ul>
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">汉莎集团的战略位置</h3>
          <p className="mb-4 text-slate-300">汉莎作为德国最大航空企业，有独特的战略机遇：</p>
          <ul className="space-y-3 text-slate-300">
            {LUFTHANSA_STRATEGIC.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}
          </ul>
        </div>
      </section>

      {/* 未来展望 */}
      <section id="outlook" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">未来情景展望（2026-2030）</h2>

        <div className="space-y-4">
          {OUTLOOK_SCENARIOS.map((sc) => (
            <div key={sc.title} className="rounded-lg border border-slate-800 bg-slate-950 p-6"><h3 className="text-lg font-semibold text-sky-300 mb-3">{sc.title}</h3><p className="text-slate-300 text-sm leading-relaxed">{sc.body}</p></div>
          ))}
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">关键启示</h3>
          {KEY_INSIGHTS.map((text, i) => (
            <p key={i} className={i === 0 ? 'text-slate-300' : 'mt-4 text-slate-300'}>{text}</p>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <InfoCard title="建议执行动作" subtitle="针对产品与研究流程">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">{ACTION_ITEMS.map((item) => <li key={item}>• {item}</li>)}</ul>
          <p className="mt-4 text-sm text-slate-300">快速入口：<Link className="text-sky-300 underline" href="/scenarios">Scenarios</Link> · <Link className="text-sky-300 underline" href="/sources">Sources</Link></p>
        </InfoCard>

        <InfoCard title="免责声明" subtitle="Data and interpretation scope">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            {DISCLAIMER_PARAGRAPHS.map((text) => (<p key={text}>{text}</p>))}
          </div>
        </InfoCard>
      </section>

      <section className="mt-8 rounded-lg border border-slate-800 p-6">
        <p className="text-slate-400 text-sm mb-3">Deutsche Vollversion (German Full Analysis)：</p>
        <Link href="/analysis/lufthansa-2026-de" className="text-sky-300 underline">Lufthansa kürzt 20.000 Flüge: Wendepunkt für nachhaltige Flugkraftstoffe? →</Link>
      </section>
    </Shell>
  );
}

// German version export - can be imported or used for alternative routing
export function LufthansaAnalysisDE() {
  return (
    <Shell
      eyebrow="Tiefenanalyse · Deutsch"
      title="Lufthansa kürzt 20.000 Flüge: Wendepunkt für nachhaltige Flugkraftstoffe?"
      description="Energiemarktkrise & strategische Transformation der Luftfahrtindustrie"
    >
      <div className="space-y-8">

        <section className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <p className="text-lg text-slate-300 leading-relaxed mb-4"><strong>21. April 2026:</strong> Lufthansa Group kündigt an, bis Oktober 2026 etwa <strong>20.000 Kurzstreckenflüge</strong> zu streichen. Oberflächlich: eine Kostenmaßnahme. Tiefere Bedeutung: ein Signal, dass die Energiewirtschaft des Flugverkehrs einen <strong>strategischen Wendepunkt</strong> erreicht hat.</p>
          <p className="text-slate-300">Treibstoff macht 20-30% der Lufthansa-Betriebskosten aus. Springt der Ölpreis von $80 auf $115/Fass (+43%), steigen Unitkosten um 30-35%. Bei Kurzstrecken mit 2-3% Gewinnmarge ist dies unbezahlbar.</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 mb-8">
          <InfoCard title="Lufthansa-Ankündigung" subtitle="April 2026">
            <ul className="space-y-1 text-sm text-slate-300">
              {DE_LH_ANNOUNCEMENT.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </InfoCard>

          <InfoCard title="Strategische Tiefe" subtitle="SAF-Wendepunkt">
            <p className="text-sm text-slate-300">Bei $110-130/Fass nähert sich SAF Kostenparität. Vorbereitung auf SAF-Dominanz nach 2028.</p>
          </InfoCard>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Kerosin-Kostenstruktur 2026</h2>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-6 mb-6">
            <h3 className="text-sky-300 font-semibold mb-4">Jet-A-1 Kostenaufschlüsselung</h3>
            <div className="space-y-2 text-sm">
              {DE_KEROSENE_BREAKDOWN.map((row) => (
                <div key={row.label} className="flex justify-between text-slate-300"><span>{row.label}</span><span className="font-mono">{row.value}</span></div>
              ))}
              <div className="flex justify-between font-semibold text-sky-300 border-t border-slate-700 pt-3 mt-3"><span>Durchschnitt Europa</span><span className="font-mono">$1,15/L</span></div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Deutschland als SAF-Fabrik</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-sky-800 bg-slate-950 p-6">
              <h3 className="text-sky-300 font-semibold mb-3">Warum Deutschland führt</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                {DE_ADVANTAGES.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="rounded-lg border border-green-800 bg-slate-950 p-6">
              <h3 className="text-green-300 font-semibold mb-3">Kostenvorteil</h3>
              <p className="text-sm text-slate-300">Deutsches Windstrom-SAF: 15-20% günstiger</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-sky-800 bg-slate-950 p-8">
          <h2 className="mb-4 text-2xl font-bold text-sky-300">Fazit</h2>
          <p className="text-slate-300">Lufthansas Flugkürzungen sind nicht Branchenverfall, sondern strategische Transformation. Deutschland hat ein Gold-Fenster bis 2030.</p>
        </section>

        <section className="mt-8 rounded-lg border border-slate-800 p-6">
          <p className="text-slate-400 text-sm mb-3">中文版本（Chinese Full Analysis）：</p>
          <Link href="/analysis/lufthansa-flight-cuts-2026-04" className="text-sky-300 underline">汉莎削减2万航班背后：可持续航油成本拐点到来 →</Link>
        </section>
      </div>
    </Shell>
  );
}
