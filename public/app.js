import { parseUrlState, writeUrlState } from './_state/url-state.js';
import { renderHomeSnapshotSection } from './_pages/home.js';
import { renderIndustryDashboardSection } from './_pages/industry.js';
import {
  renderBreakevenCalculatorSection,
  renderBreakevenRouteListSection,
  renderCurrentCostCompareSection,
  renderRealtimeExplorerSection
} from './_pages/explorer.js';
import { renderRoutesTableSection } from './_pages/routes.js';
import { renderLocalPersistenceSection } from './_pages/scenarios.js';
import { renderSourcesPage, renderTimelineSection } from './_pages/sources.js';
import { getIndustryDashboardViewModel } from './_shared/industry-dashboard-viewmodel.js';
import { renderRouteRow } from './_components/route-row.js';
import { renderSignalCard } from './_components/signal-card.js';

const PAGE_TYPE = document.body?.dataset.page || 'home';
const LOCAL_STORAGE_KEY = 'safvsoil.frontend.local-settings.v1';
const LOCAL_STORAGE_VERSION = 1;
const SCENARIO_STORAGE_KEY = 'safvsoil.saved-scenarios.v1';
const SCENARIO_STORAGE_VERSION = 1;
const LOCALE = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';

function l(zh, en) {
  return LOCALE === 'en' ? en : zh;
}
const THEME_STORAGE_KEY = 'safvsoil.theme.v1';
const FALLBACK_DEFAULTS = {
  crudeSource: 'manual',
  carbonSource: 'manual',
  benchmarkMode: 'crude-proxy',
  crudeUsdPerBarrel: 80,
  carbonPriceUsdPerTonne: 90,
  subsidyUsdPerLiter: 0.5,
  jetProxySlope: 0.0082,
  jetProxyIntercept: 0.12,
  autoRefreshEnabled: true,
  autoRefreshMs: 10 * 60 * 1000
};

const state = {
  marketData: null,
  routes: [],
  shippedRoutes: [],
  shippedDefaults: { ...FALLBACK_DEFAULTS },
  persistedRouteEdits: {},
  crudeSource: FALLBACK_DEFAULTS.crudeSource,
  carbonSource: FALLBACK_DEFAULTS.carbonSource,
  benchmarkMode: FALLBACK_DEFAULTS.benchmarkMode,
  crudeUsdPerBarrel: FALLBACK_DEFAULTS.crudeUsdPerBarrel,
  carbonPriceUsdPerTonne: FALLBACK_DEFAULTS.carbonPriceUsdPerTonne,
  subsidyUsdPerLiter: FALLBACK_DEFAULTS.subsidyUsdPerLiter,
  jetProxySlope: FALLBACK_DEFAULTS.jetProxySlope,
  jetProxyIntercept: FALLBACK_DEFAULTS.jetProxyIntercept,
  autoRefreshEnabled: FALLBACK_DEFAULTS.autoRefreshEnabled,
  autoRefreshMs: FALLBACK_DEFAULTS.autoRefreshMs,
  autoRefreshTimer: null,
  persistedAt: null,
  serverPersistence: null,
  serverPersistenceBusy: false,
  serverPersistenceError: null,
  savedScenarios: [],
  selectedScenarioId: '',
  scenarioDraftName: '',
  theme: 'light',
  hasHydrated: false
};

let renderFrame = 0;
let pendingStatusMessage = null;
let pendingStatusTone = 'ok';
let localPersistTimer = 0;

const els = {
  runtimeStatus: document.querySelector('#runtime-status'),
  themeToggle: document.querySelector('#theme-toggle'),
  refreshBtn: document.querySelector('#refresh-btn'),
  saveServerBtn: document.querySelector('#save-server-btn'),
  clearServerBtn: document.querySelector('#clear-server-btn'),
  resetBtn: document.querySelector('#reset-btn'),
  scenarioName: document.querySelector('#scenario-name'),
  activeScenarioName: document.querySelector('#active-scenario-name'),
  scenarioList: document.querySelector('#scenario-list'),
  saveScenarioBtn: document.querySelector('#save-scenario-btn'),
  loadScenarioBtn: document.querySelector('#load-scenario-btn'),
  deleteScenarioBtn: document.querySelector('#delete-scenario-btn'),
  scenarioSummary: document.querySelector('#scenario-summary'),
  localState: document.querySelector('#local-state'),
  sourceLockCard: document.querySelector('#source-lock-card'),
  crudeSource: document.querySelector('#crude-source'),
  crudeInput: document.querySelector('#crude-input'),
  crudeSlider: document.querySelector('#crude-slider'),
  carbonSource: document.querySelector('#carbon-source'),
  carbonInput: document.querySelector('#carbon-input'),
  carbonSlider: document.querySelector('#carbon-slider'),
  subsidyInput: document.querySelector('#subsidy-input'),
  subsidySlider: document.querySelector('#subsidy-slider'),
  benchmarkMode: document.querySelector('#benchmark-mode'),
  slopeInput: document.querySelector('#slope-input'),
  interceptInput: document.querySelector('#intercept-input'),
  autoRefresh: document.querySelector('#auto-refresh'),
  homeHeroStat: document.querySelector('#home-hero-stat'),
  homeSignalGrid: document.querySelector('#home-signal-grid'),
  homeTopRoutes: document.querySelector('#home-top-routes'),
  currentCostCompare: document.querySelector('#current-cost-compare'),
  breakevenFormula: document.querySelector('#breakeven-formula'),
  breakevenControls: document.querySelector('#breakeven-controls'),
  breakevenCoreMetrics: document.querySelector('#breakeven-core-metrics'),
  breakevenRouteList: document.querySelector('#breakeven-route-list'),
  routesBody: document.querySelector('#routes-body'),
  sourceSummary: document.querySelector('#source-summary'),
  sourceComparison: document.querySelector('#source-comparison'),
  sourceGrid: document.querySelector('#source-grid'),
  timeline: document.querySelector('#timeline'),
  industrySignalCards: document.querySelector('#industry-signal-cards'),
  industryCountries: document.querySelector('#industry-countries'),
  industryAirlines: document.querySelector('#industry-airlines'),
  industryPathways: document.querySelector('#industry-pathways'),
  industryTimeline: document.querySelector('#industry-timeline')
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatNumber(value, digits = 2) {
  return toFiniteNumber(value, 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatCurrency(value, digits = 2) {
  return `$${formatNumber(value, digits)}`;
}

function formatCostMultiple(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${formatNumber(value, 1)}×`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? l('未知时间', 'Unknown time')
    : date.toLocaleString(LOCALE === 'en' ? 'en-US' : 'zh-CN');
}

function formatRelativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return l('时间未知', 'Unknown time');
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(Math.abs(diffMs) / 60000);

  if (diffMinutes < 1) {
    return l('刚刚', 'just now');
  }
  if (diffMinutes < 60) {
    return LOCALE === 'en'
      ? `${diffMinutes} min ${diffMs >= 0 ? 'ago' : 'from now'}`
      : `${diffMinutes} 分钟${diffMs >= 0 ? '前' : '后'}`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return LOCALE === 'en'
      ? `${diffHours} hr ${diffMs >= 0 ? 'ago' : 'from now'}`
      : `${diffHours} 小时${diffMs >= 0 ? '前' : '后'}`;
  }

  const diffDays = Math.round(diffHours / 24);
  return LOCALE === 'en'
    ? `${diffDays} day${diffDays === 1 ? '' : 's'} ${diffMs >= 0 ? 'ago' : 'from now'}`
    : `${diffDays} 天${diffMs >= 0 ? '前' : '后'}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseDateish(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) {
    return null;
  }

  const fallback = new Date(match[0]);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getPreferredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // Ignore storage read issues and fall back to system preference.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getRouteDisplayName(route) {
  if (LOCALE !== 'en') {
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

function getRouteRangeLabel(route) {
  if (!route.baseCostRange?.length || route.baseCostRange.length !== 2) {
    return '';
  }

  return LOCALE === 'en'
    ? `Range: ${formatCurrency(route.baseCostRange[0], 2)}–${formatCurrency(route.baseCostRange[1], 2)}`
    : `范围：${formatCurrency(route.baseCostRange[0], 2)}–${formatCurrency(route.baseCostRange[1], 2)}`;
}

function getCompetitivenessText(delta) {
  if (delta <= 0) return l('✓ 已具竞争力', '✓ Competitive');
  if (delta <= 0.25) return l('≈ 接近盈亏平衡', '≈ Near parity');
  return l('✗ 尚无竞争力', '✗ Not competitive yet');
}

function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = state.theme;
  document.documentElement.style.colorScheme = state.theme;

  if (els.themeToggle) {
    const nextLabel = state.theme === 'dark' ? l('切换浅色', 'Switch to light mode') : l('切换深色', 'Switch to dark mode');
    els.themeToggle.textContent = nextLabel;
    els.themeToggle.setAttribute('aria-pressed', String(state.theme === 'dark'));
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  } catch {
    // Ignore storage write issues for theme preference.
  }
}

function normalizeDefaults(defaults = {}) {
  return {
    crudeSource: defaults.crudeSource ?? FALLBACK_DEFAULTS.crudeSource,
    carbonSource: defaults.carbonSource ?? FALLBACK_DEFAULTS.carbonSource,
    benchmarkMode: defaults.benchmarkMode ?? FALLBACK_DEFAULTS.benchmarkMode,
    crudeUsdPerBarrel: toFiniteNumber(
      defaults.crudeUsdPerBarrel,
      FALLBACK_DEFAULTS.crudeUsdPerBarrel
    ),
    carbonPriceUsdPerTonne: toFiniteNumber(
      defaults.carbonPriceUsdPerTonne,
      FALLBACK_DEFAULTS.carbonPriceUsdPerTonne
    ),
    subsidyUsdPerLiter: toFiniteNumber(
      defaults.subsidyUsdPerLiter,
      FALLBACK_DEFAULTS.subsidyUsdPerLiter
    ),
    jetProxySlope: toFiniteNumber(defaults.jetProxySlope, FALLBACK_DEFAULTS.jetProxySlope),
    jetProxyIntercept: toFiniteNumber(
      defaults.jetProxyIntercept,
      FALLBACK_DEFAULTS.jetProxyIntercept
    ),
    autoRefreshEnabled: FALLBACK_DEFAULTS.autoRefreshEnabled,
    autoRefreshMs: toFiniteNumber(defaults.autoRefreshMs, FALLBACK_DEFAULTS.autoRefreshMs)
  };
}

function applySettings(settings) {
  state.crudeSource = settings.crudeSource ?? state.crudeSource;
  state.carbonSource = settings.carbonSource ?? state.carbonSource;
  state.benchmarkMode = settings.benchmarkMode ?? state.benchmarkMode;
  state.crudeUsdPerBarrel = toFiniteNumber(settings.crudeUsdPerBarrel, state.crudeUsdPerBarrel);
  state.carbonPriceUsdPerTonne = toFiniteNumber(
    settings.carbonPriceUsdPerTonne,
    state.carbonPriceUsdPerTonne
  );
  state.subsidyUsdPerLiter = toFiniteNumber(settings.subsidyUsdPerLiter, state.subsidyUsdPerLiter);
  state.jetProxySlope = toFiniteNumber(settings.jetProxySlope, state.jetProxySlope);
  state.jetProxyIntercept = toFiniteNumber(settings.jetProxyIntercept, state.jetProxyIntercept);
  state.autoRefreshEnabled =
    typeof settings.autoRefreshEnabled === 'boolean'
      ? settings.autoRefreshEnabled
      : state.autoRefreshEnabled;
  state.autoRefreshMs = toFiniteNumber(settings.autoRefreshMs, state.autoRefreshMs);
}

function getRouteEditSnapshot(routes = state.routes) {
  return Object.fromEntries(
    routes
      .filter((route) => route.category === 'saf')
      .map((route) => [
        route.id,
        {
          baseCostUsdPerLiter: toFiniteNumber(route.baseCostUsdPerLiter, 0),
          co2SavingsKgPerLiter: toFiniteNumber(route.co2SavingsKgPerLiter, 0)
        }
      ])
  );
}

function readLocalSettings() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed.version !== LOCAL_STORAGE_VERSION) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read local settings', error);
    return null;
  }
}

function hydrateLocalState() {
  const persisted = readLocalSettings();
  if (!persisted) {
    return;
  }

  state.persistedAt = persisted.savedAt ?? null;
  state.persistedRouteEdits = persisted.routeEdits ?? {};

  if (persisted.settings && Object.keys(persisted.settings).length > 0) {
    applySettings({
      ...persisted.settings,
      autoRefreshMs: state.autoRefreshMs
    });
    state.hasHydrated = true;
  }
}

function persistLocalState() {
  if (!state.marketData) {
    return;
  }

  const payload = {
    version: LOCAL_STORAGE_VERSION,
    savedAt: new Date().toISOString(),
    settings: {
      crudeSource: state.crudeSource,
      carbonSource: state.carbonSource,
      benchmarkMode: state.benchmarkMode,
      crudeUsdPerBarrel: state.crudeUsdPerBarrel,
      carbonPriceUsdPerTonne: state.carbonPriceUsdPerTonne,
      subsidyUsdPerLiter: state.subsidyUsdPerLiter,
      jetProxySlope: state.jetProxySlope,
      jetProxyIntercept: state.jetProxyIntercept,
      autoRefreshEnabled: state.autoRefreshEnabled
    },
    routeEdits: getRouteEditSnapshot()
  };

  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    state.persistedRouteEdits = payload.routeEdits;
    state.persistedAt = payload.savedAt;
  } catch (error) {
    console.warn('Failed to persist local settings', error);
  }
}

function scheduleLocalPersistence() {
  clearTimeout(localPersistTimer);
  localPersistTimer = window.setTimeout(() => {
    localPersistTimer = 0;
    persistLocalState();
  }, 120);
}

function requestRender(statusMessage = null, statusTone = 'ok') {
  if (statusMessage) {
    pendingStatusMessage = statusMessage;
    pendingStatusTone = statusTone;
  }

  if (renderFrame) {
    return;
  }

  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = 0;
    renderAll();
    if (pendingStatusMessage) {
      renderStatus(pendingStatusMessage, pendingStatusTone);
      pendingStatusMessage = null;
      pendingStatusTone = 'ok';
    }
  });
}

function clearLocalState() {
  try {
    window.localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear local settings', error);
  }

  state.persistedAt = null;
  state.persistedRouteEdits = {};
}

function slugifyScenarioName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function buildScenarioPayload() {
  return {
    settings: {
      crudeSource: state.crudeSource,
      carbonSource: state.carbonSource,
      benchmarkMode: state.benchmarkMode,
      crudeUsdPerBarrel: state.crudeUsdPerBarrel,
      carbonPriceUsdPerTonne: state.carbonPriceUsdPerTonne,
      subsidyUsdPerLiter: state.subsidyUsdPerLiter,
      jetProxySlope: state.jetProxySlope,
      jetProxyIntercept: state.jetProxyIntercept
    },
    routeEdits: getRouteEditSnapshot()
  };
}

function readScenarioStore() {
  try {
    const raw = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (parsed.version !== SCENARIO_STORAGE_VERSION || !Array.isArray(parsed.scenarios)) {
      return [];
    }

    return parsed.scenarios;
  } catch (error) {
    console.warn('Failed to read scenario store', error);
    return [];
  }
}

function writeScenarioStore() {
  try {
    window.localStorage.setItem(
      SCENARIO_STORAGE_KEY,
      JSON.stringify({
        version: SCENARIO_STORAGE_VERSION,
        savedAt: new Date().toISOString(),
        scenarios: state.savedScenarios
      })
    );
  } catch (error) {
    console.warn('Failed to persist scenarios', error);
  }
}

function hydrateScenarioStore() {
  state.savedScenarios = readScenarioStore();
  if (state.savedScenarios.length > 0) {
    state.selectedScenarioId = state.savedScenarios[0].id;
    state.scenarioDraftName = state.savedScenarios[0].name;
  }
}

function getSelectedScenario() {
  return state.savedScenarios.find((scenario) => scenario.id === state.selectedScenarioId) ?? null;
}

function applyScenario(scenario) {
  if (!scenario) {
    return;
  }

  applySettings(scenario.payload.settings);
  state.routes = state.shippedRoutes.map((route) => ({
    ...route,
    ...(scenario.payload.routeEdits?.[route.id] ?? {})
  }));
  if (state.marketData?.baselines) {
    state.marketData.baselines.routes = state.routes;
  }
  state.selectedScenarioId = scenario.id;
  state.scenarioDraftName = scenario.name;
  applyCrudeSourceSelection();
  applyCarbonSourceSelection();
  persistAndRender();
}

function saveScenario() {
  const rawName = state.scenarioDraftName.trim();
  if (!rawName) {
    renderStatus(l('请先填写 scenario 名称。', 'Please enter a scenario name first.'), 'warn');
    return;
  }

  const now = new Date().toISOString();
  const payload = buildScenarioPayload();
  const existing = state.savedScenarios.find(
    (scenario) => scenario.id === state.selectedScenarioId || scenario.name === rawName
  );

  const nextScenario = {
    id: existing?.id ?? (slugifyScenarioName(rawName) || `scenario-${Date.now()}`),
    name: rawName,
    savedAt: now,
    payload
  };

  const filtered = state.savedScenarios.filter((scenario) => scenario.id !== nextScenario.id);
  state.savedScenarios = [nextScenario, ...filtered].sort((left, right) =>
    right.savedAt.localeCompare(left.savedAt)
  );
  state.selectedScenarioId = nextScenario.id;
  state.scenarioDraftName = nextScenario.name;
  writeScenarioStore();
  renderAll();
  renderStatus(`${l('已保存 scenario', 'Saved scenario')}: ${nextScenario.name}`, 'ok');
}

function deleteSelectedScenario() {
  const scenario = getSelectedScenario();
  if (!scenario) {
    renderStatus(l('请先选择要删除的 scenario。', 'Please select a scenario to delete first.'), 'warn');
    return;
  }

  state.savedScenarios = state.savedScenarios.filter((item) => item.id !== scenario.id);
  state.selectedScenarioId = state.savedScenarios[0]?.id ?? '';
  state.scenarioDraftName = state.savedScenarios[0]?.name ?? '';
  writeScenarioStore();
  renderAll();
  renderStatus(`${l('已删除 scenario', 'Deleted scenario')}: ${scenario.name}`, 'neutral');
}

function countScenarioDifferences(scenario) {
  if (!scenario) {
    return { settings: 0, routes: 0 };
  }

  const current = buildScenarioPayload();
  const settingKeys = Object.keys(scenario.payload.settings ?? {});
  const routeIds = new Set([
    ...Object.keys(scenario.payload.routeEdits ?? {}),
    ...Object.keys(current.routeEdits ?? {})
  ]);

  const settings = settingKeys.filter(
    (key) => scenario.payload.settings?.[key] !== current.settings?.[key]
  ).length;

  let routes = 0;
  for (const routeId of routeIds) {
    const routeFields = new Set([
      ...Object.keys(scenario.payload.routeEdits?.[routeId] ?? {}),
      ...Object.keys(current.routeEdits?.[routeId] ?? {})
    ]);

    for (const field of routeFields) {
      if (scenario.payload.routeEdits?.[routeId]?.[field] !== current.routeEdits?.[routeId]?.[field]) {
        routes += 1;
      }
    }
  }

  return { settings, routes };
}

function syncServerPersistenceFromMarketData(persistence) {
  if (!persistence) {
    state.serverPersistence = null;
    return;
  }

  state.serverPersistence = {
    ...(state.serverPersistence ?? {}),
    mode: persistence.mode,
    scope: persistence.scope,
    file: persistence.file,
    exists: Boolean(persistence.exists),
    savedAt: persistence.savedAt ?? null,
    warning: persistence.warning ?? null,
    sourceLocks: persistence.sourceLocks ?? {},
    routeEditCount: persistence.routeEditCount ?? 0,
    semantics: {
      ...(state.serverPersistence?.semantics ?? {}),
      ...(persistence.semantics ?? {})
    }
  };
}

function syncServerPersistenceFromResponse(payload) {
  if (!payload) {
    state.serverPersistence = null;
    return;
  }

  state.serverPersistence = {
    ...state.serverPersistence,
    ...payload.persistence,
    semantics: {
      ...(state.serverPersistence?.semantics ?? {}),
      ...(payload.persistence?.semantics ?? {})
    },
    savedAt: payload.savedAt ?? null,
    preferences: payload.preferences ?? {},
    routeEdits: payload.routeEdits ?? {},
    exists: Boolean(payload.persistence?.exists)
  };
}

function getPersistablePreferences() {
  return {
    crudeSource: state.crudeSource,
    carbonSource: state.carbonSource,
    benchmarkMode: state.benchmarkMode,
    carbonPriceUsdPerTonne: state.carbonPriceUsdPerTonne,
    subsidyUsdPerLiter: state.subsidyUsdPerLiter,
    jetProxySlope: state.jetProxySlope,
    jetProxyIntercept: state.jetProxyIntercept
  };
}

function computeJetProxy(targetState = state) {
  const sourceState = targetState ?? state;
  return sourceState.jetProxySlope * sourceState.crudeUsdPerBarrel + sourceState.jetProxyIntercept;
}

function getLiveJetSpot(targetState = state, targetMarketData = targetState?.marketData) {
  const sourceMarketData = targetMarketData ?? targetState?.marketData;
  return sourceMarketData?.sources?.jetFred?.status === 'ok'
    ? sourceMarketData.sources.jetFred.value
    : null;
}

function getCrudeSourceLabel() {
  const source = state.marketData?.sources?.[state.crudeSource];
  if (state.crudeSource === 'manual' || !source?.label) {
    return 'manual';
  }
  return source.label;
}

function getCarbonSourceLabel() {
  const source = state.marketData?.sources?.[state.carbonSource];
  if (state.carbonSource === 'manual' || !source?.label) {
    return 'manual';
  }
  return source.label;
}

function getBenchmarkPrice(targetState = state, targetMarketData = targetState?.marketData) {
  const sourceState = targetState ?? state;
  const liveJetSpot = getLiveJetSpot(sourceState, targetMarketData);
  if (sourceState.benchmarkMode === 'live-jet-spot' && liveJetSpot != null) {
    return liveJetSpot;
  }
  return computeJetProxy(sourceState);
}

function getBenchmarkLabel() {
  if (state.benchmarkMode === 'live-jet-spot' && getLiveJetSpot() != null) {
    return LOCALE === 'en' ? 'Live jet spot' : 'live jet spot';
  }
  return LOCALE === 'en' ? 'Crude proxy' : 'crude proxy';
}

function formatBreakEvenCrude(value) {
  if (!Number.isFinite(value)) {
    return l('需重新设定 proxy', 'proxy needs adjustment');
  }
  return `${formatCurrency(value, 0)}${l('/桶', '/bbl')}`;
}

function getLocalizedSourceLabel(source) {
  if (!source?.label) {
    return '';
  }

  if (LOCALE !== 'en') {
    return source.label;
  }

  const replacements = new Map([
    ['CBAM carbon proxy (USD converted)', 'CBAM carbon proxy (USD converted)'],
    ['SAF route cost baselines', 'SAF pathway cost baselines']
  ]);

  return replacements.get(source.label) ?? source.label;
}

function getLocalizedSourceNote(source) {
  const note = source?.note ?? source?.error ?? 'reference';
  if (LOCALE !== 'en') {
    return note;
  }

  const mapping = new Map([
    [
      '若官方 CBAM 价格或 ECB 汇率任一抓取失败，碳价回退为手动输入基线。',
      'If either the official CBAM price or the ECB FX rate fails, carbon falls back to the manual baseline.'
    ],
    [
      '官方页面解释机制，但未提供免授权、稳定的现货报价 API；当前版本将碳价保留为手动输入。',
      'The official page explains the mechanism but does not expose a stable keyless live quote API, so carbon remains manually overridable in this version.'
    ],
    [
      'ReFuelEU 目标时间表来自欧盟法规/委员会公开资料，按静态基线内置。',
      'ReFuelEU target milestones come from public EU regulation/Commission material and are shipped as static reference baselines.'
    ],
    [
      '各 SAF 路线成本目前仍使用你给定的 2024–2025 研究基线，可在前端本地改写；暂无稳定、免授权的公开现货 API。',
      'SAF pathway costs still use the provided 2024–2025 research baselines and can be locally edited in the frontend; no stable keyless public spot API exists yet.'
    ]
  ]);

  return mapping.get(note) ?? note;
}

function computeRouteVariant(
  route,
  overrides = {},
  targetState = state,
  targetMarketData = targetState?.marketData
) {
  const sourceState = targetState ?? state;
  const carbonPriceUsdPerTonne =
    overrides.carbonPriceUsdPerTonne ?? sourceState.carbonPriceUsdPerTonne;
  const subsidyUsdPerLiter = overrides.subsidyUsdPerLiter ?? sourceState.subsidyUsdPerLiter;
  const jetProxySlope = overrides.jetProxySlope ?? sourceState.jetProxySlope;
  const jetProxyIntercept = overrides.jetProxyIntercept ?? sourceState.jetProxyIntercept;
  const benchmarkPrice = overrides.benchmarkPrice ?? getBenchmarkPrice(sourceState, targetMarketData);
  const carbonCredit = (carbonPriceUsdPerTonne / 1000) * route.co2SavingsKgPerLiter;
  const effectiveCost = route.baseCostUsdPerLiter - carbonCredit - subsidyUsdPerLiter;
  let breakEvenCrude = Number.POSITIVE_INFINITY;
  if (jetProxySlope > 0) {
    breakEvenCrude = Math.max(0, (effectiveCost - jetProxyIntercept) / jetProxySlope);
  } else if (effectiveCost <= jetProxyIntercept) {
    breakEvenCrude = 0;
  }
  const delta = effectiveCost - benchmarkPrice;
  const competitiveness = getCompetitivenessText(delta);

  return {
    carbonCredit,
    effectiveCost,
    benchmarkPrice,
    breakEvenCrude,
    delta,
    competitiveness,
    costMultiple: benchmarkPrice > 0 ? effectiveCost / benchmarkPrice : Number.POSITIVE_INFINITY
  };
}

function computeRoute(route, targetState = state, targetMarketData = targetState?.marketData) {
  return computeRouteVariant(route, {}, targetState, targetMarketData);
}

function pickCheapestRoute(targetState = state, targetMarketData = targetState?.marketData) {
  return getSafRouteSnapshots(targetState, targetMarketData)
    .sort((a, b) => a.stats.effectiveCost - b.stats.effectiveCost)[0];
}

function getSafRouteSnapshots(targetState = state, targetMarketData = targetState?.marketData) {
  const sourceState = targetState ?? state;
  const safRoutes = (sourceState.routes ?? []).filter((route) => route.category === 'saf');
  return safRoutes
    .map((route) => {
      const withPolicy = computeRoute(route, sourceState, targetMarketData);
      return { route, stats: withPolicy, withPolicy };
    })
    .sort((a, b) => a.stats.breakEvenCrude - b.stats.breakEvenCrude);
}

function getJetBaselineRoute(targetState = state) {
  return (targetState?.routes ?? []).find((route) => route.category !== 'saf') ?? null;
}

function getCurrentCostCompareRows() {
  const benchmarkPrice = getBenchmarkPrice();
  const maxBaseCost = Math.max(
    benchmarkPrice,
    ...state.routes.map((route) => toFiniteNumber(route.baseCostUsdPerLiter, 0)),
    1
  );

  return state.routes
    .map((route) => {
      const stats = computeRoute(route);
      const baseCostMultiple =
        benchmarkPrice > 0 ? route.baseCostUsdPerLiter / benchmarkPrice : Number.POSITIVE_INFINITY;
      const barWidthPct = Math.max(
        8,
        Math.min(100, (toFiniteNumber(route.baseCostUsdPerLiter, 0) / maxBaseCost) * 100)
      );

      return {
        route,
        stats,
        baseCostMultiple,
        barWidthPct,
        isBaseline: route.category !== 'saf',
        competitivenessLabel: route.category !== 'saf' ? l('基准', 'Baseline') : formatCostMultiple(baseCostMultiple)
      };
    })
    .sort((left, right) => {
      if (left.isBaseline) return -1;
      if (right.isBaseline) return 1;
      return left.route.baseCostUsdPerLiter - right.route.baseCostUsdPerLiter;
    });
}

function getBreakevenListRows() {
  return state.routes
    .filter((route) => route.category === 'saf')
    .map((route) => {
      const withPolicy = computeRoute(route);
      const withoutPolicy = computeRouteVariant(route, {
        carbonPriceUsdPerTonne: 0,
        subsidyUsdPerLiter: 0
      });

      return {
        route,
        withPolicy,
        withoutPolicy
      };
    })
    .sort((left, right) => left.withPolicy.breakEvenCrude - right.withPolicy.breakEvenCrude);
}

function getHomepageSummary() {
  const cheapest = pickCheapestRoute();
  const benchmarkPrice = getBenchmarkPrice();
  const jetProxy = computeJetProxy();
  const liveJetSpot = getLiveJetSpot();
  const generatedAt = state.marketData?.generatedAt;
  const benchmarkLabel = getBenchmarkLabel();
  const sourceStatus = summarizeSources();

  return {
    cheapest,
    benchmarkPrice,
    jetProxy,
    liveJetSpot,
    generatedAt,
    benchmarkLabel,
    sourceStatus,
    priceGap: cheapest ? cheapest.stats.effectiveCost - benchmarkPrice : 0
  };
}

function getSourceFreshness(source) {
  const comparisonDate = parseDateish(state.marketData?.generatedAt) ?? new Date();
  const sourceDate = parseDateish(source.asOf) ?? parseDateish(source.publishedAt);
  if (!sourceDate) {
    return {
      tone: source.status === 'ok' ? 'neutral' : source.status,
      label: source.asOf ? `as of ${source.asOf}` : source.publishedAt ? `published ${source.publishedAt}` : l('更新时间未知', 'Update time unknown')
    };
  }

  const diffMs = Math.max(0, comparisonDate.getTime() - sourceDate.getTime());
  const cadence = `${source.cadence ?? ''}`.toLowerCase();
  let staleAfterMs = 7 * 24 * 60 * 60 * 1000;
  if (cadence.includes('daily') || cadence.includes('intraday')) {
    staleAfterMs = 3 * 24 * 60 * 60 * 1000;
  } else if (cadence.includes('monthly')) {
    staleAfterMs = 45 * 24 * 60 * 60 * 1000;
  }

  const ageHours = Math.round(diffMs / (60 * 60 * 1000));
  const ageLabel =
    ageHours < 24
      ? `${Math.max(ageHours, 1)}h ago`
      : `${Math.max(Math.round(ageHours / 24), 1)}d ago`;

  return {
    tone: source.status === 'ok' && diffMs > staleAfterMs ? 'warn' : source.status,
    label: `${sourceDate.toISOString().slice(0, 10)} · ${ageLabel}`
  };
}

function getSourceStatusMeta(source) {
  const freshness = getSourceFreshness(source);

  if (source.status === 'ok') {
    if (freshness.tone === 'warn') {
      return {
        badgeClass: 'warn',
        badgeLabel: 'stale',
        summaryBucket: 'degraded',
        summaryLabel: l('延迟', 'Stale')
      };
    }

    return {
      badgeClass: 'ok',
      badgeLabel: 'healthy',
      summaryBucket: 'healthy',
      summaryLabel: l('健康', 'Healthy')
    };
  }

  if (source.status === 'reference') {
    return {
      badgeClass: 'reference',
      badgeLabel: 'reference',
      summaryBucket: 'reference',
      summaryLabel: l('参考', 'Reference')
    };
  }

  return {
    badgeClass: 'error',
    badgeLabel: 'degraded',
    summaryBucket: 'degraded',
    summaryLabel: l('降级', 'Degraded')
  };
}

function summarizeSources() {
  const sources = Object.values(state.marketData?.sources ?? {});
  return sources.reduce(
    (summary, source) => {
      const meta = getSourceStatusMeta(source);
      summary.total += 1;
      summary[meta.summaryBucket] += 1;
      return summary;
    },
    { total: 0, healthy: 0, degraded: 0, reference: 0 }
  );
}

function countRouteOverrides() {
  return state.routes.reduce((count, route) => {
    if (route.category !== 'saf') {
      return count;
    }

    const shippedRoute = state.shippedRoutes.find((item) => item.id === route.id);
    if (!shippedRoute) {
      return count;
    }

    const fields = ['baseCostUsdPerLiter', 'co2SavingsKgPerLiter'];
    return (
      count +
      fields.filter(
        (field) => toFiniteNumber(route[field], 0) !== toFiniteNumber(shippedRoute[field], 0)
      ).length
    );
  }, 0);
}

function countSettingOverrides() {
  const comparisons = [
    ['crudeSource', state.crudeSource, state.shippedDefaults.crudeSource],
    ['carbonSource', state.carbonSource, state.shippedDefaults.carbonSource],
    ['benchmarkMode', state.benchmarkMode, state.shippedDefaults.benchmarkMode],
    ['crudeUsdPerBarrel', state.crudeUsdPerBarrel, state.shippedDefaults.crudeUsdPerBarrel],
    [
      'carbonPriceUsdPerTonne',
      state.carbonPriceUsdPerTonne,
      state.shippedDefaults.carbonPriceUsdPerTonne
    ],
    ['subsidyUsdPerLiter', state.subsidyUsdPerLiter, state.shippedDefaults.subsidyUsdPerLiter],
    ['jetProxySlope', state.jetProxySlope, state.shippedDefaults.jetProxySlope],
    ['jetProxyIntercept', state.jetProxyIntercept, state.shippedDefaults.jetProxyIntercept],
    ['autoRefreshEnabled', state.autoRefreshEnabled, state.shippedDefaults.autoRefreshEnabled]
  ];

  return comparisons.filter(([, current, shipped]) => current !== shipped).length;
}

function isSourceLocked(sourceKey) {
  return sourceKey !== 'manual' && state.marketData?.sources?.[sourceKey]?.status === 'ok';
}

function renderStatus(message, tone = 'neutral') {
  if (!els.runtimeStatus) {
    return;
  }

  const summary = summarizeSources();
  const refreshText = state.autoRefreshEnabled
    ? LOCALE === 'en'
      ? `Auto refresh: on / ${Math.round(state.autoRefreshMs / 60000)} min`
      : `自动刷新：开 / ${Math.round(state.autoRefreshMs / 60000)} 分钟`
    : l('自动刷新：关', 'Auto refresh: off');
  const persistenceText = state.persistedAt
    ? l(`本地已保存：${formatRelativeTime(state.persistedAt)}`, `Saved locally: ${formatRelativeTime(state.persistedAt)}`)
    : l('本地保存：当前为出厂默认', 'Local state: currently using shipped defaults');
  const benchmarkFallback =
    state.benchmarkMode === 'live-jet-spot' && getLiveJetSpot() == null
      ? l('live jet spot 不可用，比较基准已显式回退到 crude proxy。', 'Live jet spot unavailable; benchmark explicitly falls back to the crude proxy.')
      : l('当前比较基准可用。', 'Current benchmark is available.');
  const pillLabel =
    tone === 'error' ? l('源异常', 'Source error') : tone === 'warn' ? l('部分降级', 'Degraded') : tone === 'ok' ? l('实时数据', 'Live data') : l('加载中', 'Loading');

  els.runtimeStatus.innerHTML = `
    <div class="status-pill ${tone}">${pillLabel}</div>
    <p>${message}</p>
    <div class="status-meta-grid">
      <span>${refreshText}</span>
      <span>${persistenceText}</span>
      <span>${l('来源健康', 'Source health')}: ${summary.healthy} healthy / ${summary.degraded} degraded / ${summary.reference} reference</span>
      <span>${benchmarkFallback}</span>
    </div>
  `;
}

function renderCrudeOptions() {
  if (!els.crudeSource) {
    return;
  }

  const sources = state.marketData?.sources ?? {};
  const selectedSource = sources[state.crudeSource];
  const options = [
    { value: 'manual', label: l('手动输入', 'Manual input') },
    sources.brentEia?.status === 'ok'
      ? { value: 'brentEia', label: `EIA Brent (${sources.brentEia.value} $/bbl)` }
      : null,
    sources.brentFred?.status === 'ok'
      ? { value: 'brentFred', label: `FRED Brent (${sources.brentFred.value} $/bbl)` }
      : null,
    state.crudeSource !== 'manual' && selectedSource && selectedSource.status !== 'ok'
      ? {
          value: state.crudeSource,
          label: `${selectedSource.label}（${getSourceStatusMeta(selectedSource).badgeLabel}）`
        }
      : null
  ].filter(Boolean);

  els.crudeSource.innerHTML = options
    .map(
      (option) =>
        `<option value="${option.value}" ${option.value === state.crudeSource ? 'selected' : ''}>${option.label}</option>`
    )
    .join('');
}

function renderCarbonOptions() {
  if (!els.carbonSource) {
    return;
  }

  const sources = state.marketData?.sources ?? {};
  const selectedSource = sources[state.carbonSource];
  const options = [
    { value: 'manual', label: l('手动输入', 'Manual input') },
    sources.cbamCarbonProxyUsd?.status === 'ok'
      ? {
          value: 'cbamCarbonProxyUsd',
          label: `CBAM proxy (${sources.cbamCarbonProxyUsd.value} $/tCO₂)`
        }
      : null,
    state.carbonSource !== 'manual' && selectedSource && selectedSource.status !== 'ok'
      ? {
          value: state.carbonSource,
          label: `${selectedSource.label}（${getSourceStatusMeta(selectedSource).badgeLabel}）`
        }
      : null
  ].filter(Boolean);

  els.carbonSource.innerHTML = options
    .map(
      (option) =>
        `<option value="${option.value}" ${option.value === state.carbonSource ? 'selected' : ''}>${option.label}</option>`
    )
    .join('');
}

function syncInputs() {
  if (els.crudeInput) {
    els.crudeInput.value = state.crudeUsdPerBarrel;
    els.crudeInput.disabled = isSourceLocked(state.crudeSource);
  }
  if (els.crudeSlider) {
    els.crudeSlider.value = state.crudeUsdPerBarrel;
    els.crudeSlider.disabled = isSourceLocked(state.crudeSource);
  }
  if (els.carbonInput) {
    els.carbonInput.value = state.carbonPriceUsdPerTonne;
    els.carbonInput.disabled = isSourceLocked(state.carbonSource);
  }
  if (els.carbonSlider) {
    els.carbonSlider.value = state.carbonPriceUsdPerTonne;
    els.carbonSlider.disabled = isSourceLocked(state.carbonSource);
  }
  if (els.subsidyInput) {
    els.subsidyInput.value = state.subsidyUsdPerLiter;
  }
  if (els.subsidySlider) {
    els.subsidySlider.value = state.subsidyUsdPerLiter;
  }
  if (els.benchmarkMode) {
    els.benchmarkMode.value = state.benchmarkMode;
  }
  if (els.slopeInput) {
    els.slopeInput.value = state.jetProxySlope;
  }
  if (els.interceptInput) {
    els.interceptInput.value = state.jetProxyIntercept;
  }
  if (els.autoRefresh) {
    els.autoRefresh.checked = state.autoRefreshEnabled;
  }
}

function renderLocalStateCard() {
  renderLocalPersistenceBundle();
}

function renderScenarios() {
  renderLocalPersistenceBundle();
}

function renderSourceLockCard() {
  renderLocalPersistenceBundle();
}

function renderLocalPersistenceBundle() {
  renderLocalPersistenceSection({
    localStateTarget: els.localState,
    sourceLockTarget: els.sourceLockCard,
    scenarioTargets: {
      scenarioName: els.scenarioName,
      activeScenarioName: els.activeScenarioName,
      scenarioList: els.scenarioList,
      scenarioSummary: els.scenarioSummary
    },
    scenarioState: state,
    helpers: {
      countRouteOverrides,
      countSettingOverrides,
      countScenarioDifferences,
      formatDateTime,
      formatRelativeTime,
      getBenchmarkLabel,
      getCarbonSourceLabel,
      getCrudeSourceLabel,
      getLiveJetSpot,
      getSelectedScenario,
      isSourceLocked,
      t: l
    }
  });
}

function renderHomeSnapshot() {
  const summary = getHomepageSummary();
  summary.topRoutes = getBreakevenListRows().slice(0, 3);
  const transitionSignal = state.marketData
    ? getIndustryDashboardViewModel(state, state.marketData).signal
    : null;

  renderHomeSnapshotSection({
    locale: LOCALE,
    heroTarget: els.homeHeroStat,
    signalGridTarget: els.homeSignalGrid,
    topRoutesTarget: els.homeTopRoutes,
    summary,
    transitionSignal,
    getRouteDisplayName,
    formatBreakEvenCrude,
    formatCurrency,
    t: l
  });
}

function renderCurrentCostCompare() {
  renderCurrentCostCompareSection({
    target: els.currentCostCompare,
    generatedAt: state.marketData?.generatedAt,
    getCurrentCostCompareRows,
    pickCheapestRoute,
    summarizeSources,
    getRouteDisplayName,
    getRouteRangeLabel,
    formatCurrency,
    formatDateTime,
    formatNumber,
    t: l
  });
}

function renderBreakevenCalculator() {
  const summary = getHomepageSummary();
  const jetRoute = getJetBaselineRoute();
  const cheapest = summary.cheapest;
  renderBreakevenCalculatorSection({
    formulaTarget: els.breakevenFormula,
    metricsTarget: els.breakevenCoreMetrics,
    summary,
    jetRoute,
    cheapest,
    state,
    getRouteDisplayName,
    formatCurrency,
    formatCostMultiple,
    formatNumber,
    t: l
  });
}

function renderBreakevenRouteList() {
  renderBreakevenRouteListSection({
    target: els.breakevenRouteList,
    pageType: PAGE_TYPE,
    getBreakevenListRows,
    getRouteDisplayName,
    formatBreakEvenCrude,
    formatCostMultiple,
    formatCurrency,
    t: l
  });
}

function clampProgressPct(value) {
  return clamp(toFiniteNumber(value, 0), 0, 100);
}

function reconcileKeyedChildren(container, items, getKey, createNode, updateNode) {
  if (!container) {
    return;
  }

  const existing = new Map(
    Array.from(container.children).map((child) => [child.dataset.key, child])
  );
  const nextKeys = new Set();

  items.forEach((item, index) => {
    const key = `${getKey(item, index)}`;
    let node = existing.get(key);

    if (!node) {
      node = createNode(item, key);
      node.dataset.key = key;
    }

    updateNode(node, item, index);
    nextKeys.add(key);

    if (container.children[index] !== node) {
      container.insertBefore(node, container.children[index] ?? null);
    }
  });

  existing.forEach((node, key) => {
    if (!nextKeys.has(key)) {
      node.remove();
    }
  });
}

function renderIndustryDashboard() {
  renderIndustryDashboardSection({
    locale: LOCALE,
    targets: {
      signalCards: els.industrySignalCards,
      countries: els.industryCountries,
      airlines: els.industryAirlines,
      pathways: els.industryPathways,
      timeline: els.industryTimeline
    },
    viewModel: getIndustryDashboardViewModel(state, state.marketData),
    clampProgressPct,
    formatCurrency,
    formatNumber,
    reconcileKeyedChildren,
    t: l
  });
}

function renderLegacyRoutesTable() {
  renderRoutesTableSection({
    routesBody: els.routesBody,
    state,
    computeRoute,
    formatBreakEvenCrude,
    formatCurrency,
    getBenchmarkLabel,
    getRouteDisplayName,
    getRouteRangeLabel,
    onEdit: (target) => {
      const route = state.routes.find((item) => item.id === target.dataset.routeId);
      route[target.dataset.field] = toFiniteNumber(target.value, route[target.dataset.field]);
      persistAndRender();
    },
    t: l,
    toFiniteNumber
  });
}

function renderSources() {
  renderSourcesPage({
    locale: LOCALE,
    state,
    targets: {
      sourceSummary: els.sourceSummary,
      sourceComparison: els.sourceComparison,
      sourceGrid: els.sourceGrid
    },
    computeJetProxy,
    formatCurrency,
    formatDateTime,
    formatNumber,
    getCarbonSourceLabel,
    getCrudeSourceLabel,
    getFreshness: getSourceFreshness,
    getLocalizedSourceLabel,
    getLocalizedSourceNote,
    getStatusMeta: getSourceStatusMeta,
    isSourceLocked,
    summarizeSources,
    t: l
  });
}

function renderTimeline() {
  renderTimelineSection({
    target: els.timeline,
    targets: state.marketData?.baselines?.refuelEuTargets ?? []
  });
}

function updateRealtimeDisplays() {
  renderRealtimeExplorerSection({
    state,
    matrixTarget: document.querySelector('#realtime-cost-matrix'),
    getCurrentCostCompareRows,
    getBenchmarkPrice,
    t: l,
  });
}

function syncActionButtons() {
  const marketReady = Boolean(state.marketData);
  const busy = state.serverPersistenceBusy;
  const hasScenarioSelection = Boolean(state.selectedScenarioId);
  const hasScenarioName = Boolean(state.scenarioDraftName.trim());

  if (els.saveServerBtn) {
    els.saveServerBtn.disabled = !marketReady || busy;
    els.saveServerBtn.textContent = busy ? l('保存中…', 'Saving…') : l('保存到服务器', 'Save to server');
  }

  if (els.clearServerBtn) {
    els.clearServerBtn.disabled = !marketReady || busy || !state.serverPersistence?.exists;
  }

  if (els.resetBtn) {
    els.resetBtn.disabled = !marketReady || busy;
  }

  if (els.saveScenarioBtn) {
    els.saveScenarioBtn.disabled = !marketReady || !hasScenarioName;
  }

  if (els.loadScenarioBtn) {
    els.loadScenarioBtn.disabled = !marketReady || !hasScenarioSelection;
  }

  if (els.deleteScenarioBtn) {
    els.deleteScenarioBtn.disabled = !hasScenarioSelection;
  }
}

function renderAll() {
  renderCrudeOptions();
  renderCarbonOptions();
  syncInputs();
  renderScenarios();
  renderLocalStateCard();
  renderSourceLockCard();
  renderHomeSnapshot();
  renderCurrentCostCompare();
  renderBreakevenCalculator();
  renderBreakevenRouteList();
  renderLegacyRoutesTable();
  renderSources();
  renderTimeline();
  syncActionButtons();
  updateRealtimeDisplays();
  syncShareableUrlState();
  renderIndustryDashboard();
}

function persistAndRender() {
  scheduleLocalPersistence();
  requestRender(
    l(
      '已更新本地参数；刷新公开数据不会覆盖这些本地编辑。',
      'Local parameters updated; refreshing public data will not overwrite these edits.'
    ),
    'ok'
  );
}

function applyUrlStateSnapshot(snapshot = {}) {
  if (snapshot.crudeSource) {
    state.crudeSource = snapshot.crudeSource;
  }
  if (snapshot.carbonSource) {
    state.carbonSource = snapshot.carbonSource;
  }
  if (snapshot.benchmarkMode) {
    state.benchmarkMode = snapshot.benchmarkMode;
  }
  if (typeof snapshot.crude === 'number') {
    state.crudeSource = 'manual';
    state.crudeUsdPerBarrel = snapshot.crude;
  }
  if (typeof snapshot.carbon === 'number') {
    state.carbonSource = 'manual';
    state.carbonPriceUsdPerTonne = snapshot.carbon;
  }
  if (typeof snapshot.subsidy === 'number') {
    state.subsidyUsdPerLiter = snapshot.subsidy;
  }
  if (snapshot.scenario) {
    state.selectedScenarioId = snapshot.scenario;
  }
}

function syncShareableUrlState() {
  if (!['explorer', 'routes', 'industry', 'scenarios'].includes(PAGE_TYPE)) {
    return;
  }

  writeUrlState({
    crude: state.crudeUsdPerBarrel,
    carbon: state.carbonPriceUsdPerTonne,
    subsidy: state.subsidyUsdPerLiter,
    benchmarkMode: state.benchmarkMode,
    crudeSource: state.crudeSource,
    carbonSource: state.carbonSource,
    scenario: state.selectedScenarioId || null
  });
}

function applyCrudeSourceSelection() {
  const source = state.marketData?.sources?.[state.crudeSource];
  if (source?.status === 'ok') {
    state.crudeUsdPerBarrel = source.value;
  }
}

function applyCarbonSourceSelection() {
  const source = state.marketData?.sources?.[state.carbonSource];
  if (source?.status === 'ok') {
    state.carbonPriceUsdPerTonne = source.value;
  }
}

function mergeEditableRoutes(nextRoutes, { preserveCurrent = true } = {}) {
  const currentById = new Map(
    (preserveCurrent ? state.routes : []).map((route) => [
      route.id,
      {
        baseCostUsdPerLiter: route.baseCostUsdPerLiter,
        co2SavingsKgPerLiter: route.co2SavingsKgPerLiter
      }
    ])
  );

  return nextRoutes.map((route) => ({
    ...route,
    ...(state.persistedRouteEdits[route.id] ?? {}),
    ...(currentById.get(route.id) ?? {})
  }));
}

function applyMarketDataPayload(payload, { preserveCurrentRouteEdits = true } = {}) {
  state.marketData = payload;
  syncServerPersistenceFromMarketData(payload.persistence);
  state.shippedDefaults = normalizeDefaults(payload.shippedDefaults ?? payload.defaults);
  state.shippedRoutes = deepClone(payload.baselines.shippedRoutes ?? payload.baselines.routes);
  state.routes = mergeEditableRoutes(payload.baselines.routes, {
    preserveCurrent: preserveCurrentRouteEdits
  });
  state.autoRefreshMs = payload.defaults.autoRefreshMs ?? state.autoRefreshMs;
  state.marketData.baselines.routes = state.routes;

  if (!state.hasHydrated) {
    applySettings({
      ...state.shippedDefaults,
      autoRefreshEnabled: state.autoRefreshEnabled
    });
    state.hasHydrated = true;
  }

  applyCrudeSourceSelection();
  applyCarbonSourceSelection();

  if (state.crudeSource === 'manual') {
    state.crudeUsdPerBarrel = state.crudeUsdPerBarrel || payload.defaults.crudeUsdPerBarrel;
  }
  if (state.carbonSource === 'manual') {
    state.carbonPriceUsdPerTonne =
      state.carbonPriceUsdPerTonne || payload.defaults.carbonPriceUsdPerTonne;
  }

  resetAutoRefreshTimer();

  const summary = summarizeSources();
  const tone = summary.degraded > 0 ? 'warn' : 'ok';
  renderStatus(`${l('最近刷新', 'Last refreshed')}: ${formatDateTime(payload.generatedAt)}`, tone);
  renderAll();
  persistLocalState();
}

function resetAutoRefreshTimer() {
  if (state.autoRefreshTimer) {
    clearInterval(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
  }

  if (!state.autoRefreshEnabled) {
    return;
  }

  state.autoRefreshTimer = window.setInterval(async () => {
    try {
      await loadMarketData({ force: true });
      renderStatus(`${l('最近刷新', 'Last refreshed')}: ${new Date().toLocaleString(LOCALE === 'en' ? 'en-US' : 'zh-CN')}`, 'ok');
    } catch (error) {
      renderStatus(error.message, 'error');
    }
  }, state.autoRefreshMs);
}

async function loadMarketData({ force = false } = {}) {
  renderStatus(
    force
      ? l('正在强制刷新 Brent、jet fuel 与政策参考源…', 'Force-refreshing Brent, jet fuel, and policy reference sources…')
      : l('正在抓取 Brent、jet fuel 与政策参考源…', 'Fetching Brent, jet fuel, and policy reference sources…')
  );
  const endpoint = force ? '/api/market-data?refresh=1' : '/api/market-data';
  const response = await fetch(endpoint);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to load market data');
  }
  applyMarketDataPayload(payload);
}

async function resetToShippedDefaults() {
  state.serverPersistenceBusy = true;
  state.serverPersistenceError = null;
  renderAll();

  try {
    const response = await fetch('/api/reset-defaults', { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to reset defaults');
    }

    clearLocalState();
    state.hasHydrated = false;
    state.routes = [];
    syncServerPersistenceFromResponse(payload.localPreferences);
    applyMarketDataPayload(payload.marketData, { preserveCurrentRouteEdits: false });
    renderStatus(
      l(
        '已清空服务器保存并恢复到随应用发货的默认参数。',
        'Server-side save cleared and shipped defaults restored.'
      ),
      'neutral'
    );
  } catch (error) {
    state.serverPersistenceError = error.message;
    renderStatus(error.message, 'error');
  } finally {
    state.serverPersistenceBusy = false;
    renderAll();
  }
}

async function saveServerPreferences() {
  state.serverPersistenceBusy = true;
  state.serverPersistenceError = null;
  renderAll();

  try {
    const response = await fetch('/api/local-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preferences: getPersistablePreferences(),
        routeEdits: getRouteEditSnapshot()
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to save server preferences');
    }

    syncServerPersistenceFromResponse(payload.localPreferences);
    renderStatus(
      l(
        '已将可持久化的偏好与路线覆盖写入服务器本地文件。',
        'Persistable preferences and route overrides were written to the server-local file.'
      ),
      'ok'
    );
  } catch (error) {
    state.serverPersistenceError = error.message;
    renderStatus(error.message, 'error');
  } finally {
    state.serverPersistenceBusy = false;
    renderAll();
  }
}

async function clearServerPreferences() {
  state.serverPersistenceBusy = true;
  state.serverPersistenceError = null;
  renderAll();

  try {
    const response = await fetch('/api/local-preferences', { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to clear server preferences');
    }

    syncServerPersistenceFromResponse(payload.localPreferences);
    renderStatus(
      l(
        '已清空服务器本地文件；当前浏览器场景仍保留，除非你点击恢复默认。',
        'Server-local file cleared; the current browser scenario remains until you restore defaults.'
      ),
      'neutral'
    );
  } catch (error) {
    state.serverPersistenceError = error.message;
    renderStatus(error.message, 'error');
  } finally {
    state.serverPersistenceBusy = false;
    renderAll();
  }
}

els.refreshBtn?.addEventListener('click', async () => {
  try {
    await loadMarketData({ force: true });
  } catch (error) {
    renderStatus(error.message, 'error');
  }
});

els.saveServerBtn?.addEventListener('click', async () => {
  if (!state.marketData) {
    return;
  }

  await saveServerPreferences();
});

els.scenarioName?.addEventListener('input', (event) => {
  state.scenarioDraftName = event.currentTarget.value;
  syncActionButtons();
});

els.scenarioList?.addEventListener('change', (event) => {
  state.selectedScenarioId = event.currentTarget.value;
  const scenario = getSelectedScenario();
  if (scenario) {
    state.scenarioDraftName = scenario.name;
  }
  renderAll();
});

els.saveScenarioBtn?.addEventListener('click', () => {
  if (!state.marketData) {
    return;
  }

  saveScenario();
});

els.loadScenarioBtn?.addEventListener('click', () => {
  if (!state.marketData) {
    return;
  }

  const scenario = getSelectedScenario();
  if (!scenario) {
    renderStatus(l('请先选择要加载的 scenario。', 'Please select a scenario to load first.'), 'warn');
    return;
  }

  applyScenario(scenario);
  renderStatus(`${l('已加载 scenario', 'Loaded scenario')}: ${scenario.name}`, 'ok');
});

els.deleteScenarioBtn?.addEventListener('click', () => {
  deleteSelectedScenario();
});

els.clearServerBtn?.addEventListener('click', async () => {
  if (!state.marketData) {
    return;
  }

  await clearServerPreferences();
});

els.resetBtn?.addEventListener('click', async () => {
  if (!state.marketData) {
    return;
  }

  await resetToShippedDefaults();
});

els.crudeSource?.addEventListener('change', (event) => {
  state.crudeSource = event.currentTarget.value;
  applyCrudeSourceSelection();
  persistAndRender();
});

els.crudeInput?.addEventListener('input', (event) => {
  state.crudeSource = 'manual';
  state.crudeUsdPerBarrel = toFiniteNumber(event.currentTarget.value, state.crudeUsdPerBarrel);
  persistAndRender();
});

els.crudeSlider?.addEventListener('input', (event) => {
  state.crudeSource = 'manual';
  state.crudeUsdPerBarrel = toFiniteNumber(event.currentTarget.value, state.crudeUsdPerBarrel);
  persistAndRender();
});

els.carbonSource?.addEventListener('change', (event) => {
  state.carbonSource = event.currentTarget.value;
  applyCarbonSourceSelection();
  persistAndRender();
});

els.carbonInput?.addEventListener('input', (event) => {
  state.carbonSource = 'manual';
  state.carbonPriceUsdPerTonne = toFiniteNumber(
    event.currentTarget.value,
    state.carbonPriceUsdPerTonne
  );
  persistAndRender();
});

els.carbonSlider?.addEventListener('input', (event) => {
  state.carbonSource = 'manual';
  state.carbonPriceUsdPerTonne = toFiniteNumber(
    event.currentTarget.value,
    state.carbonPriceUsdPerTonne
  );
  persistAndRender();
});

els.subsidyInput?.addEventListener('input', (event) => {
  state.subsidyUsdPerLiter = toFiniteNumber(event.currentTarget.value, state.subsidyUsdPerLiter);
  persistAndRender();
});

els.subsidySlider?.addEventListener('input', (event) => {
  state.subsidyUsdPerLiter = toFiniteNumber(event.currentTarget.value, state.subsidyUsdPerLiter);
  persistAndRender();
});

// Real-time explorer sliders (new)
const crudeSlider = document.querySelector('#crude-slider');
if (crudeSlider) {
  crudeSlider.addEventListener('input', (event) => {
    state.crudeSource = 'manual';
    state.crudeUsdPerBarrel = toFiniteNumber(event.currentTarget.value, state.crudeUsdPerBarrel);
    persistAndRender();
  });
}

const carbonSliderExplorer = document.querySelector('#carbon-slider');
if (carbonSliderExplorer) {
  carbonSliderExplorer.addEventListener('input', (event) => {
    state.carbonSource = 'manual';
    state.carbonPriceUsdPerTonne = toFiniteNumber(
      event.currentTarget.value,
      state.carbonPriceUsdPerTonne
    );
    persistAndRender();
  });
}

const subsidySliderExplorer = document.querySelector('#subsidy-slider');
if (subsidySliderExplorer) {
  subsidySliderExplorer.addEventListener('input', (event) => {
    state.subsidyUsdPerLiter = toFiniteNumber(event.currentTarget.value, state.subsidyUsdPerLiter);
    persistAndRender();
  });
}

// Quick scenario buttons
document.querySelectorAll('.quick-scenario-btn').forEach((btn) => {
  btn.addEventListener('click', (event) => {
    const scenarioDataAttr = event.currentTarget.dataset.scenario;
    if (!scenarioDataAttr) return;
    
    // Map HTML data-scenario attributes to parameters
    const scenarios = {
      'baseline-2026': { crude: 80, carbon: 90, subsidy: 0.50 },
      'eu-ambition-2030': { crude: 80, carbon: 150, subsidy: 0.75 },
      'ira-extended-us': { crude: 70, carbon: 85, subsidy: 0.65 },
      'geopolitical-shock': { crude: 120, carbon: 105, subsidy: 0.35 },
      'energy-crisis': { crude: 130, carbon: 180, subsidy: 1.0 },
      'demand-collapse': { crude: 50, carbon: 60, subsidy: 0.1 }
    };
    
    const scenario = scenarios[scenarioDataAttr];
    if (!scenario) return;
    
    state.crudeSource = 'manual';
    state.carbonSource = 'manual';
    state.crudeUsdPerBarrel = scenario.crude;
    state.carbonPriceUsdPerTonne = scenario.carbon;
    state.subsidyUsdPerLiter = scenario.subsidy;
    
    // Update slider positions
    if (crudeSlider) crudeSlider.value = scenario.crude;
    if (carbonSliderExplorer) carbonSliderExplorer.value = scenario.carbon;
    if (subsidySliderExplorer) subsidySliderExplorer.value = scenario.subsidy;
    
    persistAndRender();
  });
});

els.benchmarkMode?.addEventListener('change', (event) => {
  state.benchmarkMode = event.currentTarget.value;
  persistAndRender();
});

els.slopeInput?.addEventListener('input', (event) => {
  state.jetProxySlope = toFiniteNumber(event.currentTarget.value, state.jetProxySlope);
  persistAndRender();
});

els.interceptInput?.addEventListener('input', (event) => {
  state.jetProxyIntercept = toFiniteNumber(event.currentTarget.value, state.jetProxyIntercept);
  persistAndRender();
});

els.autoRefresh?.addEventListener('change', (event) => {
  state.autoRefreshEnabled = event.currentTarget.checked;
  resetAutoRefreshTimer();
  persistAndRender();
});

els.themeToggle?.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  requestRender();
});

applyTheme(getPreferredTheme());
hydrateLocalState();
hydrateScenarioStore();
applyUrlStateSnapshot(parseUrlState(window.location.search));
loadMarketData().catch((error) => {
  renderStatus(error.message, 'error');
});
