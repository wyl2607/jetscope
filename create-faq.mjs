import fs from 'fs';
import path from 'path';

const faqDir = '/Users/yumei/SAFvsOil/apps/web/app/faq';
const faqPagePath = path.join(faqDir, 'page.tsx');

const faqContent = `import { Shell } from '@/components/shell';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '../seo';

export const revalidate = 3600;

export const metadata: Metadata = buildPageMetadata({
  title: 'FAQ - Sustainable Aviation Fuel (SAF) vs. Jet-A Pricing',
  description:
    'Comprehensive FAQs about sustainable aviation fuel (SAF), pricing dynamics, EU policies, ReFuelEU, carbon costs, and German aviation fuel markets.',
  path: '/faq'
});

type FAQItem = {
  id: string;
  question: string;
  answer: string | React.ReactNode;
};

const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'what-is-saf',
    question: 'What is Sustainable Aviation Fuel (SAF)?',
    answer: (
      <div className="space-y-4">
        <p>
          Sustainable Aviation Fuel (SAF), also known as Advanced Aviation Biofuel, is a drop-in replacement for conventional
          Jet-A kerosene. SAF is produced from sustainable feedstocks including:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>Waste oils and animal fats</li>
          <li>Municipal solid waste (MSW)</li>
          <li>Agricultural residues and forestry waste</li>
          <li>Dedicated energy crops (sugar-based, cellulose-based)</li>
          <li>Captured carbon dioxide (e-SAF / synthetic fuels)</li>
        </ul>
        <p>
          SAF can reduce lifecycle greenhouse gas emissions by 50–80% compared to conventional Jet-A, depending on feedstock and production
          method. See our <Link href="/analysis" className="text-sky-300 underline">analysis pages</Link> for market data.
        </p>
      </div>
    )
  },
  {
    id: 'saf-cost-premium',
    question: 'Why is SAF more expensive than Jet-A?',
    answer: (
      <div className="space-y-4">
        <p>SAF costs more due to several factors:</p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>Production scale:</strong> SAF plants are new and operate at smaller scale than traditional refineries, raising per-unit
            costs.
          </li>
          <li>
            <strong>Feedstock sourcing:</strong> Certified sustainable feedstocks (waste oils, MSW) have limited supply and require traceability.
          </li>
          <li>
            <strong>Conversion technology:</strong> Advanced processes like hydroprocessing (HEFA) and gasification require capital-intensive
            infrastructure.
          </li>
          <li>
            <strong>Certification & compliance:</strong> Sustainability certification (RSB, ISCC) and regulatory audits add costs.
          </li>
          <li>
            <strong>Blending requirements:</strong> SAF is typically blended 50% with Jet-A, limiting volume leverage.
          </li>
        </ul>
        <p>
          Currently, SAF trades at a 100–200% premium to Jet-A. Check real-time <Link href="/prices/germany-jet-fuel" className="text-sky-300 underline">
            fuel prices for Germany
          </Link> to see current spreads.
        </p>
      </div>
    )
  },
  {
    id: 'saf-cost-parity',
    question: 'When will SAF cost the same as Jet-A?',
    answer: (
      <div className="space-y-4">
        <p>Cost parity is expected through multiple mechanisms:</p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>Scale:</strong> New SAF plants (e.g., Neste, Total) reaching full capacity (2028–2030) will lower per-unit costs.
          </li>
          <li>
            <strong>Technology maturity:</strong> First-generation processes (HEFA, ATJ) will improve yields and reduce waste.
          </li>
          <li>
            <strong>Feedstock commoditization:</strong> As used cooking oil and MSW collection networks mature, feedstock costs stabilize.
          </li>
          <li>
            <strong>Carbon pricing:</strong> Rising EU ETS carbon prices (expected €100–150/ton by 2030) make Jet-A more expensive, narrowing the gap.
          </li>
          <li>
            <strong>Blending mandates:</strong> EU ReFuelEU rules will force airlines to buy SAF, increasing demand and supporting scaling.
          </li>
        </ul>
        <p>
          Industry consensus: <strong>structural cost parity by 2035–2040</strong>, with temporary parity achieved in 2028–2030 under high carbon
          prices.
        </p>
      </div>
    )
  },
  {
    id: 'germany-saf-advantage',
    question: 'What advantages does German SAF production have?',
    answer: (
      <div className="space-y-4">
        <p>Germany is emerging as a key SAF hub due to:</p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>Industrial legacy:</strong> Strong chemical & refining expertise; existing logistics and blending infrastructure at major airports
            (Frankfurt, Munich).
          </li>
          <li>
            <strong>Feedstock access:</strong> Access to Northern European waste oils, MSW from densely populated regions, and agricultural residues
            from Central Europe.
          </li>
          <li>
            <strong>Power costs:</strong> Abundant renewable energy (wind, solar) supports electrolytic hydrogen for e-SAF pathways.
          </li>
          <li>
            <strong>Policy support:</strong> German government backing for <strong>Power-to-Liquid (PtL)</strong> and <strong>Power-to-Gas (PtG)</strong> innovations.
          </li>
          <li>
            <strong>Aviation hub location:</strong> Frankfurt and Munich are major European aviation hubs, reducing logistics costs.
          </li>
        </ul>
        <p>
          See <Link href="/de/prices/germany-jet-fuel" className="text-sky-300 underline">
            German fuel prices
          </Link> and regional analysis for current market dynamics.
        </p>
      </div>
    )
  },
  {
    id: 'refueleu-policy',
    question: 'What is the ReFuelEU Aviation policy?',
    answer: (
      <div className="space-y-4">
        <p>
          <strong>ReFuelEU Aviation</strong> (Regulation EU 2023/2405) mandates minimum SAF blending targets for all fuel supplied at EU airports:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>2025: 2% SAF mandate</li>
          <li>2030: 6% SAF mandate</li>
          <li>2035: 20% SAF mandate</li>
          <li>2050: 70% SAF mandate</li>
        </ul>
        <p>Key features:</p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>Applies to all flights departing EU airports (including third-country carriers).</li>
          <li>Fuel suppliers bear the blending cost; airlines pay at pump.</li>
          <li>e-SAF (synthetic fuel from CO₂ + green hydrogen) counted at double credit until 2030.</li>
          <li>Non-compliance penalties: fuel surcharge up to €800 per ton of unmet SAF target.</li>
        </ul>
        <p>
          Impact: Forces scale-up of SAF production capacity and guarantees buyer demand, reducing market volatility. For airline operational impact,
          see <Link href="/analysis/lufthansa-flight-cuts-2026-04" className="text-sky-300 underline">
            Lufthansa flight cuts analysis
          </Link>.
        </p>
      </div>
    )
  },
  {
    id: 'lufthansa-saf-cuts',
    question: 'What is the connection between Lufthansa flight cuts and SAF?',
    answer: (
      <div className="space-y-4">
        <p>
          In April 2026, Lufthansa announced short-haul capacity cuts, citing high fuel prices and SAF costs as contributing factors:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>Margin compression:</strong> Short-haul routes are low-margin; SAF premium + high jet fuel prices reduce profitability below
            threshold.
          </li>
          <li>
            <strong>ReFuelEU mandate:</strong> Mandatory 2% SAF blending in 2025 adds €20–40/ton to fuel costs on every flight, making thin routes
            uneconomical.
          </li>
          <li>
            <strong>EU ETS carbon prices:</strong> Concurrent spike in carbon allowance costs further pressures airline margins.
          </li>
          <li>
            <strong>Capacity shift:</strong> Lufthansa reallocates aircraft to long-haul and high-density routes where higher fares offset SAF costs.
          </li>
        </ul>
        <p>
          Implication: ReFuelEU, while well-intentioned, accelerates industry consolidation and route rationalization. Read the full{' '}
          <Link href="/analysis/lufthansa-flight-cuts-2026-04" className="text-sky-300 underline">
            detailed analysis
          </Link>.
        </p>
      </div>
    )
  },
  {
    id: 'eu-ets-carbon-saf',
    question: 'How does the EU Emissions Trading System (ETS) affect SAF pricing?',
    answer: (
      <div className="space-y-4">
        <p>
          EU ETS is a cap-and-trade carbon market. Each ton of CO₂ emitted by airlines must be offset by a carbon allowance (EUA).
        </p>
        <p>
          <strong>Mechanism:</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>Jet-A emissions:</strong> Burning 1 ton of Jet-A releases ~3.16 tons of CO₂. Airlines buy EUAs (1 EUA = 1 ton of CO₂ offset) at
            current market price (~€95/EUA in April 2026).
          </li>
          <li>
            <strong>SAF advantage:</strong> SAF reduces lifecycle CO₂ by 50–80%, so airlines need fewer EUAs, offsetting ~50–80% of SAF premium via carbon
            savings.
          </li>
          <li>
            <strong>Price trigger:</strong> If EUA prices reach €150–200/ton, SAF premium collapses; airlines buy SAF for carbon savings, not mandate
            compliance.
          </li>
        </ul>
        <p>
          <strong>Break-even math:</strong> If SAF is 150% more expensive than Jet-A, but EUA prices reach €120/ton and SAF saves 60% of emissions,
          then SAF becomes cost-competitive on a fully-loaded basis.
        </p>
        <p>
          Forecast: Carbon prices expected to rise 8–15% annually through 2030, accelerating SAF economics. See <Link href="/scenarios" className="text-sky-300 underline">
            scenario modeling
          </Link> for sensitivity analysis.
        </p>
      </div>
    )
  },
  {
    id: 'atj-inflection-point',
    question: 'What is the inflection point for sugar-based Alcohol-to-Jet (ATJ) SAF?',
    answer: (
      <div className="space-y-4">
        <p>
          <strong>Alcohol-to-Jet (ATJ)</strong> converts ethanol (from sugarcane, corn, or cellulose) into Jet-A-compatible fuel via advanced
          hydroprocessing.
        </p>
        <p>
          <strong>Inflection point factors:</strong>
        </p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>Ethanol price:</strong> Currently €0.50–0.70/liter; needs to drop to €0.30–0.40/liter for ATJ to be cost-competitive (depends on
            sugar prices, crop yields).
          </li>
          <li>
            <strong>Conversion efficiency:</strong> Current ASTM-certified ATJ achieves ~88% yield; needs ~92% to hit cost targets.
          </li>
          <li>
            <strong>Capital recovery:</strong> ATJ plants (€300–500M per facility) need 10–12 years to break even; government subsidies or long-term
            contracts accelerate this.
          </li>
          <li>
            <strong>Feedstock sustainability:</strong> Only waste-based ethanol (cellulosic) qualifies for full EU sustainability credits; food-based
            ethanol faces policy headwinds post-2030.
          </li>
        </ul>
        <p>
          <strong>Timeline:</strong> ATJ break-even expected 2032–2035 in EU, driven by scale-up of cellulosic ethanol capacity and policy support
          for circular economy feedstocks.
        </p>
      </div>
    )
  },
  {
    id: 'german-jet-fuel-expensive',
    question: 'Why is German aviation fuel so expensive compared to other European locations?',
    answer: (
      <div className="space-y-4">
        <p>
          German jet fuel (Jet-A1) commands a price premium over other European hubs due to:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>Location premium:</strong> Frankfurt and Munich are landlocked, requiring more expensive inland logistics vs. coastal refineries
            (Rotterdam, Antwerp).
          </li>
          <li>
            <strong>Airport fees:</strong> German airports charge higher fuel-handling and storage fees; Frankfurt is especially expensive.
          </li>
          <li>
            <strong>Tax burden:</strong> Energy tax on aviation fuel varies by EU member; Germany's structure can raise costs.
          </li>
          <li>
            <strong>SAF blending cost:</strong> ReFuelEU mandate requires higher SAF blend percentages at major EU hubs, and fuel suppliers pass
            this cost to airports.
          </li>
          <li>
            <strong>Market concentration:</strong> Few suppliers (Neste, Shell, Total) control supply; limited competition on delivery costs.
          </li>
          <li>
            <strong>Winter demand:</strong> German weather increases heating oil demand, competing for refinery capacity; fuel suppliers prioritize
            higher-margin products.
          </li>
        </ul>
        <p>
          Check <Link href="/prices/germany-jet-fuel" className="text-sky-300 underline">
            real-time German jet fuel prices
          </Link> and compare regional dynamics on our dashboard.
        </p>
      </div>
    )
  },
  {
    id: 'how-to-use-site',
    question: 'How do I use this site's analysis tools?',
    answer: (
      <div className="space-y-4">
        <p>SAFvsOil provides real-time and historical data on SAF vs. Jet-A pricing, policy impacts, and airline strategy:</p>
        <ul className="list-disc space-y-2 pl-5 text-slate-300">
          <li>
            <strong>
              <Link href="/dashboard" className="text-sky-300 underline">
                Dashboard
              </Link>
            </strong>
            : Real-time SAF and Jet-A price trends, EU ETS carbon prices, ReFuelEU mandate progress, and key metrics.
          </li>
          <li>
            <strong>
              <Link href="/prices/germany-jet-fuel" className="text-sky-300 underline">
                Prices (Germany)
              </Link>
            </strong>
            : Historical and current jet fuel pricing at Frankfurt and Munich, with SAF premium tracking.
          </li>
          <li>
            <strong>
              <Link href="/analysis" className="text-sky-300 underline">
                Analysis
              </Link>
            </strong>
            : Deep-dive research on airline strategies (e.g., Lufthansa cuts), policy changes, and market inflection points.
          </li>
          <li>
            <strong>
              <Link href="/scenarios" className="text-sky-300 underline">
                Scenarios
              </Link>
            </strong>
            : Model-driven forecasts of SAF cost trajectories under different carbon price, scale, and policy scenarios.
          </li>
          <li>
            <strong>
              <Link href="/sources" className="text-sky-300 underline">
                Sources
              </Link>
            </strong>
            : Data attribution, methodology, and links to original reports.
          </li>
        </ul>
        <p>
          All pages are SEO-optimized for search engines and support structured data (JSON-LD schema). Data is updated daily; refresh interval
          depends on data source.
        </p>
      </div>
    )
  }
];

function FAQPageContent() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          typeof item.answer === 'string'
            ? item.answer
            : extractTextFromAnswer(item.answer)
      }
    }))
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Shell
        eyebrow="Frequently asked questions"
        title="SAF, Aviation Fuel & Climate Policy"
        description="Common questions about sustainable aviation fuel (SAF), pricing, EU regulations, and market dynamics."
      >
        <div className="space-y-8">
          {FAQ_ITEMS.map((item, idx) => (
            <article
              key={item.id}
              className="border-b border-slate-700 pb-8 last:border-0"
              itemScope
              itemType="https://schema.org/Question"
            >
              <h2 className="text-lg font-semibold text-slate-100" itemProp="name">
                Q{idx + 1}: {item.question}
              </h2>
              <div
                className="mt-4 space-y-3 text-slate-300"
                itemProp="acceptedAnswer"
                itemScope
                itemType="https://schema.org/Answer"
              >
                <div itemProp="text">{item.answer}</div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-lg border border-slate-700 bg-slate-900 p-6">
          <h3 className="font-semibold text-slate-100">Still have questions?</h3>
          <p className="mt-2 text-sm text-slate-400">
            Check our <Link href="/sources" className="text-sky-300 underline">
              sources
            </Link> page for data attribution and original reports. For data inquiries or feedback, contact the research team.
          </p>
        </div>
      </Shell>
    </>
  );
}

function extractTextFromAnswer(answerElement: React.ReactNode): string {
  if (typeof answerElement === 'string') return answerElement;
  if (React.isValidElement(answerElement)) {
    const children = answerElement.props.children;
    if (Array.isArray(children)) {
      return children
        .map((child: React.ReactNode) => extractTextFromAnswer(child))
        .join(' ');
    }
    if (typeof children === 'string') return children;
  }
  return '';
}

export default FAQPageContent;
`;

// Ensure directory exists
if (!fs.existsSync(faqDir)) {
  fs.mkdirSync(faqDir, { recursive: true });
}

// Write the page
fs.writeFileSync(faqPagePath, faqContent, 'utf-8');
console.log('✅ FAQ page created at', faqPagePath);
