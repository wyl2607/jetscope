import { renderRouteRow } from '/_components/route-row.js';
import { renderSignalCard } from '/_components/signal-card.js';

export function renderHomeSnapshotSection({
  locale,
  heroTarget,
  signalGridTarget,
  topRoutesTarget,
  summary,
  transitionSignal,
  getRouteDisplayName,
  formatBreakEvenCrude,
  formatCurrency,
  t
}) {
  if (!heroTarget && !signalGridTarget && !topRoutesTarget) {
    return;
  }

  const cheapest = summary.cheapest;
  const benchmarkPrice = summary.benchmarkPrice;
  const gap = cheapest ? cheapest.stats.effectiveCost - benchmarkPrice : Number.NaN;
  const gapCopy = !Number.isFinite(gap)
    ? t('等待市场数据', 'Waiting for market data')
    : gap <= 0
      ? t(
          `当前已低于传统航油 ${formatCurrency(Math.abs(gap), 2)}/L`,
          `Currently below jet fuel by ${formatCurrency(Math.abs(gap), 2)}/L`
        )
      : t(
          `当前仍高于传统航油 ${formatCurrency(gap, 2)}/L`,
          `Currently above jet fuel by ${formatCurrency(gap, 2)}/L`
        );

  if (heroTarget) {
    heroTarget.innerHTML = `
      <strong>${Number.isFinite(gap) ? formatCurrency(Math.abs(gap), 2) : '—'}</strong>
      <span>${gapCopy}</span>
    `;
  }

  if (signalGridTarget) {
    const cards = [
      {
        title: t('传统燃料基准', 'Conventional benchmark'),
        value: `${formatCurrency(benchmarkPrice, 2)}/L`,
        detail: summary.benchmarkLabel || t('当前比较基准', 'Current benchmark'),
        tone: 'neutral'
      },
      {
        title: t('最低 SAF 有效价', 'Best effective SAF'),
        value: cheapest ? `${formatCurrency(cheapest.stats.effectiveCost, 2)}/L` : '—',
        detail: cheapest ? getRouteDisplayName(cheapest.route) : t('暂无数据', 'No data yet'),
        tone: Number.isFinite(gap) && gap <= 0 ? 'success' : 'warning'
      },
      {
        title: t('全球 SAF 占比', 'Global SAF share'),
        value: '0.6%',
        detail: t('2030 目标至少 2%', '2030 target at least 2%'),
        tone: 'accent'
      },
      {
        title: t('转型综合信号', 'Transition signal'),
        value: transitionSignal ? (locale === 'en' ? transitionSignal.labelEn : transitionSignal.labelZh) : '—',
        detail: transitionSignal
          ? `${transitionSignal.gapUsdPerLiter >= 0 ? '+' : ''}${formatCurrency(transitionSignal.gapUsdPerLiter, 2)}/L`
          : t('等待行业面板计算', 'Waiting for dashboard signal'),
        tone:
          transitionSignal?.status === 'viable'
            ? 'success'
            : transitionSignal?.status === 'threshold'
              ? 'warning'
              : transitionSignal?.status === 'watching'
                ? 'accent'
                : 'danger'
      }
    ];

    signalGridTarget.innerHTML = cards.map((card) => renderSignalCard(card)).join('');
  }

  if (topRoutesTarget) {
    const rows = summary.topRoutes ?? [];
    topRoutesTarget.innerHTML = rows
      .map(({ route, withPolicy }) =>
        renderRouteRow({
          name: getRouteDisplayName(route),
          detail: `${t('有效成本', 'Effective cost')} ${formatCurrency(withPolicy.effectiveCost, 2)}/L · ${t('盈亏平衡油价', 'Break-even crude')} ${formatBreakEvenCrude(withPolicy.breakEvenCrude)}`,
          value: `${withPolicy.delta >= 0 ? '+' : ''}${formatCurrency(withPolicy.delta, 2)}/L`,
          href: `${locale === 'en' ? '/en' : ''}/routes/${route.id}`,
          status: withPolicy.competitiveness
        })
      )
      .join('');
  }
}
