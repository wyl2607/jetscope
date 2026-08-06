import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
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

const LUFTHANSA_NEWSROOM =
  'https://newsroom.lufthansagroup.com/en/lufthansa-group-optimises-flight-offering-in-summer-across-all-six-hubs/';

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
    <PageTemplate
      eyebrow="深度分析"
      title="汉莎削减2万航班背后：可持续航油成本拐点到来"
      question="这次运力削减，改变了 SAF 的采购时机吗？"
      asOf={null}
    >
      <SignalRow label="采购时机判断">
        <MetricCard
          label="采购姿态"
          value="进入复核窗口"
          valueClassName="text-warning"
          hint="削减运力说明成本压力已进入运营决策，但静态分析不足以直接下单。"
        />
        <MetricCard label="计划削减" value="20,000 班" hint="Lufthansa 公告所述、截至 2026 年 10 月的短途航班调整。" />
        <MetricCard label="参考拐点" value="$115/桶" hint="作者情景推算：此处 SAF 成本溢价开始进入可复核区间。" />
        <MetricCard label="德国航油溢价" value="5–10%" hint="文章采用的物流、税费与基础设施情景假设。" />
      </SignalRow>

      <Panel title="内容导航" why="按证据、成本、政策和行动顺序复核这篇静态事件分析。">
        <nav>
          <ul className="grid gap-2 text-sm text-muted">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>• <a href={item.href} className="text-accent underline">{item.label}</a></li>
            ))}
          </ul>
        </nav>
      </Panel>

      <Panel title="事件事实与参数冲击" why="先区分 Lufthansa 的公告事实与 JetScope 的情景参数，避免把推算当成实测。">
        <div className="grid gap-6 tabular-nums lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Lufthansa newsroom · 2026-04-21</p>
            <ul className="mt-3 space-y-3 text-sm leading-7 text-muted">
              {FACTS.map((fact) => <li key={fact}>• {fact}</li>)}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Source:{' '}
              <a className="text-accent underline" href={LUFTHANSA_NEWSROOM} target="_blank" rel="noreferrer">Lufthansa Group newsroom</a>
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-muted">
              <thead><tr className="border-b border-line"><th className="py-2 pr-4">参数</th><th className="py-2 pr-4">2026基准</th><th className="py-2 pr-4">汉莎冲击</th></tr></thead>
              <tbody>
                {[
                  ['原油 ($/桶)', BASELINE.crudeUsdPerBarrel, LUFTHANSA_SHOCK_2026Q2.crudeUsdPerBarrel],
                  ['碳价 ($/吨CO2)', BASELINE.carbonPriceUsdPerTonne, LUFTHANSA_SHOCK_2026Q2.carbonPriceUsdPerTonne],
                  ['补贴 ($/升)', BASELINE.subsidyUsdPerLiter.toFixed(2), LUFTHANSA_SHOCK_2026Q2.subsidyUsdPerLiter.toFixed(2)]
                ].map(([label, base, shock]) => (
                  <tr key={String(label)} className="border-b border-line"><td className="py-2 pr-4">{label}</td><td className="py-2 pr-4">{base}</td><td className="py-2 pr-4">{shock}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-sm leading-7 text-muted">这个冲击场景的含义：航司优先削减低利润短途运力，同时对 SAF 成本竞争力更敏感。</p>
          </div>
        </div>
      </Panel>

      <Panel title="事件概述与深层逻辑" why="把公告放进能源成本与合规压力的因果链，判断它是不是采购时机信号。">
        <div id="event-overview" className="scroll-mt-16 text-sm leading-7 tabular-nums">
          {EVENT_OVERVIEW.map((p, i) => (
            <RichP key={i} p={p} className={i < EVENT_OVERVIEW.length - 1 ? 'mb-4 text-muted' : 'text-muted'} />
          ))}
        </div>
      </Panel>

      <Panel title="航空燃油成本分解与德国溢价" why="成本构成决定油价冲击有多少会真正传导到 Lufthansa 的短途航线。">
        <div id="fuel-cost-breakdown" className="grid scroll-mt-16 gap-6 tabular-nums lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Jet-A-1 成本结构</h3>
            <p className="mt-3 text-sm text-muted">当前（2026 年 4 月），全球标准喷气燃料 Jet-A-1 的文章基准约为：</p>
            <div className="mt-4 space-y-3 rounded-xl bg-surface-muted p-4">
              {JET_A1_COSTS.map((row) => <div key={row.label} className="flex justify-between text-sm text-muted"><span>{row.label}</span><span>{row.value}</span></div>)}
              <div className="mt-3 border-t border-line pt-3"><div className="flex justify-between font-semibold"><span className="text-muted">现货价格（欧洲）</span><span className="text-accent">$1.20/升</span></div></div>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted"><strong>德国机场溢价：</strong>文章假设德国机场航油比欧洲平均价高 5–10%，即 $1.26–1.32/升。</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">为什么德国航司承压最大</h3>
            <ul className="mt-3 space-y-3 text-sm leading-7 text-muted">
              {GERMAN_PRESSURES.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title="SAF 成本转折点：$115/桶" why="采购团队要知道成本差在什么假设下收窄，以及结论对能源成本有多敏感。">
        <div id="saf-inflection" className="grid scroll-mt-16 gap-6 tabular-nums lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">糖基 ATJ 成本分析</h3>
            <div className="mt-4 space-y-3 rounded-xl bg-surface-muted p-4">
              {ATJ_COSTS.map((row) => <div key={row.label} className="flex justify-between text-sm text-muted"><span>{row.label}</span><span>{row.value}</span></div>)}
              <div className="mt-3 border-t border-line pt-3"><div className="flex justify-between font-semibold"><span className="text-muted">总成本（非可再生电力）</span><span className="text-accent">$1.60–1.85/升</span></div></div>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted"><strong>关键发现：</strong>使用文章假设的德国风电成本 $50–80/MWh 时，总成本可降至 $1.30–1.50/升。</p>
          </div>
          <div className="text-sm leading-7 text-muted">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">转折点数学</h3>
            <p className="mt-3">{SAF_INFLECTION_MATH.map((line) => <span key={line}>• {line}<br /></span>)}</p>
            <p className="mt-4">$115/桶是作者模型的触发价位；结合碳价与 ReFuelEU 假设，文章判断 2028 年左右成本差可能消失。</p>
            <h3 className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-accent">德国绿电作用</h3>
            <ul className="mt-3 space-y-2">{GREEN_ELECTRICITY_BENEFITS.map((item) => <li key={item}>• {item}</li>)}</ul>
          </div>
        </div>
      </Panel>

      <Panel title="市场驱动因素：ReFuelEU 与碳价" why="强制掺混与碳成本决定采购窗口是否会在油价回落后仍然存在。">
        <div id="market-drivers" className="grid scroll-mt-16 gap-6 tabular-nums lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">ReFuelEU 路线图 · 情景假设</h3>
            <div className="mt-4 space-y-3 text-sm">{REFUEL_EU_ROADMAP.map((row) => <div key={row.year}><p className="font-semibold text-muted">{row.year}</p><p className="text-muted">{row.detail}</p></div>)}</div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">EU ETS 驱动</h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-muted">{ETS_DRIVERS.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}</ul>
          </div>
        </div>
      </Panel>

      <Panel title="德国制造优势与产业机遇" why="本地供应链只有在能持续降低 SAF 成本和交付风险时，才会改变 Lufthansa 的采购选择。">
        <div id="germany-advantage" className="grid scroll-mt-16 gap-6 tabular-nums lg:grid-cols-2">
          <div><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">德国生产条件</h3><ul className="mt-4 space-y-4 text-sm leading-7 text-muted">{GERMANY_ADVANTAGES.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}</ul></div>
          <div><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Lufthansa 战略位置</h3><ul className="mt-4 space-y-3 text-sm leading-7 text-muted">{LUFTHANSA_STRATEGIC.map((row) => <li key={row.bold}><strong>• {row.bold}</strong> {row.text}</li>)}</ul></div>
        </div>
      </Panel>

      <Panel title="未来情景展望（2026–2030）" why="多情景比较能暴露结论对油价、政策和产能扩张假设的依赖。">
        <div id="outlook" className="scroll-mt-16 space-y-6 tabular-nums">
          <div className="grid gap-6 lg:grid-cols-3">{OUTLOOK_SCENARIOS.map((sc) => <div key={sc.title} className="rounded-xl border border-line bg-surface-muted p-4"><h3 className="text-lg font-semibold text-accent">{sc.title}</h3><p className="mt-3 text-sm leading-7 text-muted">{sc.body}</p></div>)}</div>
          <div>{KEY_INSIGHTS.map((text, i) => <p key={i} className={i === 0 ? 'text-sm leading-7 text-muted' : 'mt-4 text-sm leading-7 text-muted'}>{text}</p>)}</div>
        </div>
      </Panel>

      <Panel
        title="建议执行动作"
        why="把静态结论转成来源复核与情景测试，而不是直接当成采购指令。"
        action={<Link href="/analysis/lufthansa-2026-de" className="text-sm text-accent underline">Deutsche Vollversion →</Link>}
      >
        <div className="grid gap-6 tabular-nums lg:grid-cols-2">
          <div><ul className="space-y-3 text-sm leading-7 text-muted">{ACTION_ITEMS.map((item) => <li key={item}>• {item}</li>)}</ul><p className="mt-4 text-sm text-muted">快速入口：<Link className="text-accent underline" href="/scenarios">Scenarios</Link> · <Link className="text-accent underline" href="/sources">Sources</Link></p></div>
          <div className="space-y-3 text-sm leading-7 text-muted">{DISCLAIMER_PARAGRAPHS.map((text) => <p key={text}>{text}</p>)}</div>
        </div>
      </Panel>

      <SourceFooter
        sources={[
          { id: 'lufthansa-newsroom', label: 'Lufthansa Group newsroom：2026 年夏季航班计划调整公告', href: LUFTHANSA_NEWSROOM, basis: 'observed' },
          { id: 'author-cost-model', label: 'JetScope 作者成本拆解、拐点数学与 2026–2030 情景推算', basis: 'derived' },
          { id: 'refueleu-targets', label: '文章引用的 ReFuelEU 掺混比例与政策目标', basis: 'assumption' }
        ]}
        methodHref="/sources"
        methodLabel="来源口径与方法清单"
        limitations={[
          '本页是基于 2026 年 4 月事件的署名静态分析，不随市场价格或航班计划自动更新。',
          '除 Lufthansa 公告外，成本、溢价、投资需求和未来情景均为作者推算或政策假设，不是供应商报价。',
          '实际采购还需复核实时市场输入、供应商报价、合同条款、套保头寸与航线盈利能力。'
        ]}
      />
    </PageTemplate>
  );
}

// Shared article body for the legacy German analysis route. The route owns the
// PageTemplate so both entry files satisfy the adoption contract without
// nesting one full page shell inside another.
export function LufthansaAnalysisDE() {
  return (
    <>
      <SignalRow label="Beschaffungszeitpunkt">
        <MetricCard label="Beschaffungshaltung" value="Prüffenster geöffnet" valueClassName="text-warning" hint="Der Kostendruck rechtfertigt eine Prüfung, aber noch keine Bestellung." />
        <MetricCard label="Geplante Kürzung" value="20.000 Flüge" hint="Angekündigte Kurzstreckenanpassung bis Oktober 2026." />
        <MetricCard label="Referenz-Kipppunkt" value="$115/Fass" hint="Abgeleitete Schwelle des statischen Kostenmodells." />
      </SignalRow>
      <Panel title="Ereignis und strategische Tiefe" why="Die Ankündigung zeigt, ob Treibstoffdruck bereits operative Kapazitätsentscheidungen verändert.">
        <div className="grid gap-6 text-sm leading-7 text-muted tabular-nums lg:grid-cols-2">
          <div><p><strong>21. April 2026:</strong> Lufthansa Group kündigt an, bis Oktober 2026 etwa <strong>20.000 Kurzstreckenflüge</strong> zu streichen.</p><p className="mt-4">Treibstoff macht laut Artikel 20–30% der Betriebskosten aus; der Sprung von $80 auf $115/Fass wird als Belastung für margenschwache Strecken modelliert.</p></div>
          <div><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Lufthansa-Ankündigung</h3><ul className="mt-3 space-y-2">{DE_LH_ANNOUNCEMENT.map((item) => <li key={item}>• {item}</li>)}</ul></div>
        </div>
      </Panel>
      <Panel title="Kerosin-Kostenstruktur 2026" why="Die Kostenblöcke zeigen, wie weit der fossile Referenzpreis vom modellierten SAF-Bereich entfernt ist.">
        <div className="space-y-2 text-sm tabular-nums">{DE_KEROSENE_BREAKDOWN.map((row) => <div key={row.label} className="flex justify-between text-muted"><span>{row.label}</span><span>{row.value}</span></div>)}<div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold text-accent"><span>Durchschnitt Europa</span><span>$1,15/L</span></div></div>
      </Panel>
      <Panel title="Deutschland als SAF-Fabrik" why="Lokale Kosten- und Lieferkettenvorteile bestimmen, ob Lufthansa früher langfristige Abnahmeverträge prüfen sollte.">
        <div className="grid gap-6 tabular-nums lg:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Warum Deutschland führt</h3><ul className="mt-3 space-y-2 text-sm text-muted">{DE_ADVANTAGES.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="rounded-xl border border-success bg-success-soft p-4"><h3 className="font-semibold text-success">Kostenvorteil</h3><p className="mt-3 text-sm text-muted">Deutsches Windstrom-SAF: im Artikel 15–20% günstiger modelliert.</p></div></div>
      </Panel>
      <Panel title="Fazit" why="Die Schlussfolgerung übersetzt das Ereignis in eine begrenzte, überprüfbare Beschaffungshaltung.">
        <div className="text-sm leading-7 text-muted tabular-nums"><p>Lufthansas Flugkürzungen werden hier als strategische Transformation gelesen, nicht als Beleg für Branchenverfall.</p><p className="mt-4">Das angenommene deutsche Zeitfenster bis 2030 bleibt von Energiepreisen, Kapazitätsaufbau und belastbaren Abnahmeangeboten abhängig.</p><p className="mt-4"><Link href="/analysis/lufthansa-flight-cuts-2026-04" className="text-accent underline">中文版本 →</Link></p></div>
      </Panel>
    </>
  );
}
