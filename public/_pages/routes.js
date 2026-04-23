function getBaseCostBarData(route, { routes, getRouteRangeLabel, toFiniteNumber }) {
  const maxBaseCost = Math.max(
    ...routes.map((item) => toFiniteNumber(item.baseCostUsdPerLiter, 0)),
    1
  );

  return {
    widthPct: Math.max(
      8,
      Math.min(100, (toFiniteNumber(route.baseCostUsdPerLiter, 0) / maxBaseCost) * 100)
    ),
    rangeLabel: getRouteRangeLabel(route)
  };
}

function renderBaseCostCell(route, helpers) {
  const { widthPct, rangeLabel } = getBaseCostBarData(route, helpers);
  const { formatCurrency, t } = helpers;
  const valueLabel = `${formatCurrency(route.baseCostUsdPerLiter, 2)}/L`;
  const commonStyle = `--cost-progress-width:${widthPct}%; --cost-progress-color: var(--route-color-${route.id}, currentColor);`;

  if (route.category === 'saf') {
    return `
      <div class="cost-progress-cell">
        <div class="cost-progress route-${route.id}" style="${commonStyle}">
          <input class="cost-progress-input" data-route-id="${route.id}" data-field="baseCostUsdPerLiter" type="number" step="0.01" min="0" value="${route.baseCostUsdPerLiter}" />
          <div class="cost-progress-track">
            <div class="cost-progress-fill"></div>
          </div>
          <div class="cost-progress-copy">
            <strong class="cost-progress-value">${valueLabel}</strong>
            <span class="cost-progress-range">${rangeLabel || t('研究基线', 'Research baseline')}</span>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="cost-progress-cell">
      <div class="cost-progress route-${route.id}" style="${commonStyle}">
        <div class="cost-progress-track">
          <div class="cost-progress-fill"></div>
        </div>
        <div class="cost-progress-copy">
          <strong class="cost-progress-value">${valueLabel}</strong>
          <span class="cost-progress-range">${t('Jet-A / Kerosene 基准', 'Jet-A / Kerosene baseline')}</span>
        </div>
      </div>
    </div>
  `;
}

export function renderRoutesTableSection({
  routesBody,
  state,
  computeRoute,
  formatBreakEvenCrude,
  formatCurrency,
  getBenchmarkLabel,
  getRouteDisplayName,
  getRouteRangeLabel,
  onEdit,
  t,
  toFiniteNumber
}) {
  if (!routesBody) {
    return;
  }

  const benchmarkLabel = getBenchmarkLabel();
  const helpers = {
    routes: state.routes,
    formatCurrency,
    getRouteRangeLabel,
    t,
    toFiniteNumber
  };

  routesBody.innerHTML = state.routes
    .map((route) => {
      const stats = computeRoute(route);
      const shippedRoute = state.shippedRoutes.find((item) => item.id === route.id);
      const costOverridden =
        route.category === 'saf' &&
        shippedRoute &&
        toFiniteNumber(route.baseCostUsdPerLiter, 0) !==
          toFiniteNumber(shippedRoute.baseCostUsdPerLiter, 0);
      const co2Overridden =
        route.category === 'saf' &&
        shippedRoute &&
        toFiniteNumber(route.co2SavingsKgPerLiter, 0) !==
          toFiniteNumber(shippedRoute.co2SavingsKgPerLiter, 0);
      const baseCostCell = renderBaseCostCell(route, helpers);

      return `
        <tr>
          <td>
            <strong>${getRouteDisplayName(route)}</strong>
            <div class="subtle">${route.pathway}</div>
          </td>
          <td>${baseCostCell}${costOverridden ? `<div class="subtle override-note">${t('已本地覆盖，刷新公开数据不会重置', 'Locally overridden; market refresh will not reset it')}</div>` : ''}</td>
          <td>
            ${
              route.category === 'saf'
                ? `<input data-route-id="${route.id}" data-field="co2SavingsKgPerLiter" type="number" step="0.1" min="0" value="${route.co2SavingsKgPerLiter}" />`
                : '—'
            }
            ${co2Overridden ? `<div class="subtle override-note">${t('减排参数已本地覆盖', 'CO₂ reduction value locally overridden')}</div>` : ''}
          </td>
          <td>${formatCurrency(stats.effectiveCost, 3)}</td>
          <td>${stats.delta >= 0 ? '+' : ''}${formatCurrency(stats.delta, 3)} vs ${benchmarkLabel}</td>
          <td>${formatBreakEvenCrude(stats.breakEvenCrude)}</td>
          <td>${stats.competitiveness}</td>
        </tr>
      `;
    })
    .join('');

  routesBody.querySelectorAll('input[data-route-id]').forEach((input) => {
    input.addEventListener('input', (event) => {
      onEdit(event.currentTarget);
    });
  });
}
