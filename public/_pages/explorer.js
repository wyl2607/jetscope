export function renderRealtimeCostMatrixSection({
  matrixTarget,
  getCurrentCostCompareRows,
  getBenchmarkPrice,
  t
}) {
  if (!matrixTarget) {
    return;
  }

  const routes = getCurrentCostCompareRows();
  const benchmarkPrice = getBenchmarkPrice();

  matrixTarget.innerHTML = routes
    .map((item) => {
      const competitive = item.stats.costMultiple <= 1;
      const nearParity = item.stats.costMultiple > 1 && item.stats.costMultiple <= 1.2;
      const rowClass = competitive
        ? 'at-parity'
        : nearParity
          ? 'near-parity'
          : 'not-competitive';

      const badge = competitive
        ? t('✓ 已竞争', '✓ Competitive')
        : nearParity
          ? t('~接近', '~ Near parity')
          : `+${((item.stats.costMultiple - 1) * 100).toFixed(0)}%`;

      const badgeClass = competitive ? 'good' : nearParity ? 'warn' : 'danger';

      return `
        <div class="realtime-cost-row ${rowClass}">
          <div>
            <div class="realtime-route-name">${item.route.name}</div>
            <div class="realtime-route-pathway">${item.route.pathway}</div>
          </div>
          <div class="realtime-cost-cell">
            <span class="realtime-cost-value">$${item.route.baseCostUsdPerLiter.toFixed(2)}</span>
            <span class="realtime-cost-label">${t('基础成本', 'Base cost')}</span>
          </div>
          <div class="realtime-cost-cell">
            <span class="realtime-cost-value">$${item.stats.effectiveCost.toFixed(2)}</span>
            <span class="realtime-cost-label">${t('有效成本', 'Effective cost')}</span>
          </div>
          <div class="realtime-cost-cell">
            <span class="realtime-cost-value">$${benchmarkPrice.toFixed(2)}</span>
            <span class="realtime-cost-label">${t('参考价格', 'Reference price')}</span>
          </div>
          <span class="realtime-competitive-badge ${badgeClass}">${badge}</span>
        </div>
      `;
    })
    .join('');
}

export function renderRealtimeExplorerSection({
  state,
  matrixTarget,
  getCurrentCostCompareRows,
  getBenchmarkPrice,
  t
}) {
  const crudeDisplay = document.querySelector('#crude-display');
  if (crudeDisplay) {
    crudeDisplay.textContent = state.crudeUsdPerBarrel.toFixed(0);
  }

  const carbonDisplay = document.querySelector('#carbon-display');
  if (carbonDisplay) {
    carbonDisplay.textContent = state.carbonPriceUsdPerTonne.toFixed(0);
  }

  const subsidyDisplay = document.querySelector('#subsidy-display');
  if (subsidyDisplay) {
    subsidyDisplay.textContent = state.subsidyUsdPerLiter.toFixed(2);
  }

  const crudeBand = document.querySelector('#crude-band');
  if (crudeBand) {
    crudeBand.textContent =
      state.crudeUsdPerBarrel < 60
        ? t('低位区间', 'Low band')
        : state.crudeUsdPerBarrel < 100
          ? t('中位区间', 'Mid band')
          : state.crudeUsdPerBarrel < 130
            ? t('高位区间', 'High band')
            : t('冲击区间', 'Shock band');
  }

  const carbonBand = document.querySelector('#carbon-band');
  if (carbonBand) {
    carbonBand.textContent =
      state.carbonPriceUsdPerTonne < 80
        ? t('低碳价', 'Low carbon')
        : state.carbonPriceUsdPerTonne < 140
          ? t('中碳价', 'Mid carbon')
          : state.carbonPriceUsdPerTonne < 220
            ? t('高碳价', 'High carbon')
            : t('极高碳价', 'Extreme carbon');
  }

  const subsidyBand = document.querySelector('#subsidy-band');
  if (subsidyBand) {
    subsidyBand.textContent =
      state.subsidyUsdPerLiter < 0.2
        ? t('弱支持', 'Light support')
        : state.subsidyUsdPerLiter < 0.6
          ? t('中性支持', 'Neutral support')
          : state.subsidyUsdPerLiter < 1.0
            ? t('强支持', 'Strong support')
            : t('激进支持', 'Aggressive support');
  }

  renderRealtimeCostMatrixSection({
    matrixTarget,
    getCurrentCostCompareRows,
    getBenchmarkPrice,
    t
  });
}

export function renderCurrentCostCompareSection({
  target,
  generatedAt,
  getCurrentCostCompareRows,
  pickCheapestRoute,
  summarizeSources,
  getRouteDisplayName,
  getRouteRangeLabel,
  formatCurrency,
  formatDateTime,
  formatNumber,
  t
}) {
  if (!target) {
    return;
  }

  const rows = getCurrentCostCompareRows();
  const cheapest = pickCheapestRoute();
  const sourceSummary = summarizeSources();
  const generatedAtLabel = generatedAt
    ? `${t('最新抓取', 'Last fetched')}: ${formatDateTime(generatedAt)}`
    : t('最新抓取时间未知', 'Last fetched time unknown');

  target.innerHTML = `
    <div class="cost-compare-header">
      <p class="subtle">${generatedAtLabel}</p>
      <p class="subtle">${t('实时的是 fossil / jet / carbon，SAF 路线成本为研究基线 + 本地覆盖。', 'Fossil / jet / carbon values are live or semi-live; SAF pathway costs remain research baselines with optional local overrides.')}</p>
      <p class="subtle">${t(`来源健康：${sourceSummary.healthy} healthy / ${sourceSummary.degraded} degraded / ${sourceSummary.reference} reference`, `Source health: ${sourceSummary.healthy} healthy / ${sourceSummary.degraded} degraded / ${sourceSummary.reference} reference`)}</p>
    </div>
    <div class="cost-compare-label-row" aria-hidden="true">
      <span>${t('原料 / 工艺路线', 'Feedstock / pathway')}</span>
      <span>${t('生产成本（$/L）', 'Production cost ($/L)')}</span>
      <span>${t('CO₂减排', 'CO₂ abatement')}</span>
      <span>${t('竞争力', 'Competitiveness')}</span>
    </div>
    <div class="cost-compare-list">
      ${rows
        .map((item) => {
          const routeRange = getRouteRangeLabel(item.route);
          const badgeClass = item.isBaseline
            ? 'neutral'
            : item.baseCostMultiple <= 2
              ? 'good'
              : item.baseCostMultiple <= 4
                ? 'warn'
                : 'danger';

          return renderCostRow({
            variant: item.isBaseline ? 'baseline' : 'pathway',
            isSpotlight: Boolean(cheapest && item.route.id === cheapest.route.id),
            name: getRouteDisplayName(item.route),
            pathway: item.route.pathway,
            routeId: item.route.id,
            routeColor: item.route.color,
            barWidthPct: item.barWidthPct,
            priceLabel: `${formatCurrency(item.route.baseCostUsdPerLiter, 2)}/L`,
            rangeLabel:
              routeRange ||
              (item.isBaseline
                ? t('Jet-A / Kerosene 基准', 'Jet-A / Kerosene benchmark')
                : t('研究基线', 'Research baseline')),
            impactValue: item.isBaseline ? '—' : `-${formatNumber(item.route.co2SavingsKgPerLiter, 1)} kg/L`,
            impactLabel: t('CO₂减排', 'CO₂ abatement'),
            badgeClass,
            competitivenessLabel: item.competitivenessLabel
          });
        })
        .join('')}
    </div>
  `;
}

export function renderBreakevenCalculatorSection({
  formulaTarget,
  metricsTarget,
  summary,
  jetRoute,
  cheapest,
  state,
  getRouteDisplayName,
  formatCurrency,
  formatCostMultiple,
  formatNumber,
  t
}) {
  if (formulaTarget) {
    formulaTarget.innerHTML = `
      <strong class="formula-title">${t('盈亏平衡计算器', 'Break-even calculator')}</strong>
      <div class="formula-line">P<sub>${t('SAF有效', 'effective SAF')}</sub> = P<sub>${t('SAF基础', 'base SAF')}</sub> − Carbon×ΔCO₂ − Subsidy</div>
      <div class="formula-line">P<sub>jet(proxy)</sub> = ${formatNumber(state.jetProxySlope, 4)} × crude + ${formatNumber(state.jetProxyIntercept, 2)}</div>
      <div class="formula-line">${t('当前比较基准', 'Current benchmark')}: ${summary.benchmarkLabel} · ${formatCurrency(summary.benchmarkPrice, 3)}/L</div>
    `;
  }

  if (!metricsTarget || !cheapest || !jetRoute) {
    return;
  }

  const priceGap = cheapest.stats.effectiveCost - summary.benchmarkPrice;
  const direction = priceGap <= 0 ? '↓' : '↑';
  const routeDelta =
    priceGap <= 0
      ? `${getRouteDisplayName(cheapest.route)} ${t('已具备竞争力', 'is now competitive')}`
      : `${getRouteDisplayName(cheapest.route)} ${t('较传统仍高', 'is still above conventional fuel by')} ${formatCurrency(priceGap, 2)}/L`;

  const cards = [
    {
      label: t('当前传统燃料价格', 'Current conventional fuel price'),
      value: `${formatCurrency(summary.benchmarkPrice, 2)}`,
      detail: `${summary.benchmarkLabel} · ${t('原油', 'crude')} ${formatCurrency(state.crudeUsdPerBarrel, 0)}${t('/桶', '/bbl')}`
    },
    {
      label: t('最便宜 SAF 有效价格', 'Cheapest effective SAF price'),
      value: `${formatCurrency(cheapest.stats.effectiveCost, 2)} ${direction}`,
      detail: `${getRouteDisplayName(cheapest.route)}`
    },
    {
      label: t('整体价差', 'Overall cost gap'),
      value: formatCostMultiple(cheapest.stats.costMultiple),
      detail: routeDelta
    }
  ];

  metricsTarget.innerHTML = cards.map((card) => renderMetricCard(card)).join('');
}

export function renderBreakevenRouteListSection({
  target,
  pageType,
  getBreakevenListRows,
  getRouteDisplayName,
  formatBreakEvenCrude,
  formatCostMultiple,
  formatCurrency,
  t
}) {
  if (!target) {
    return;
  }

  const rows = getBreakevenListRows();
  const scopedRows = pageType === 'home' ? rows.slice(0, 3) : rows;
  const bestRouteId = scopedRows[0]?.route.id;

  target.innerHTML = `
    <section class="breakeven-route-block">
      <div class="route-list-head">
        <h3>${t(
          pageType === 'home' ? '最接近盈亏平衡的 Top 路线' : '各原料路线盈亏平衡油价（不含补贴/碳价时的临界点）',
          pageType === 'home'
            ? 'Top pathways closest to parity'
            : 'Break-even oil price by pathway (raw threshold without subsidy/carbon support)'
        )}</h3>
        <p>${t(
          pageType === 'home'
            ? '首页只展示最关键路线；完整列表请到 Explorer / Routes。'
            : '同一套 proxy 公式下，同时展示无政策与含政策的切换门槛。',
          pageType === 'home'
            ? 'Home shows only key pathways. Use Explorer/Routes for the full list.'
            : 'Shows pathway switch thresholds with and without policy support under the same proxy formula.'
        )}</p>
      </div>
      <ul class="breakeven-route-rows">
        ${scopedRows
          .map(
            ({ route, withoutPolicy, withPolicy }) =>
              renderBreakevenRow({
                isSpotlight: route.id === bestRouteId,
                name: getRouteDisplayName(route),
                detail: route.pathway,
                valueGroups: [
                  {
                    value: `${t('无政策', 'No policy')}: ${formatBreakEvenCrude(withoutPolicy.breakEvenCrude)}`,
                    hint: t('原始研究基线', 'Raw research baseline')
                  },
                  {
                    value: `${t('含政策', 'With policy')}: ${formatBreakEvenCrude(withPolicy.breakEvenCrude)}`,
                    hint: t('当前补贴 + 碳价', 'Current subsidy + carbon')
                  }
                ]
              })
          )
          .join('')}
      </ul>
    </section>
    <section class="breakeven-route-block">
      <div class="route-list-head">
        <h3>${t('在当前参数下，各路线是否具备竞争力？', 'Are the pathways competitive under the current inputs?')}</h3>
        <p>${t('这里使用含碳价、补贴和当前 benchmark 的有效成本口径。', 'This section uses policy-adjusted effective cost against the active benchmark.')}</p>
      </div>
      <ul class="breakeven-route-rows">
        ${scopedRows
          .map(({ route, withPolicy }) => {
            const statusClass =
              withPolicy.delta <= 0 ? 'good' : withPolicy.delta <= 0.25 ? 'warn' : 'danger';
            const deltaLabel = `${withPolicy.delta >= 0 ? '+' : ''}${formatCurrency(withPolicy.delta, 2)}`;
            return renderBreakevenRow({
              isSpotlight: route.id === bestRouteId,
              name: getRouteDisplayName(route),
              detail: `${t('有效成本', 'Effective cost')} ${formatCurrency(withPolicy.effectiveCost, 2)}/L（${t('较传统', 'vs conventional')} ${deltaLabel}）`,
              valueGroups: [
                {
                  value: formatCostMultiple(withPolicy.costMultiple),
                  hint: t('相对传统燃料倍数', 'Multiple versus conventional fuel')
                }
              ],
              status: {
                tone: statusClass === 'good' ? 'ok' : statusClass === 'warn' ? 'neutral' : 'error',
                label: withPolicy.competitiveness
              }
            });
          })
          .join('')}
      </ul>
    </section>
  `;
}

export function renderLegacyMetricGridSection({
  target,
  state,
  pickCheapestRoute,
  computeJetProxy,
  getLiveJetSpot,
  getBenchmarkPrice,
  getCrudeSourceLabel,
  getCarbonSourceLabel,
  getBenchmarkLabel,
  getRouteDisplayName,
  formatCurrency,
  formatNumber,
  t
}) {
  if (!target) {
    return;
  }

  const cheapest = pickCheapestRoute();
  const jetProxy = computeJetProxy();
  const liveJetSpot = getLiveJetSpot();
  const benchmarkPrice = getBenchmarkPrice();
  const cheapestPremium = cheapest.stats.effectiveCost / benchmarkPrice;
  const routeDelta = cheapest.stats.effectiveCost - benchmarkPrice;
  const switchVerdict =
    routeDelta <= 0
      ? `${t('可开始切换', 'Ready to switch')}: ${getRouteDisplayName(cheapest.route)}`
      : `${t('暂不切换，仍贵', 'Do not switch yet; still higher by')} ${formatCurrency(routeDelta, 3)}/L`;

  const cards = [
    {
      label: t('当前国际油价', 'Current crude oil price'),
      value: `${formatCurrency(state.crudeUsdPerBarrel, 2)} /bbl`,
      detail: `${t('来源', 'Source')} ${getCrudeSourceLabel()}`
    },
    {
      label: t('当前比较基准', 'Current benchmark'),
      value: `${formatCurrency(benchmarkPrice, 3)} /L`,
      detail:
        state.benchmarkMode === 'live-jet-spot' && liveJetSpot == null
          ? t('live jet spot 不可用，已回退到 crude proxy', 'Live jet spot unavailable; fell back to crude proxy')
          : `${getBenchmarkLabel()} · proxy ${formatCurrency(jetProxy, 3)}`
    },
    {
      label: t('当前碳价', 'Current carbon price'),
      value: `${formatCurrency(state.carbonPriceUsdPerTonne, 2)} /tCO₂`,
      detail: `${t('来源', 'Source')} ${getCarbonSourceLabel()}`
    },
    {
      label: t('最便宜 SAF 有效成本', 'Cheapest effective SAF cost'),
      value: `${formatCurrency(cheapest.stats.effectiveCost, 3)} /L`,
      detail: `${getRouteDisplayName(cheapest.route)}`
    },
    {
      label: t('开始使用判断', 'Use-now decision'),
      value: switchVerdict,
      detail: `${t('当前溢价', 'Current premium')} ${formatNumber(cheapestPremium, 2)}×`
    }
  ];

  target.innerHTML = cards
    .map(
      (card) => `
        <article class="metric-card">
          <p>${card.label}</p>
          <strong>${card.value}</strong>
          <span>${card.detail}</span>
        </article>
      `
    )
    .join('');
}

export function renderLegacyBreakEvenChartSection({
  chartTarget,
  summaryTarget,
  state,
  getSafRouteSnapshots,
  getRouteDisplayName,
  formatCurrency,
  formatBreakEvenCrude,
  t
}) {
  if (!chartTarget || !summaryTarget) {
    return;
  }

  const snapshots = getSafRouteSnapshots();
  if (snapshots.length === 0) {
    chartTarget.innerHTML = `<p class="subtle">${t('暂无可绘制的 SAF 路线。', 'No SAF pathways available for chart rendering.')}</p>`;
    summaryTarget.innerHTML = '';
    return;
  }

  const currentCrude = state.crudeUsdPerBarrel;
  const finiteBreakEvens = snapshots
    .map((item) => item.stats.breakEvenCrude)
    .filter((value) => Number.isFinite(value));
  const maxValue = Math.max(currentCrude, ...finiteBreakEvens, 80);
  const domainMax = Math.ceil(maxValue / 10) * 10;
  const width = 720;
  const rowHeight = 42;
  const chartHeight = snapshots.length * rowHeight + 64;
  const labelWidth = 152;
  const chartWidth = width - labelWidth - 34;
  const scaleX = (value) => labelWidth + (Math.min(value, domainMax) / domainMax) * chartWidth;
  const currentX = scaleX(currentCrude);
  const ticks = [0, domainMax * 0.25, domainMax * 0.5, domainMax * 0.75, domainMax];

  chartTarget.innerHTML = `
    <svg viewBox="0 0 ${width} ${chartHeight}" class="break-even-svg" role="img" aria-label="${t('各 SAF 路线达到盈亏平衡所需的 Brent 油价', 'Brent oil price required for each SAF pathway to reach break-even')}">
      ${ticks
        .map((tick) => {
          const x = scaleX(tick);
          return `
            <line x1="${x}" y1="18" x2="${x}" y2="${chartHeight - 28}" class="chart-grid-line" />
            <text x="${x}" y="${chartHeight - 8}" text-anchor="middle" class="chart-tick">${Math.round(tick)}</text>
          `;
        })
        .join('')}
      <line x1="${currentX}" y1="18" x2="${currentX}" y2="${chartHeight - 28}" class="chart-current-line" />
      <text x="${Math.min(currentX + 6, width - 8)}" y="16" class="chart-current-label">${t('当前', 'Current')} ${Math.round(currentCrude)} $/bbl</text>
      ${snapshots
        .map((item, index) => {
          const y = 38 + index * rowHeight;
          const x = scaleX(item.stats.breakEvenCrude);
          const isCompetitive = Number.isFinite(item.stats.breakEvenCrude) && item.stats.breakEvenCrude <= currentCrude;
          const barClass = isCompetitive ? 'chart-bar good' : 'chart-bar';
          const markerClass = isCompetitive ? 'chart-marker good' : 'chart-marker';
          const valueLabel = Number.isFinite(item.stats.breakEvenCrude)
            ? `${Math.round(item.stats.breakEvenCrude)}`
            : '∞';

          return `
            <text x="0" y="${y + 6}" class="chart-label">${getRouteDisplayName(item.route)}</text>
            <line x1="${labelWidth}" y1="${y}" x2="${labelWidth + chartWidth}" y2="${y}" class="chart-row-line" />
            <line x1="${labelWidth}" y1="${y}" x2="${x}" y2="${y}" class="${barClass}" />
            <circle cx="${x}" cy="${y}" r="6" class="${markerClass}" />
            <text x="${Math.min(x + 12, width - 16)}" y="${y + 6}" class="chart-value">${valueLabel}</text>
          `;
        })
        .join('')}
    </svg>
  `;

  const nearest = snapshots[0];
  const nextGap = nearest.stats.breakEvenCrude - currentCrude;
  const competitiveCount = snapshots.filter(
    (item) => Number.isFinite(item.stats.breakEvenCrude) && item.stats.breakEvenCrude <= currentCrude
  ).length;

  summaryTarget.innerHTML = `
    <article class="source-summary-card">
      <strong>${competitiveCount}/${snapshots.length}</strong>
      <span>${t('路线已低于当前 Brent 对应的 proxy break-even', 'Pathways already below the current Brent-implied proxy break-even')}</span>
    </article>
    <article class="source-summary-card ${nextGap <= 0 ? '' : 'warning'}">
      <strong>${getRouteDisplayName(nearest.route)}</strong>
      <span>${nextGap <= 0 ? t('已在当前油价下达到 proxy parity', 'Already at proxy parity under the current oil price') : `${t('距离 parity 仍需', 'Still needs')} ${formatCurrency(nextGap, 0)}/bbl ${t('to reach parity', 'to reach parity')}`}</span>
    </article>
    <article class="source-summary-card muted">
      <strong>${formatBreakEvenCrude(nearest.stats.breakEvenCrude)}</strong>
      <span>${t('最接近当前油价的 break-even 点', 'Closest break-even point to the current oil price')}</span>
    </article>
  `;
}

function renderCostRow(vm) {
  return `
    <article class="cost-row" data-variant="${vm.variant}" data-spotlight="${vm.isSpotlight ? 'true' : 'false'}">
      <div class="route-meta">
        <strong>${vm.name}</strong>
        <span>${vm.pathway}</span>
      </div>
      <div class="bar-group">
        <div class="bar-track">
          <div class="bar-fill route-${vm.routeId}" style="width:${vm.barWidthPct}%; --bar-color:${vm.routeColor};"></div>
        </div>
        <div class="bar-meta">
          <strong class="price-figure">${vm.priceLabel}</strong>
          <span class="range-copy">${vm.rangeLabel}</span>
        </div>
      </div>
      <div class="impact-cell">
        <strong>${vm.impactValue}</strong>
        <span class="impact-label">${vm.impactLabel}</span>
      </div>
      <div class="multiple-badge-wrap">
        <span class="multiple-badge ${vm.badgeClass}">${vm.competitivenessLabel}</span>
      </div>
    </article>
  `;
}

function renderBreakevenRow(vm) {
  const valueGroups = (vm.valueGroups ?? [])
    .map(
      (group) => `
        <div class="route-list-value-group">
          <span class="route-list-value">${group.value}</span>
          <span class="route-list-value-hint">${group.hint}</span>
        </div>
      `
    )
    .join('');
  const statusMarkup = vm.status
    ? `
        <div class="route-status ${vm.status.tone}">
          ${vm.status.label}
        </div>
      `
    : '';

  return `
    <li class="breakeven-row" data-spotlight="${vm.isSpotlight ? 'true' : 'false'}">
      <div class="route-list-primary">
        <strong>${vm.name}</strong>
        <span>${vm.detail}</span>
      </div>
      ${valueGroups}
      ${statusMarkup}
    </li>
  `;
}

function renderMetricCard(vm) {
  return `
    <article class="breakeven-metric-card">
      <span>${vm.label}</span>
      <strong>${vm.value}</strong>
      <small>${vm.detail}</small>
    </article>
  `;
}
