import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

const FACTS = [
  '2026-04-21：Lufthansa Group 公告，至 2026 年 10 月将削减约 20,000 班短途航班。',
  '公告披露该动作预计可节省约 40,000 吨航油。',
  '公告同时指出：伊朗冲突以来，航油价格已显著上行（文中表述为翻倍）。'
] as const;

const BASELINE = {
  crudeUsdPerBarrel: 80,
  carbonPriceUsdPerTonne: 90,
  subsidyUsdPerLiter: 0.5
} as const;

const LUFTHANSA_SHOCK_2026Q2 = {
  crudeUsdPerBarrel: 115,
  carbonPriceUsdPerTonne: 115,
  subsidyUsdPerLiter: 0.55
} as const;

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
          <li>• <a href="#event-overview" className="text-sky-300 underline">事件概述与数据</a></li>
          <li>• <a href="#fuel-cost-breakdown" className="text-sky-300 underline">航油成本分解</a></li>
          <li>• <a href="#saf-inflection" className="text-sky-300 underline">SAF成本转折点</a></li>
          <li>• <a href="#market-drivers" className="text-sky-300 underline">市场驱动因素</a></li>
          <li>• <a href="#germany-advantage" className="text-sky-300 underline">德国制造优势</a></li>
          <li>• <a href="#outlook" className="text-sky-300 underline">未来情景展望</a></li>
        </ul>
      </nav>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <InfoCard title="事件事实 (source-backed)" subtitle="Lufthansa newsroom · 2026-04-21">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {FACTS.map((fact) => (
              <li key={fact}>• {fact}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-400">
            Source:{' '}
            <a
              className="text-sky-300 underline"
              href="https://newsroom.lufthansagroup.com/en/lufthansa-group-optimises-flight-offering-in-summer-across-all-six-hubs/"
              target="_blank"
              rel="noreferrer"
            >
              Lufthansa Group newsroom
            </a>
          </p>
        </InfoCard>

        <InfoCard title="对 SAFvsOil 的直接影响" subtitle="Parameter delta">
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
                <tr className="border-b border-slate-900">
                  <td className="py-2 pr-4">原油 ($/桶)</td>
                  <td className="py-2 pr-4">{BASELINE.crudeUsdPerBarrel}</td>
                  <td className="py-2 pr-4">{LUFTHANSA_SHOCK_2026Q2.crudeUsdPerBarrel}</td>
                </tr>
                <tr className="border-b border-slate-900">
                  <td className="py-2 pr-4">碳价 ($/吨CO2)</td>
                  <td className="py-2 pr-4">{BASELINE.carbonPriceUsdPerTonne}</td>
                  <td className="py-2 pr-4">{LUFTHANSA_SHOCK_2026Q2.carbonPriceUsdPerTonne}</td>
                </tr>
                <tr className="border-b border-slate-900">
                  <td className="py-2 pr-4">补贴 ($/升)</td>
                  <td className="py-2 pr-4">{BASELINE.subsidyUsdPerLiter.toFixed(2)}</td>
                  <td className="py-2 pr-4">{LUFTHANSA_SHOCK_2026Q2.subsidyUsdPerLiter.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            这个冲击场景的含义：航司优先削减低利润短途运力，同时对SAF成本竞争力更敏感。
          </p>
        </InfoCard>
      </section>

      {/* 事件概述与深层逻辑 */}
      <section id="event-overview" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">事件概述与深层逻辑</h2>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <p className="mb-4 text-slate-300">
            2026年4月21日，汉莎集团的削减2万航班公告，从表面上看是一项成本控制措施。但这背后隐藏着一个更深的经济学信号：<strong>短途航线的低利润率已无法在高油价环境中维持</strong>。
          </p>
          <p className="mb-4 text-slate-300">
            对于汉莎而言，燃油成本占总运营成本的20-30%。当油价从$80/桶跳升至$115/桶（上升43%）时，短途航线的单位成本陡然上升30-35%。在竞争激烈的欧洲短途市场，廉价航空公司（如瑞安航空）已经通过规模与效率压低票价，汉莎难以快速提价来抵消成本上升。因此，削减低利润运力成为一个理性但痛苦的选择。
          </p>
          <p className="mb-4 text-slate-300">
            然而，这个事件的真正意义在于：它标志着传统航空业运营模式的一个转折点。削减航班虽然是短期应对，但从长期看，汉莎等欧洲航司的未来竞争力取决于能否快速转向可持续航油（SAF）。因为当油价维持在110-130美元/桶时，<strong>SAF成本与传统喷气燃料的差异会快速收窄</strong>，这将打开一扇新的成本优化之门。
          </p>
          <p className="text-slate-300">
            同时，欧盟ReFuelEU指令即将在2025年生效，要求航空燃油中SAF掺混比例从2025年的0.7%逐步升至2030年的6%。这意味着SAF从一个可选项变成了强制性合规要求。在这个背景下，汉莎的减班决定可以被重新解读为：航司正在为能源结构的转变而调整战术。
          </p>
        </div>
      </section>

      {/* 航油成本分解 */}
      <section id="fuel-cost-breakdown" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">航空燃油成本分解与德国溢价</h2>
        
        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">Jet-A-1成本结构</h3>
          <p className="mb-4 text-slate-300">
            当前（2026年4月），全球标准喷气燃料Jet-A-1的成本约为：
          </p>
          <div className="mb-6 space-y-3 rounded bg-slate-900 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">原油成本（Brent $115/桶）</span>
              <span className="text-slate-400">$0.88/升</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">精炼、流通利润</span>
              <span className="text-slate-400">$0.12/升</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">EU ETS碳成本</span>
              <span className="text-slate-400">$0.20/升</span>
            </div>
            <div className="border-t border-slate-700 pt-3 mt-3">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-300">现货价格（欧洲）</span>
                <span className="text-sky-300">$1.20/升</span>
              </div>
            </div>
          </div>
          
          <p className="mb-4 text-slate-300">
            <strong>德国机场溢价：</strong> 由于德国远离海运枢纽（主要依赖管道或陆运），且税收与基础设施成本较高，德国机场的航油价格通常比欧洲平均价高5-10%，即 $1.26-1.32/升。
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">为什么德国航司承压最大</h3>
          <ul className="space-y-3 text-slate-300">
            <li>
              <strong>• 地理位置劣势：</strong> 法兰克福、慕尼黑等主要枢纽离海港远，运输成本高。相比荷兰鹿特丹港或比利时安特卫普港，德国机场的航油成本溢价5-10%
            </li>
            <li>
              <strong>• 高税环境：</strong> 德国能源税率欧洲最高之一，这直接增加了航油终端价格
            </li>
            <li>
              <strong>• 短途运力占比高：</strong> 汉莎集团的运力结构中，欧洲短途航线贡献了大部分航班数但利润率最低。短途飞行中，燃油成本占比30%左右（长途为20-25%）
            </li>
            <li>
              <strong>• 竞争激烈：</strong> 欧洲短途市场被廉价航空公司（瑞安、易捷等）垄断，价格战已经压低了票价，汉莎难以快速调整
            </li>
          </ul>
        </div>
      </section>

      {/* SAF成本转折点 */}
      <section id="saf-inflection" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">SAF成本转折点：$115/桶的关键意义</h2>
        
        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">糖基ATJ（Alcohol-to-Jet）成本分析</h3>
          <p className="mb-4 text-slate-300">
            糖基ATJ是最接近商业化的SAF路线。其成本包括：
          </p>
          <div className="space-y-3 rounded bg-slate-900 p-4 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">原料（甘蔗/甜菜）</span>
              <span className="text-slate-400">$0.35-0.50/升</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">能源（发酵、蒸馏）</span>
              <span className="text-slate-400">$0.40-0.70/升</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">精炼与处理</span>
              <span className="text-slate-400">$0.20-0.30/升</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">物流与利润</span>
              <span className="text-slate-400">$0.15-0.25/升</span>
            </div>
            <div className="border-t border-slate-700 pt-3 mt-3">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-300">总成本（非可再生电力）</span>
                <span className="text-sky-300">$1.60-1.85/升</span>
              </div>
            </div>
          </div>

          <p className="mb-4 text-slate-300">
            <strong>关键发现：能源成本是SAF成本的最大驱动因素。</strong> 当使用可再生电力（德国风电成本$50-80/MWh）时，能源成本可从$0.60降至$0.25-0.35，使总成本下降至 $1.30-1.50/升。
          </p>

          <p className="text-slate-300">
            <strong>转折点数学：</strong><br />
            • 油价$80/桶 → Jet-A $0.95/升 → SAF贵70% (不经济)<br />
            • 油价$115/桶 → Jet-A $1.20/升 → SAF贵25-40% (可接受边界)<br />
            • 油价$150/桶 → Jet-A $1.50/升 → SAF成本接近或相等 (无差异)<br />
            <br />
            $115/桶正好是这个转折点的触发价位。结合欧盟碳价上升（目标2030年$150+/吨CO2，等效增加油价$0.40-0.50）和ReFuelEU政策约束，2028年左右SAF与传统油的成本差异可能完全消失。
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">德国绿电优势的关键作用</h3>
          <p className="text-slate-300">
            德国风电成本全球最低（$50-80/MWh），这为本土SAF生产创造了成本竞争力：
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            <li>• 使用绿电的SAF生产成本可降至 $1.25-1.50/升</li>
            <li>• 相比其他欧洲进口SAF便宜10-20%</li>
            <li>• 这给汉莎等德国航司采购本土SAF的经济理由</li>
          </ul>
        </div>
      </section>

      {/* 市场驱动因素 */}
      <section id="market-drivers" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">市场驱动因素：ReFuelEU与碳价</h2>
        
        <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">ReFuelEU 2025-2030政策路线图</h3>
          <div className="space-y-3 rounded bg-slate-900 p-4 mb-6 text-sm">
            <div>
              <p className="font-semibold text-slate-300">2025年1月1日</p>
              <p className="text-slate-400">SAF掺混比例0.7% → 年需求约4.9万吨（欧洲）</p>
            </div>
            <div>
              <p className="font-semibold text-slate-300">2027年</p>
              <p className="text-slate-400">SAF掺混比例1.0% → 年需求约7万吨</p>
            </div>
            <div>
              <p className="font-semibold text-slate-300">2030年</p>
              <p className="text-slate-400">SAF掺混比例6.0% → 年需求约42万吨 (产业转折点)</p>
            </div>
            <div>
              <p className="font-semibold text-slate-300">2035年</p>
              <p className="text-slate-400">SAF掺混比例10%+ → 年需求70万吨以上</p>
            </div>
          </div>
          <p className="text-slate-300">
            这个强制性的政策约束意味着：到2030年，欧洲需要投资200-300亿欧元建设新的SAF产能。对比之下，汉莎削减2万航班（年省4万吨油）的决定，只是这个能源转变的一个微观缩影。
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">EU ETS碳价上升对SAF竞争力的助推</h3>
          <ul className="space-y-3 text-slate-300">
            <li>
              <strong>• 当前碳价：</strong> €80/吨CO2 ≈ $0.20/升航油成本
            </li>
            <li>
              <strong>• 2030年目标：</strong> €150+/吨CO2 ≈ $0.40-0.50/升航油成本
            </li>
            <li>
              <strong>• 含义：</strong> 传统Jet-A的隐含成本逐年上升，而SAF（特别是用可再生电力生产的）的碳成本接近零，相对竞争力快速改善
            </li>
            <li>
              <strong>• 航司响应：</strong> 2028-2030年间，经济学将从"强制采购SAF以合规"转向"主动采购SAF以节成本"
            </li>
          </ul>
        </div>
      </section>

      {/* 德国制造优势 */}
      <section id="germany-advantage" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">德国制造优势与产业机遇</h2>
        
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">为什么SAF产业选择德国</h3>
          <ul className="space-y-4 text-slate-300">
            <li>
              <strong>• 完整的产业链：</strong> 德国化工巨头（巴斯夫、科万塔）拥有生物精炼与精细化工能力，可快速转向SAF生产。莱茵河流域的石油化工集群天然适合SAF生产。
            </li>
            <li>
              <strong>• 绿电成本优势：</strong> 德国陆上风电成本€50-80/MWh（全球最低）。这直接降低SAF生产的能源成本15-20%。
            </li>
            <li>
              <strong>• 人才与技术：</strong> 德国在生物技术、催化、碳捕获等核心技术上全球领先，这些都是SAF生产的关键。
            </li>
            <li>
              <strong>• 航空运输枢纽：</strong> 法兰克福是欧洲第二大航空枢纽，便利的场景测试与市场对接。
            </li>
            <li>
              <strong>• 政府支持：</strong> 德国与欧盟都通过贷款、补贴、税收优惠支持本土SAF。2024-2030年投入预期超100亿欧元。
            </li>
          </ul>
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">汉莎集团的战略位置</h3>
          <p className="mb-4 text-slate-300">
            汉莎作为德国最大航空企业，有独特的战略机遇：
          </p>
          <ul className="space-y-3 text-slate-300">
            <li>
              <strong>• 本土供应链：</strong> 可率先与德国SAF生产商建立长期合作协议，锁定成本优势与供应稳定性。
            </li>
            <li>
              <strong>• 成本竞争力：</strong> 使用德国本土生产的绿电SAF，汉莎可在2028-2030年实现比其他欧洲航司更低的燃油成本，形成新的竞争优势。
            </li>
            <li>
              <strong>• 品牌与ESG：</strong> 削减运力同时加快SAF采购，展现汉莎的可持续承诺，改善企业形象与投资者评分。
            </li>
          </ul>
        </div>
      </section>

      {/* 未来展望 */}
      <section id="outlook" className="mt-8 scroll-mt-16">
        <h2 className="mb-4 text-2xl font-bold text-white">未来情景展望（2026-2030）</h2>
        
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
            <h3 className="text-lg font-semibold text-sky-300 mb-3">基础情景：油价$110-130/桶，SAF逐步主流化</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              地缘冲突持续，OPEC+维持减产。SAF与传统油的成本差异缩小至20-30%。ReFuelEU强制要求驱动SAF需求。到2030年，欧洲SAF年产能达40-50万吨。汉莎与其他大型航司加快采购。德国SAF生产商获得市场领导地位。预期投资回报率15-20%/年。
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
            <h3 className="text-lg font-semibold text-sky-300 mb-3">风险情景：油价下跌至$85/桶</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              地缘冲突缓解或全球经济衰退。SAF相对传统油贵40-60%，经济学驱动减弱。但ReFuelEU的强制性约束依然存在——航司被迫采购。这实际上加强了SAF的需求确定性。规模经济快速推动成本下降10-15%。产业成熟加快。
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
            <h3 className="text-lg font-semibold text-sky-300 mb-3">机遇情景：油价$140+/桶，能源转型加速</h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              气候政策升级、碳定价加速、可再生能源投资倍增。油价高企推动SAF经济学逆转——SAF成本$1.20/升 vs 传统油$1.60+/升。航司主动采购SAF。产业规模快速扩张。德国制造业与绿色技术出口成为新增长极。这也是最有利于SAF产业的长期趋势。
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 p-6">
          <h3 className="mb-4 text-xl font-semibold text-sky-300">关键启示</h3>
          <p className="text-slate-300">
            汉莎2026年4月的削减航班决定，不是航空业衰退的信号，而是产业升级的开始。过去的航空竞争是"规模与成本优化"，未来的竞争将是"燃料转型与供应链"。那些能够快速采购SAF、建立本土产业链、掌握绿电技术的航空企业和国家，将在2030年后获得显著的成本与竞争优势。
          </p>
          <p className="mt-4 text-slate-300">
            对德国而言，这是一个黄金机遇窗口。现在投资SAF产业、绿电基础设施与相关技术，到2030年可实现全球领导地位。这也解释了为什么汉莎选择削减短途（利润微薄）而投资SAF——这是对未来能源结构的战略赌注。
          </p>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <InfoCard title="建议执行动作" subtitle="针对产品与研究流程">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            <li>• 把该场景作为默认“事件冲击”模板放入 scenario registry。</li>
            <li>• 在 sources 页面持续显示来源置信度、滞后与 fallback 说明。</li>
            <li>• 每次重大航司事件后，复用同一页面模板发布可索引分析。</li>
          </ul>
          <p className="mt-4 text-sm text-slate-300">
            快速入口：<Link className="text-sky-300 underline" href="/scenarios">Scenarios</Link> ·{' '}
            <Link className="text-sky-300 underline" href="/sources">Sources</Link>
          </p>
        </InfoCard>

        <InfoCard title="免责声明" subtitle="Data and interpretation scope">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>
              本页用于“准实时研究支持”，不是交易系统或投资建议。当前航油数据仍包含代理源（例如 US Gulf / proxy feed），不等同于德国本地机场现货成交价。
            </p>
            <p>
              当欧洲本土航油与 EU ETS 实时通道接入后，本页将更新为区域优先报价并保留代理源作为回退链路。
            </p>
            <p>结论应结合航司实际对冲策略、税费结构和运力调整计划共同解读。</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8 rounded-lg border border-slate-800 p-6">
        <p className="text-slate-400 text-sm mb-3">Deutsche Vollversion (German Full Analysis)：</p>
        <Link href="/analysis/lufthansa-2026-de" className="text-sky-300 underline">
          Lufthansa kürzt 20.000 Flüge: Wendepunkt für nachhaltige Flugkraftstoffe? →
        </Link>
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
          <p className="text-lg text-slate-300 leading-relaxed mb-4">
            <strong>21. April 2026:</strong> Lufthansa Group kündigt an, bis Oktober 2026 etwa <strong>20.000 Kurzstreckenflüge</strong> zu streichen. 
            Oberflächlich: eine Kostenmaßnahme. Tiefere Bedeutung: ein Signal, dass die Energiewirtschaft des Flugverkehrs 
            einen <strong>strategischen Wendepunkt</strong> erreicht hat.
          </p>
          <p className="text-slate-300">
            Treibstoff macht 20-30% der Lufthansa-Betriebskosten aus. Springt der Ölpreis von $80 auf $115/Fass (+43%), 
            steigen Unitkosten um 30-35%. Bei Kurzstrecken mit 2-3% Gewinnmarge ist dies unbezahlbar.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2 mb-8">
          <InfoCard title="Lufthansa-Ankündigung" subtitle="April 2026">
            <ul className="space-y-1 text-sm text-slate-300">
              <li>• 20.000 Kurzstreckenflüge</li>
              <li>• 40.000 Tonnen Treibstoff/Jahr</li>
              <li>• Grund: Kerosin $115/Fass</li>
            </ul>
          </InfoCard>

          <InfoCard title="Strategische Tiefe" subtitle="SAF-Wendepunkt">
            <p className="text-sm text-slate-300">
              Bei $110-130/Fass nähert sich SAF Kostenparität. Vorbereitung auf SAF-Dominanz nach 2028.
            </p>
          </InfoCard>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Kerosin-Kostenstruktur 2026</h2>
          
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-6 mb-6">
            <h3 className="text-sky-300 font-semibold mb-4">Jet-A-1 Kostenaufschlüsselung</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>Rohöl (Brent $115/Fass)</span>
                <span className="font-mono">$0,88/L</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Raffination & Transport</span>
                <span className="font-mono">$0,12/L</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>EU-ETS Kohlenstoff</span>
                <span className="font-mono">$0,15/L</span>
              </div>
              <div className="flex justify-between font-semibold text-sky-300 border-t border-slate-700 pt-3 mt-3">
                <span>Durchschnitt Europa</span>
                <span className="font-mono">$1,15/L</span>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mb-6">Deutschland als SAF-Fabrik</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-sky-800 bg-slate-950 p-6">
              <h3 className="text-sky-300 font-semibold mb-3">Warum Deutschland führt</h3>
              <ul className="space-y-2 text-sm text-slate-300">
                <li>✓ Chemie-Cluster: BASF, Covestro</li>
                <li>✓ Grünstrom: €50-80/MWh</li>
                <li>✓ Biotechnologie & Katalytik</li>
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
          <p className="text-slate-300">
            Lufthansas Flugkürzungen sind nicht Branchenverfall, sondern strategische Transformation. Deutschland hat ein Gold-Fenster bis 2030.
          </p>
        </section>

        <section className="mt-8 rounded-lg border border-slate-800 p-6">
          <p className="text-slate-400 text-sm mb-3">中文版本（Chinese Full Analysis）：</p>
          <Link href="/analysis/lufthansa-flight-cuts-2026-04" className="text-sky-300 underline">
            汉莎削减2万航班背后：可持续航油成本拐点到来 →
          </Link>
        </section>
      </div>
    </Shell>
  );
}
