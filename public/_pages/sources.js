export function renderSourcesPage({
  locale,
  state,
  targets,
  computeJetProxy,
  formatCurrency,
  formatDateTime,
  formatNumber,
  getCarbonSourceLabel,
  getCrudeSourceLabel,
  getFreshness,
  getLocalizedSourceLabel,
  getLocalizedSourceNote,
  getStatusMeta,
  isSourceLocked,
  summarizeSources,
  t
}) {
  const sourcesMap = state.marketData?.sources ?? {};
  const sources = Object.values(sourcesMap);
  const summary = summarizeSources();
  const generatedAt = state.marketData?.generatedAt
    ? `${t('最近抓取', 'Last fetch')} ${formatDateTime(state.marketData.generatedAt)}`
    : t('尚未抓取', 'Not fetched yet');
  const parserVersion = state.marketData?.meta?.parserVersion ?? 'unknown';
  const degradedLabels = (state.marketData?.sourceStatus?.failedSources ?? [])
    .map((item) => item.label)
    .slice(0, 2)
    .join(locale === 'en' ? ', ' : '、');

  if (targets.sourceSummary) {
    targets.sourceSummary.innerHTML = `
      <div class="source-summary-card">
        <strong>${summary.healthy}</strong>
        <span>${t('健康来源', 'Healthy sources')}</span>
      </div>
      <div class="source-summary-card warning">
        <strong>${summary.degraded}</strong>
        <span>${t('降级 / 延迟', 'Degraded / stale')}</span>
      </div>
      <div class="source-summary-card muted">
        <strong>${summary.reference}</strong>
        <span>${t('参考基线', 'Reference baselines')}</span>
      </div>
      <div class="source-summary-card wide muted">
        <strong>${generatedAt}</strong>
        <span>${degradedLabels ? `${t('当前异常源', 'Current failing sources')}: ${degradedLabels}` : t('降级状态会明确显示在卡片与顶部状态区。', 'Degraded states are explicitly surfaced in the cards and top status panel.')}</span>
        <small>${t('Parser 版本', 'Parser version')}: ${parserVersion}</small>
      </div>
    `;
  }

  if (targets.sourceComparison) {
    const brentEia = sourcesMap.brentEia;
    const brentFred = sourcesMap.brentFred;
    const liveJet = sourcesMap.jetFred?.status === 'ok' ? sourcesMap.jetFred.value : null;
    const proxyJet = computeJetProxy();
    const cards = [];

    if (brentEia?.status === 'ok' && brentFred?.status === 'ok') {
      const spread = Math.abs(brentEia.value - brentFred.value);
      cards.push({
        title: t('Brent 交叉校验', 'Brent cross-check'),
        value: `${formatCurrency(spread, 2)}/bbl`,
        detail: `EIA ${formatCurrency(brentEia.value, 2)} vs FRED ${formatCurrency(brentFred.value, 2)}`
      });
    } else {
      const availableCrudeSource = brentEia?.status === 'ok' ? brentEia : brentFred?.status === 'ok' ? brentFred : null;
      cards.push({
        title: t('Brent 交叉校验', 'Brent cross-check'),
        value: availableCrudeSource ? availableCrudeSource.label : t('无可用双源', 'No dual-source check available'),
        detail: availableCrudeSource
          ? t('当前只有单一公开油价源可用。', 'Only one public crude source is available right now.')
          : t('请使用 manual 场景或等待公开源恢复。', 'Use a manual scenario or wait for public sources to recover.')
      });
    }

    if (liveJet != null) {
      const gap = liveJet - proxyJet;
      cards.push({
        title: t('Jet 实盘 vs proxy', 'Jet spot vs proxy'),
        value: `${gap >= 0 ? '+' : ''}${formatCurrency(gap, 3)}/L`,
        detail:
          locale === 'en'
            ? `Live jet ${formatCurrency(liveJet, 3)}, proxy ${formatCurrency(proxyJet, 3)}`
            : `live jet ${formatCurrency(liveJet, 3)}，proxy ${formatCurrency(proxyJet, 3)}`
      });
    } else {
      cards.push({
        title: t('Jet 实盘 vs proxy', 'Jet spot vs proxy'),
        value: t('live jet 不可用', 'Live jet unavailable'),
        detail: `${t('当前仅能依赖 proxy', 'Currently relying on proxy only')} ${formatCurrency(proxyJet, 3)}/L`
      });
    }

    cards.push({
      title: t('来源锁定', 'Source lock'),
      value: `${isSourceLocked(state.crudeSource) ? t('原油已锁定', 'Crude locked') : t('原油 manual', 'Crude manual')} / ${isSourceLocked(state.carbonSource) ? t('碳价已锁定', 'Carbon locked') : t('碳价 manual', 'Carbon manual')}`,
      detail: `${t('原油', 'Crude')} ${getCrudeSourceLabel()} · ${t('碳价', 'Carbon')} ${getCarbonSourceLabel()}`
    });

    targets.sourceComparison.innerHTML = cards
      .map(
        (card) => `
          <article class="comparison-card">
            <span>${card.title}</span>
            <strong>${card.value}</strong>
            <p>${card.detail}</p>
          </article>
        `
      )
      .join('');
  }

  if (targets.sourceGrid) {
    targets.sourceGrid.innerHTML = sources
      .map((source) => {
        const statusMeta = getStatusMeta(source);
        const freshness = getFreshness(source);
        const digits = source.unit === 'USD/L' ? 3 : source.unit === 'USD/EUR' ? 4 : 2;
        const value =
          source.status === 'ok'
            ? `${formatNumber(source.value, digits)} ${source.unit}`
            : getLocalizedSourceNote(source);
        const timingLine = source.asOf
          ? `as of ${source.asOf}`
          : source.publishedAt
            ? `published ${source.publishedAt}`
            : source.cadence ?? t('更新时间未知', 'Update time unknown');

        return `
          <article class="source-card ${statusMeta.badgeClass}">
            <div class="source-head">
              <strong>${getLocalizedSourceLabel(source)}</strong>
              <span class="badge ${statusMeta.badgeClass}">${statusMeta.badgeLabel}</span>
            </div>
            <p>${value}</p>
            <div class="source-detail-list">
              <small><span class="freshness ${freshness.tone}">${freshness.label}</span></small>
              <small>${timingLine}</small>
              <small>${source.cadence ?? 'cadence unknown'}</small>
              <small>${t('Parser', 'Parser')}: ${parserVersion}</small>
            </div>
            <a href="${source.url}" target="_blank" rel="noreferrer">${t('打开来源 ↗', 'Open source ↗')}</a>
          </article>
        `;
      })
      .join('');
  }
}

export function renderTimelineSection({ target, targets }) {
  if (!target) {
    return;
  }

  target.innerHTML = targets
    .map(
      (item) => `
        <div class="timeline-item">
          <strong>${item.year}</strong>
          <span>SAF ${item.safSharePct}% · synthetic ${item.syntheticSharePct}%</span>
          <small>${item.label}</small>
        </div>
      `
    )
    .join('');
}
