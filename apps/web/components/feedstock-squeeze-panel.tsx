import { Panel } from '@/components/panel';
import type { FeedstockSqueeze } from '@/lib/feedstock-read-model';
import { messagesFor, type Locale } from '@/lib/i18n';

function tag(locale: Locale): string {
  return locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-GB';
}

function num(value: number, locale: Locale, digits: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  return value.toLocaleString(tag(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function signed(value: number, locale: Locale): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  return `${value > 0 ? '+' : ''}${num(value, locale, 1)}%`;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

export function FeedstockSqueezePanel({ locale, data }: { locale: Locale; data: FeedstockSqueeze | null }) {
  const copy = messagesFor(locale).tipping_point_report;
  if (!data) {
    return (
      <Panel locale={locale} title={copy.feedstock_title} why={copy.feedstock_why}>
        <p className="text-sm leading-7 text-muted">{copy.feedstock_missing}</p>
      </Panel>
    );
  }
  const { uco, uco_vs_gasoil: ratio, structure } = data;
  const prior = uco.prior_year;

  return (
    <Panel locale={locale} title={copy.feedstock_title} why={copy.feedstock_why}>
      <div className="space-y-4 text-sm leading-7 text-muted">
        {uco.stale ? (
          <p className="rounded-xl border border-warning bg-warning-soft px-3 py-2 text-warning">
            {fill(copy.feedstock_stale, { week: uco.week_ending, days: String(uco.age_days) })}
          </p>
        ) : null}
        <p>
          {fill(copy.feedstock_uco, {
            week: uco.week_ending,
            low: num(uco.ddp_nwe_low_eur_per_t, locale, 0),
            high: num(uco.ddp_nwe_high_eur_per_t, locale, 0)
          })}
          {prior
            ? ` ${fill(copy.feedstock_prior_year, {
                year: String(prior.year),
                prior_low: num(prior.low_eur_per_t, locale, 0),
                prior_high: num(prior.high_eur_per_t, locale, prior.high_eur_per_t % 1 ? 2 : 0),
                vs_high: signed(prior.vs_high_pct, locale),
                vs_low: signed(prior.vs_low_pct, locale)
              })}`
            : ''}{' '}
          <a className="underline" href={uco.source_url}>
            {uco.source_name}
          </a>
          {prior ? (
            <>
              {' · '}
              <a className="underline" href={prior.source_url}>
                {prior.source_name}
              </a>
            </>
          ) : null}
        </p>
        <p>
          {fill(copy.feedstock_ratio, {
            uco: num(ratio.uco_cif_ara_bulk_usd_per_t, locale, 0),
            gasoil: num(ratio.ice_gasoil_usd_per_t, locale, 0),
            ratio: num(ratio.ratio, locale, 2)
          })}
        </p>
        <p>
          {fill(copy.feedstock_structure, {
            period: structure.period,
            biofuel: num(structure.aviation_biofuel_share_of_saf_pct, locale, 0),
            imported: num(structure.feedstock_imported_pct, locale, 0),
            china: num(structure.china_share_of_imports_pct, locale, 0)
          })}{' '}
          <a className="underline" href={structure.source_url}>
            {structure.source_name}
          </a>
        </p>
        <p>{copy.feedstock_method}</p>
      </div>
    </Panel>
  );
}
