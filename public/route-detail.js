const locale = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';

const titleNode = document.querySelector('#route-detail-title');
const subtitleNode = document.querySelector('#route-detail-subtitle');
const contentNode = document.querySelector('#route-detail-content');

init().catch((error) => {
  if (titleNode) {
    titleNode.textContent = t('路线加载失败', 'Failed to load route');
  }
  if (subtitleNode) {
    subtitleNode.textContent = error instanceof Error ? error.message : String(error);
  }
});

async function init() {
  const routeId = getRouteIdFromUrl();
  if (!routeId) {
    throw new Error(t('缺少路线 id。', 'Missing route id.'));
  }

  const response = await fetch('/api/market-data');
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || t('无法读取市场数据。', 'Unable to read market data.'));
  }

  const route = payload?.baselines?.routes?.find((item) => item.id === routeId);
  if (!route) {
    throw new Error(t(`未找到路线：${routeId}`, `Route not found: ${routeId}`));
  }

  const defaults = payload.defaults ?? {};
  const meta = payload.meta ?? {};
  const crude = Number(defaults.crudeUsdPerBarrel ?? 80);
  const carbon = Number(defaults.carbonPriceUsdPerTonne ?? 90);
  const subsidy = Number(defaults.subsidyUsdPerLiter ?? 0.5);
  const slope = Number(defaults.jetProxySlope ?? 0.0082);
  const intercept = Number(defaults.jetProxyIntercept ?? 0.12);

  const carbonCredit = (carbon / 1000) * Number(route.co2SavingsKgPerLiter ?? 0);
  const effectiveCost = Number(route.baseCostUsdPerLiter) - carbonCredit - subsidy;
  const noPolicyEffective = Number(route.baseCostUsdPerLiter);
  const jetProxy = slope * crude + intercept;
  const delta = effectiveCost - jetProxy;
  const breakEvenCrude = slope > 0 ? (effectiveCost - intercept) / slope : null;
  const range = Array.isArray(route.baseCostRange) && route.baseCostRange.length === 2 ? route.baseCostRange : null;
  const effectiveRange = range ? range.map((value) => value - carbonCredit - subsidy) : null;
  const benchmarkMode = defaults.benchmarkMode === 'live-jet-spot' ? 'live jet spot' : 'crude proxy';

  if (titleNode) {
    titleNode.textContent = getRouteDisplayName(route);
  }
  if (subtitleNode) {
    subtitleNode.textContent =
      locale === 'en'
        ? `${route.pathway} · ${benchmarkMode} benchmark`
        : `${route.pathway} · 当前按 ${benchmarkMode} 口径比较`;
  }

  const sensitivityRows = [60, 80, 100, 120, 140]
    .map((oil) => {
      const benchmark = slope * oil + intercept;
      const gap = effectiveCost - benchmark;
      return `<tr>
        <td>${oil}</td>
        <td>${fmtCurrency(benchmark, 3)}</td>
        <td>${gap >= 0 ? '+' : ''}${fmtCurrency(gap, 3)}</td>
        <td>${gap <= 0 ? t('已竞争', 'Competitive') : gap <= 0.25 ? t('接近', 'Near parity') : t('仍偏贵', 'Still above')}</td>
      </tr>`;
    })
    .join('');

  const policyRows = [
    { carbon: 60, subsidy: 0.2 },
    { carbon: 90, subsidy: 0.5 },
    { carbon: 150, subsidy: 0.75 }
  ]
    .map((scenario) => {
      const scenarioCredit = (scenario.carbon / 1000) * Number(route.co2SavingsKgPerLiter ?? 0);
      const scenarioEffective = Number(route.baseCostUsdPerLiter) - scenarioCredit - scenario.subsidy;
      const scenarioDelta = scenarioEffective - jetProxy;
      return `<tr>
        <td>${fmtCurrency(scenario.carbon, 0)}/tCO₂</td>
        <td>${fmtCurrency(scenario.subsidy, 2)}/L</td>
        <td>${fmtCurrency(scenarioEffective, 3)}/L</td>
        <td>${scenarioDelta >= 0 ? '+' : ''}${fmtCurrency(scenarioDelta, 3)}/L</td>
      </tr>`;
    })
    .join('');

  if (contentNode) {
    contentNode.innerHTML = `
      <div class="detail-grid">
        <article class="metric-card">
          <span>${t('研究基线成本', 'Research baseline cost')}</span>
          <strong>${fmtCurrency(route.baseCostUsdPerLiter)}</strong>
          <small>${range ? `${fmtCurrency(range[0], 2)}–${fmtCurrency(range[1], 2)}/L` : t('暂无区间', 'No range published')}</small>
        </article>
        <article class="metric-card">
          <span>${t('碳价抵扣', 'Carbon credit')}</span>
          <strong>${fmtCurrency(carbonCredit, 3)}</strong>
          <small>${fmtCurrency(carbon, 0)}/tCO₂ × ${fmtNumber(route.co2SavingsKgPerLiter, 2)} kg/L</small>
        </article>
        <article class="metric-card">
          <span>${t('补贴抵扣', 'Subsidy offset')}</span>
          <strong>${fmtCurrency(subsidy, 3)}</strong>
          <small>${t('当前情景补贴', 'Current scenario subsidy')}</small>
        </article>
        <article class="metric-card">
          <span>${t('有效成本', 'Effective cost')}</span>
          <strong>${fmtCurrency(effectiveCost, 3)}</strong>
          <small>${effectiveRange ? `${fmtCurrency(effectiveRange[0], 2)}–${fmtCurrency(effectiveRange[1], 2)}/L` : t('按当前政策修正', 'Policy-adjusted at current inputs')}</small>
        </article>
        <article class="metric-card">
          <span>${t('当前比较基准', 'Current benchmark')}</span>
          <strong>${fmtCurrency(jetProxy, 3)}</strong>
          <small>${t('由 slope/intercept 与当前油价推得', 'Derived from slope/intercept and current crude')}</small>
        </article>
        <article class="metric-card">
          <span>${t('与 Jet-A 差额', 'Gap vs Jet-A')}</span>
          <strong>${delta >= 0 ? '+' : ''}${fmtCurrency(delta, 3)}</strong>
          <small>${delta <= 0 ? t('当前口径下已具竞争力', 'Competitive under current benchmark') : t('仍高于当前比较基准', 'Still above the active benchmark')}</small>
        </article>
        <article class="metric-card">
          <span>${t('盈亏平衡油价', 'Break-even crude')}</span>
          <strong>${breakEvenCrude == null ? '—' : `${fmtCurrency(breakEvenCrude, 1)}/bbl`}</strong>
          <small>${t('effectiveCost = proxy benchmark 时', 'When effective cost equals the proxy benchmark')}</small>
        </article>
        <article class="metric-card">
          <span>${t('减排强度', 'CO₂ savings')}</span>
          <strong>${fmtNumber(route.co2SavingsKgPerLiter, 2)} kg/L</strong>
          <small>${t('单位燃料生命周期减排', 'Lifecycle savings per liter')}</small>
        </article>
      </div>

      <div class="detail-waterfall">
        <h2>${t('成本 waterfall', 'Cost waterfall')}</h2>
        <div class="detail-waterfall-grid">
          ${renderWaterfallStep(t('研究基线', 'Research baseline'), route.baseCostUsdPerLiter, 'neutral')}
          ${renderWaterfallStep(t('碳价抵扣', 'Carbon credit'), -carbonCredit, 'success')}
          ${renderWaterfallStep(t('补贴抵扣', 'Subsidy offset'), -subsidy, 'success')}
          ${renderWaterfallStep(t('有效成本', 'Effective cost'), effectiveCost, 'accent')}
          ${renderWaterfallStep(t('当前基准', 'Current benchmark'), jetProxy, delta <= 0 ? 'success' : 'warning')}
        </div>
      </div>

      <div class="detail-grid detail-grid--two">
        <article class="panel detail-note-card">
          <h2>${t('路线说明', 'Pathway note')}</h2>
          <p>${route.pathway}</p>
          <p>${t('这是当前仓库内置的研究基线路线之一；成本区间来自人工整理的 2024–2025 研究输入，可被本地覆盖。', 'This is one of the built-in research baseline pathways. The cost range comes from manually curated 2024–2025 research inputs and can be locally overridden.')}</p>
          <ul class="detail-facts">
            <li>${t('类别', 'Category')}: ${route.category}</li>
            <li>${t('当前 parser 版本', 'Current parser version')}: ${meta.parserVersion ?? 'unknown'}</li>
            <li>${t('生成时间', 'Generated at')}: ${fmtDate(payload.generatedAt)}</li>
          </ul>
        </article>
        <article class="panel detail-note-card">
          <h2>${t('当前参数上下文', 'Current scenario context')}</h2>
          <ul class="detail-facts">
            <li>${t('油价', 'Crude')}: ${fmtCurrency(crude, 0)}/bbl</li>
            <li>${t('碳价', 'Carbon')}: ${fmtCurrency(carbon, 0)}/tCO₂</li>
            <li>${t('补贴', 'Subsidy')}: ${fmtCurrency(subsidy, 2)}/L</li>
            <li>${t('无政策成本', 'No-policy cost')}: ${fmtCurrency(noPolicyEffective, 3)}/L</li>
          </ul>
          <div class="cta-row">
            <a class="secondary-button" href="${getLocalizedPath('/explorer')}">${t('回到 Explorer 调参数', 'Back to Explorer')}</a>
            <a class="ghost-button" href="${getLocalizedPath('/routes')}">${t('回到 Routes 总表', 'Back to Routes')}</a>
          </div>
        </article>
      </div>

      <div class="detail-sensitivity">
        <h2>${t('对油价敏感度', 'Crude sensitivity')}</h2>
        <table>
          <thead>
            <tr>
              <th>${t('油价 ($/bbl)', 'Crude ($/bbl)')}</th>
              <th>${t('Jet proxy ($/L)', 'Jet proxy ($/L)')}</th>
              <th>${t('与路线差额', 'Gap vs route')}</th>
              <th>${t('判断', 'Verdict')}</th>
            </tr>
          </thead>
          <tbody>${sensitivityRows}</tbody>
        </table>
      </div>

      <div class="detail-sensitivity">
        <h2>${t('政策敏感度快照', 'Policy sensitivity snapshot')}</h2>
        <table>
          <thead>
            <tr>
              <th>${t('碳价', 'Carbon')}</th>
              <th>${t('补贴', 'Subsidy')}</th>
              <th>${t('有效成本', 'Effective cost')}</th>
              <th>${t('相对当前基准', 'Gap vs current benchmark')}</th>
            </tr>
          </thead>
          <tbody>${policyRows}</tbody>
        </table>
      </div>
    `;
  }
}

function getRouteIdFromUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get('id');
  if (fromQuery) {
    return fromQuery;
  }
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts.at(-1) === 'routes' ? '' : parts.at(-1);
}

function t(zh, en) {
  return locale === 'en' ? en : zh;
}

function getLocalizedPath(pathname) {
  return locale === 'en' ? `/en${pathname}` : pathname;
}

function getRouteDisplayName(route) {
  if (locale !== 'en') {
    return route.name;
  }

  const names = {
    'jet-a': 'Traditional Jet Fuel',
    'sugar-atj': 'Sugar ATJ-SPK',
    'reed-hefa': 'Non-edible Reed / HEFA',
    'cellulose-ft': 'Cellulosic FT-SPK',
    'lignin-ft': 'Lignin HT Gasification FT',
    'hemicellulose-atj': 'Hemicellulose Furanics ATJ',
    'ptl-esaf': 'Green H₂ PtL e-SAF'
  };

  return names[route.id] ?? route.name;
}

function renderWaterfallStep(label, value, tone) {
  return `
    <div class="waterfall-step waterfall-step--${tone}">
      <span>${label}</span>
      <strong>${value >= 0 ? '' : '-'}${fmtCurrency(Math.abs(value), 3)}</strong>
    </div>
  `;
}

function fmtCurrency(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  return `$${numeric.toFixed(digits)}`;
}

function fmtNumber(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  return numeric.toFixed(digits);
}

function fmtDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN');
}
