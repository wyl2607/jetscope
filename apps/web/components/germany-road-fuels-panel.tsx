import { Panel } from '@/components/panel';
import { messagesFor, type Locale } from '@/lib/i18n';
import type { FuelPumpPrice, RoadFuelsGermany } from '@/lib/road-fuels-read-model';

function tag(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-GB';
}

function num(value: number | null, locale: Locale, digits: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(tag(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number | null, locale: Locale): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${num(value, locale, 1)}%`;
}

export function GermanyRoadFuelsPanel({ locale, data }: { locale: Locale; data: RoadFuelsGermany | null }) {
  const copy = messagesFor(locale).road_fuels;
  const pump = data?.pump ?? null;
  const inflation = data?.inflation ?? null;
  const rows: [string, FuelPumpPrice][] = pump
    ? [
        [copy.euro95, pump.euro95],
        [copy.diesel, pump.diesel]
      ]
    : [];

  return (
    <Panel locale={locale} title={copy.title} why={copy.why}>
      <div className="space-y-4 text-sm leading-7 text-muted">
        {pump ? (
          <>
            <table className="w-full text-left tabular-nums">
              <thead>
                <tr className="text-ink">
                  <th className="py-2 pr-4">{copy.col_fuel}</th>
                  <th className="py-2 pr-4">{copy.col_pump}</th>
                  <th className="py-2 pr-4">{copy.col_ex_tax}</th>
                  <th className="py-2 pr-4">{copy.col_tax_share}</th>
                  <th className="py-2 pr-4">{copy.col_4w}</th>
                  <th className="py-2 pr-4">{copy.col_52w}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fuel]) => (
                  <tr key={label}>
                    <td className="py-2 pr-4 text-ink">{label}</td>
                    <td className="py-2 pr-4">€{num(fuel.with_tax_eur_per_l, locale, 3)}/L</td>
                    <td className="py-2 pr-4">€{num(fuel.ex_tax_eur_per_l, locale, 3)}/L</td>
                    <td className="py-2 pr-4">{num(fuel.tax_share_pct, locale, 1)}%</td>
                    <td className="py-2 pr-4">{signed(fuel.change_4w_pct, locale)}</td>
                    <td className="py-2 pr-4">{signed(fuel.change_52w_pct, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              {copy.pump_source.replace('{week}', pump.week)}{' '}
              <a className="underline" href={pump.source_url}>
                {pump.source_name}
              </a>
            </p>
          </>
        ) : (
          <p>{copy.pump_missing}</p>
        )}
        {inflation ? (
          <p>
            {copy.inflation_body
              .replace('{period}', inflation.period)
              .replace('{cpi}', num(inflation.cpi_yoy_pct, locale, 1))
              .replace('{fuels}', num(inflation.motor_fuels_yoy_pct, locale, 1))
              .replace('{weight}', num(inflation.motor_fuels_weight_per_mille, locale, 2))
              .replace('{contribution}', num(inflation.motor_fuels_contribution_pp, locale, 2))
              .replace('{ex}', num(inflation.cpi_ex_heating_oil_and_motor_fuels_yoy_pct, locale, 1))}{' '}
            <a className="underline" href={inflation.source_url}>
              {inflation.source_name}
            </a>
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
