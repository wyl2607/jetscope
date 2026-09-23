import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { MetricCard } from '@/components/cards';
import { LUFT_DATA } from '@/app/analysis/lufthansa-flight-cuts-2026-04/data';
import type { NavLocale } from '@/lib/navigation';
import Link from 'next/link';

const tippingPointWorkbench = {
  zh: { href: '/crisis/saf-tipping-point', label: '用临界点工作台自己算一遍' },
  de: { href: '/de/crisis', label: 'Im Kipppunkt-Arbeitsbereich selbst nachrechnen' },
  en: { href: '/en/crisis', label: 'Run the numbers yourself in the tipping-point workbench' }
} as const;

export function LufthansaCase({ locale }: { locale: NavLocale }) {
  const data = LUFT_DATA[locale];
  const workbench = tippingPointWorkbench[locale];

  return (
    <PageTemplate
      locale={locale}
      eyebrow={data.pageTemplate.eyebrow}
      title={data.pageTemplate.title}
      question={data.pageTemplate.question}
      asOf={null}
    >
      <SignalRow label={data.signalRow.label}>
        {data.signalRow.cards.map((card: any) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            valueClassName={card.valueClassName}
            hint={card.hint}
          />
        ))}
      </SignalRow>

      <Panel title={data.panels.eventOverview.title} why={data.panels.eventOverview.why}>
        <div className="space-y-6 text-sm leading-7 text-muted tabular-nums">
          {data.panels.eventOverview.paragraphs.map((p: any, i: any) => (
            <p key={i} dangerouslySetInnerHTML={{ __html: p }} />
          ))}
        </div>
      </Panel>

      <Panel title={data.panels.costBreakdown.title} why={data.panels.costBreakdown.why}>
        <div className="space-y-2 text-sm tabular-nums">
          {data.panels.costBreakdown.rows.map((row: any) => (
            <div key={row.label} className="flex justify-between text-muted">
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
          <div className="mt-3 flex justify-between border-t border-line pt-3 font-semibold text-accent">
            <span>{data.panels.costBreakdown.totalLabel}</span>
            <span>{data.panels.costBreakdown.totalValue}</span>
          </div>
        </div>
      </Panel>

      <Panel title={data.panels.safInflection.title} why={data.panels.safInflection.why}>
        <div className="space-y-5 tabular-nums">
          <div className="grid gap-6 md:grid-cols-3">
            {data.panels.safInflection.cards.map((card: any) => (
              <div key={card.oil} className={`rounded-xl border p-4 ${card.tone}`}>
                <p className="text-sm font-semibold">{card.oil}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em]">{data.panels.safInflection.jetLabel}</p>
                <p className="text-lg font-semibold">{card.jet}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em]">{data.panels.safInflection.safLabel}</p>
                <p className="text-lg font-semibold">{card.saf}</p>
                <p className="mt-3 text-sm">{data.panels.safInflection.spreadLabel}: {card.spread}</p>
              </div>
            ))}
          </div>
          <p className="text-sm leading-7 text-muted">{data.panels.safInflection.summary}</p>
        </div>
      </Panel>

      <Panel title={data.panels.marketDrivers.title} why={data.panels.marketDrivers.why}>
        <div className="grid gap-6 tabular-nums lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">{data.panels.marketDrivers.refuelEuTitle}</h3>
            <div className="mt-4 space-y-3 text-sm">
              {data.panels.marketDrivers.refuelEuRows.map((row: any) => (
                <div key={row.year}>
                  <p className="font-semibold text-muted">{row.year}</p>
                  <p className="text-muted">{row.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{data.panels.marketDrivers.etsTitle}</h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-muted">
              {data.panels.marketDrivers.etsRows.map((row: any) => (
                <li key={row.bold}>
                  <strong>• {row.bold}</strong> {row.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title={data.panels.germanyAdvantage.title} why={data.panels.germanyAdvantage.why}>
        <div className="grid gap-6 tabular-nums lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{data.panels.germanyAdvantage.conditionsTitle}</h3>
            <ul className="mt-4 space-y-4 text-sm leading-7 text-muted">
              {data.panels.germanyAdvantage.conditions.map((row: any) => (
                <li key={row.bold}>
                  <strong>• {row.bold}</strong> {row.text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{data.panels.germanyAdvantage.strategyTitle}</h3>
            <ul className="mt-4 space-y-3 text-sm leading-7 text-muted">
              {data.panels.germanyAdvantage.strategy.map((row: any) => (
                <li key={row.bold}>
                  <strong>• {row.bold}</strong> {row.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>

      <Panel title={data.panels.outlook.title} why={data.panels.outlook.why}>
        <div className="space-y-6 tabular-nums">
          <div className="grid gap-6 lg:grid-cols-3">
            {data.panels.outlook.scenarios.map((sc: any) => (
              <div key={sc.title} className="rounded-xl border border-line bg-surface-muted p-4">
                <h3 className="text-lg font-semibold text-accent">{sc.title}</h3>
                <p className="mt-3 text-sm leading-7 text-muted">{sc.body}</p>
              </div>
            ))}
          </div>
          <div>
            {data.panels.outlook.insights.map((text: any, i: any) => (
              <p key={i} className={i === 0 ? 'text-sm leading-7 text-muted' : 'mt-4 text-sm leading-7 text-muted'}>
                {text}
              </p>
            ))}
            <Link
              className="mt-4 inline-block text-sm font-medium text-accent underline"
              href={workbench.href}
            >
              {workbench.label}
            </Link>
          </div>
        </div>
      </Panel>

      <Panel title={data.panels.actions.title} why={data.panels.actions.why}>
        <div className="grid gap-6 tabular-nums lg:grid-cols-2">
          <div>
            <ul className="space-y-3 text-sm leading-7 text-muted">
              {data.panels.actions.items.map((item: any) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-muted">
              {data.panels.actions.fastLinksLabel}{' '}
              <Link className="text-accent underline" href={data.panels.actions.scenarioLink}>Scenarios</Link> ·{' '}
              <Link className="text-accent underline" href={data.panels.actions.sourceLink}>Sources</Link>
            </p>
          </div>
          <div className="space-y-3 text-sm leading-7 text-muted">
            {data.panels.actions.disclaimer.map((text: any) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </div>
      </Panel>

      <SourceFooter
        locale={locale}
        sources={data.sourceFooter.sources as any}
        methodHref={data.sourceFooter.methodHref as any}
        methodLabel={data.sourceFooter.methodLabel}
        limitations={data.sourceFooter.limitations}
      />
    </PageTemplate>
  );
}
