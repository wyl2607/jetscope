import { Panel } from '@/components/panel';
import { messagesFor, type Locale } from '@/lib/i18n';
import type { ElectricityPrice, FuelPumpPrice, RoadFuelsGermany } from '@/lib/road-fuels-read-model';

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
  const costs = data?.cost_per_100km ?? null;
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
        {costs ? <CostPer100km locale={locale} costs={costs} /> : null}
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

type Costs = RoadFuelsGermany['cost_per_100km'];

function sourceLine(template: string, price: ElectricityPrice, locale: Locale): string {
  // Keep the published precision (BDEW 37,0 vs Destatis 40,55 ct/kWh).
  const cents = Math.round(price.eur_per_kwh * 10000) / 100;
  return template
    .replace('{price}', num(cents, locale, Number.isInteger(cents * 10) ? 1 : 2))
    .replace('{period}', price.period)
    .replace('{published}', price.published_at);
}

function CostPer100km({ locale, costs }: { locale: Locale; costs: Costs }) {
  const copy = messagesFor(locale).road_fuels;
  const { assumptions, electricity, electricity_reference: reference } = costs;
  const rows: [string, number, string, number | null][] = [
    [copy.diesel, assumptions.diesel_l_per_100km, 'L', costs.diesel_eur],
    [copy.euro95, assumptions.petrol_l_per_100km, 'L', costs.petrol_eur],
    [copy.ev_home, assumptions.ev_kwh_per_100km, 'kWh', costs.ev_home_eur]
  ];
  const fields: [string, string, number, number][] = [
    ['diesel_l', copy.input_diesel, assumptions.diesel_l_per_100km, 30],
    ['petrol_l', copy.input_petrol, assumptions.petrol_l_per_100km, 30],
    ['ev_kwh', copy.input_ev, assumptions.ev_kwh_per_100km, 60]
  ];

  return (
    <div className="space-y-3 border-t border-line pt-4">
      <h3 className="font-semibold text-ink">{copy.cost_title}</h3>
      <table className="w-full text-left tabular-nums">
        <thead>
          <tr className="text-ink">
            <th className="py-2 pr-4">{copy.col_vehicle}</th>
            <th className="py-2 pr-4">{copy.col_consumption}</th>
            <th className="py-2 pr-4">{copy.col_cost_100km}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, amount, unit, cost]) => (
            <tr key={label}>
              <td className="py-2 pr-4 text-ink">{label}</td>
              <td className="py-2 pr-4">
                {num(amount, locale, 1)} {unit}
              </td>
              <td className="py-2 pr-4 text-ink">{cost == null ? '—' : `€${num(cost, locale, 2)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>{copy.cost_assumption_note}</p>
      {electricity ? (
        <p>
          {sourceLine(copy.electricity_source, electricity, locale)}{' '}
          <a className="underline" href={electricity.source_url}>
            {electricity.source_name}
          </a>
        </p>
      ) : (
        <p>{copy.electricity_missing}</p>
      )}
      {reference && costs.ev_home_reference_eur != null ? (
        <p>
          {sourceLine(copy.electricity_reference, reference, locale).replace(
            '{cost}',
            num(costs.ev_home_reference_eur, locale, 2)
          )}{' '}
          <a className="underline" href={reference.source_url}>
            {reference.source_name}
          </a>
        </p>
      ) : null}
      <form method="get" className="grid gap-3 sm:grid-cols-4 sm:items-end">
        {fields.map(([name, label, value, max]) => (
          <label key={name} className="text-sm text-muted">
            {label}
            <input
              className="mt-1 w-full border border-line bg-surface px-3 py-2 text-ink hover:border-line-strong"
              type="number"
              name={name}
              min={0.1}
              max={max}
              step={0.1}
              defaultValue={value}
            />
          </label>
        ))}
        <button type="submit" className="border border-line-strong bg-surface px-3 py-2 text-ink hover:border-ink">
          {copy.recalculate}
        </button>
      </form>
    </div>
  );
}
