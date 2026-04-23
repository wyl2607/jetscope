import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

import {
  DATA_SOURCES,
  POLICY_DEFAULTS,
  REFUEL_EU_TARGETS,
  SAF_ROUTES
} from './data/baselines.mjs';
import {
  applyLocalPreferencesToMarketData,
  buildLocalPreferencesResponse,
  loadLocalPreferences,
  resetLocalPreferences,
  saveLocalPreferences
} from './server/local-persistence.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const CACHE_TTL_MS = 10 * 60 * 1000;
let marketCache = { expiresAt: 0, payload: null };
let localPreferencesCache = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const PAGE_ROUTE_MAP = {
  '/': '/index.html',
  '/explorer': '/explorer.html',
  '/routes': '/routes.html',
  '/industry': '/industry.html',
  '/scenarios': '/scenarios.html',
  '/sources': '/sources.html',
  '/methodology': '/methodology.html',
  '/en': '/en/index.html',
  '/en/explorer': '/en/explorer.html',
  '/en/routes': '/en/routes.html',
  '/en/industry': '/en/industry.html',
  '/en/scenarios': '/en/scenarios.html',
  '/en/sources': '/en/sources.html',
  '/en/methodology': '/en/methodology.html'
};

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: 'Not found' });
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw new Error('Request body too large');
    }
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function getLocalPreferencesState() {
  if (!localPreferencesCache) {
    localPreferencesCache = await loadLocalPreferences(__dirname);
  }

  return localPreferencesCache;
}

function summarizeSourceStatuses(sources) {
  const entries = Object.entries(sources);
  const counts = entries.reduce(
    (accumulator, [, source]) => {
      const status = source?.status ?? 'unknown';
      accumulator[status] = (accumulator[status] ?? 0) + 1;
      return accumulator;
    },
    {}
  );
  const failures = entries
    .filter(([, source]) => source?.status === 'error')
    .map(([key, source]) => ({
      key,
      label: source.label,
      error: source.error
    }));
  const okCount = counts.ok ?? 0;
  const errorCount = counts.error ?? 0;

  return {
    overall:
      errorCount === 0 ? 'ok' : okCount > 0 || (counts.reference ?? 0) > 0 ? 'degraded' : 'error',
    counts,
    failedSources: failures
  };
}

function toUsdPerLiterFromUsdPerGallon(value) {
  return value / 3.78541;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SAFvsOil/0.1 (+local random-port tool)'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseFredCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const rows = lines
    .slice(1)
    .map((line) => line.split(','))
    .filter((parts) => parts.length >= 2 && parts[1] && parts[1] !== '.')
    .map(([date, value]) => ({ date, value: Number(value) }))
    .filter((row) => Number.isFinite(row.value));

  if (!rows.length) {
    throw new Error('No usable rows');
  }

  return rows.at(-1);
}

function parseEiaDailyPricesPage(html) {
  const normalized = html.replace(/\s+/g, ' ');
  const dateMatch = normalized.match(/Wholesale Spot Petroleum Prices,\s*([0-9/]+)\s*Close/i);
  const brentMatch = normalized.match(/<td class="s2">Brent<\/td>\s*<td class="d1">([0-9.]+)/i);

  return {
    asOf: dateMatch?.[1] ?? null,
    brentUsdPerBarrel: brentMatch ? Number(brentMatch[1]) : null
  };
}

function parseCbamCertificatePage(html) {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const match = text.match(/Q([1-4])\s+(\d{4})\s+([0-9]{1,2}\s+\w+\s+\d{4})\s+([0-9]+(?:[.,][0-9]+)?)/i);
  if (!match) {
    throw new Error('CBAM certificate price not found');
  }

  const [, quarter, year, publishedAt, priceText] = match;
  return {
    asOf: `Q${quarter} ${year}`,
    publishedAt,
    eurPerTonne: Number(priceText.replace(',', '.'))
  };
}

function parseEcbUsdRate(xml) {
  const dateMatch = xml.match(/<Cube\s+time=['"]([^'"]+)['"]/i);
  const usdMatch = xml.match(/<Cube\s+currency=['"]USD['"]\s+rate=['"]([^'"]+)['"]\/?>/i);
  if (!dateMatch || !usdMatch) {
    throw new Error('ECB USD rate not found');
  }

  return {
    asOf: dateMatch[1],
    usdPerEur: Number(usdMatch[1])
  };
}

async function loadMarketData({ force = false } = {}) {
  const now = Date.now();
  if (!force && marketCache.payload && marketCache.expiresAt > now) {
    return marketCache.payload;
  }

  const results = {
    generatedAt: new Date().toISOString(),
    sources: {},
    defaults: {
      carbonPriceUsdPerTonne: POLICY_DEFAULTS.carbonPriceUsdPerTonne,
      subsidyUsdPerLiter: POLICY_DEFAULTS.subsidyUsdPerLiter,
      jetProxySlope: POLICY_DEFAULTS.jetProxySlope,
      jetProxyIntercept: POLICY_DEFAULTS.jetProxyIntercept,
      crudeSource: 'manual',
      carbonSource: 'manual',
      benchmarkMode: 'crude-proxy',
      autoRefreshMs: CACHE_TTL_MS
    },
    baselines: {
      routes: SAF_ROUTES,
      refuelEuTargets: REFUEL_EU_TARGETS
    }
  };

  const tasks = [
    {
      key: 'brentFred',
      run: async () => {
        const csv = await fetchText(DATA_SOURCES.brentFred.url);
        const latest = parseFredCsv(csv);
        return {
          status: 'ok',
          label: DATA_SOURCES.brentFred.label,
          url: DATA_SOURCES.brentFred.url,
          cadence: DATA_SOURCES.brentFred.cadence,
          asOf: latest.date,
          unit: 'USD/bbl',
          value: round(latest.value, 2)
        };
      }
    },
    {
      key: 'jetFred',
      run: async () => {
        const csv = await fetchText(DATA_SOURCES.jetFred.url);
        const latest = parseFredCsv(csv);
        return {
          status: 'ok',
          label: DATA_SOURCES.jetFred.label,
          url: DATA_SOURCES.jetFred.url,
          cadence: DATA_SOURCES.jetFred.cadence,
          asOf: latest.date,
          unit: 'USD/L',
          sourceUnit: 'USD/gal',
          rawValue: round(latest.value, 3),
          value: round(toUsdPerLiterFromUsdPerGallon(latest.value), 3)
        };
      }
    },
    {
      key: 'cbamPriceOfficial',
      run: async () => {
        const html = await fetchText(DATA_SOURCES.cbamPriceOfficial.url);
        const parsed = parseCbamCertificatePage(html);
        return {
          status: 'ok',
          label: DATA_SOURCES.cbamPriceOfficial.label,
          url: DATA_SOURCES.cbamPriceOfficial.url,
          cadence: DATA_SOURCES.cbamPriceOfficial.cadence,
          asOf: parsed.asOf,
          publishedAt: parsed.publishedAt,
          unit: 'EUR/tCO₂',
          value: round(parsed.eurPerTonne, 2)
        };
      }
    },
    {
      key: 'ecbEurUsd',
      run: async () => {
        const xml = await fetchText(DATA_SOURCES.ecbEurUsd.url);
        const parsed = parseEcbUsdRate(xml);
        return {
          status: 'ok',
          label: DATA_SOURCES.ecbEurUsd.label,
          url: DATA_SOURCES.ecbEurUsd.url,
          cadence: DATA_SOURCES.ecbEurUsd.cadence,
          asOf: parsed.asOf,
          unit: 'USD/EUR',
          value: round(parsed.usdPerEur, 4)
        };
      }
    },
    {
      key: 'brentEia',
      run: async () => {
        const html = await fetchText(DATA_SOURCES.brentEia.url);
        const parsed = parseEiaDailyPricesPage(html);
        if (!parsed.brentUsdPerBarrel) {
          throw new Error('Brent price not found in EIA page');
        }
        return {
          status: 'ok',
          label: DATA_SOURCES.brentEia.label,
          url: DATA_SOURCES.brentEia.url,
          cadence: DATA_SOURCES.brentEia.cadence,
          asOf: parsed.asOf,
          unit: 'USD/bbl',
          value: round(parsed.brentUsdPerBarrel, 2)
        };
      }
    }
  ];

  await Promise.all(
    tasks.map(async ({ key, run }) => {
      try {
        results.sources[key] = await run();
      } catch (error) {
        results.sources[key] = {
          status: 'error',
          label: DATA_SOURCES[key].label,
          url: DATA_SOURCES[key].url,
          cadence: DATA_SOURCES[key].cadence,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  if (results.sources.cbamPriceOfficial?.status === 'ok' && results.sources.ecbEurUsd?.status === 'ok') {
    const carbonProxyUsd = round(
      results.sources.cbamPriceOfficial.value * results.sources.ecbEurUsd.value,
      2
    );
    results.sources.cbamCarbonProxyUsd = {
      status: 'ok',
      label: 'CBAM carbon proxy (USD converted)',
      url: DATA_SOURCES.cbamPriceOfficial.url,
      cadence: 'official CBAM + ECB FX',
      asOf: `${results.sources.cbamPriceOfficial.asOf}; FX ${results.sources.ecbEurUsd.asOf}`,
      unit: 'USD/tCO₂',
      rawValueEur: results.sources.cbamPriceOfficial.value,
      fxUsdPerEur: results.sources.ecbEurUsd.value,
      value: carbonProxyUsd
    };
    results.defaults.carbonPriceUsdPerTonne = carbonProxyUsd;
    results.defaults.carbonSource = 'cbamCarbonProxyUsd';
  } else {
    results.sources.cbamCarbonProxyUsd = {
      status: 'reference',
      label: 'CBAM carbon proxy (USD converted)',
      url: DATA_SOURCES.cbamPriceOfficial.url,
      cadence: 'official CBAM + ECB FX',
      note: '若官方 CBAM 价格或 ECB 汇率任一抓取失败，碳价回退为手动输入基线。'
    };
  }

  results.sources.euEtsOfficial = {
    status: 'reference',
    label: DATA_SOURCES.euEtsOfficial.label,
    url: DATA_SOURCES.euEtsOfficial.url,
    cadence: DATA_SOURCES.euEtsOfficial.cadence,
    note: '官方页面解释机制，但未提供免授权、稳定的现货报价 API；当前版本将碳价保留为手动输入。'
  };

  results.sources.refuelEuOfficial = {
    status: 'reference',
    label: DATA_SOURCES.refuelEuOfficial.label,
    url: DATA_SOURCES.refuelEuOfficial.url,
    cadence: DATA_SOURCES.refuelEuOfficial.cadence,
    note: 'ReFuelEU 目标时间表来自欧盟法规/委员会公开资料，按静态基线内置。'
  };

  results.sources.safRouteBaselines = {
    status: 'reference',
    label: 'SAF route cost baselines',
    url: DATA_SOURCES.refuelEuOfficial.url,
    cadence: 'manual research baseline',
    note: '各 SAF 路线成本目前仍使用你给定的 2024–2025 研究基线，可在前端本地改写；暂无稳定、免授权的公开现货 API。'
  };

  const preferredCrude =
    results.sources.brentEia?.status === 'ok'
      ? results.sources.brentEia.value
      : results.sources.brentFred?.status === 'ok'
        ? results.sources.brentFred.value
        : 103;

  results.defaults.crudeUsdPerBarrel = preferredCrude;
  results.defaults.crudeSource =
    results.sources.brentEia?.status === 'ok'
      ? 'brentEia'
      : results.sources.brentFred?.status === 'ok'
        ? 'brentFred'
        : 'manual';
  results.defaults.jetProxyUsdPerLiter = round(
    POLICY_DEFAULTS.jetProxySlope * preferredCrude + POLICY_DEFAULTS.jetProxyIntercept,
    3
  );
  results.defaults.benchmarkMode = results.sources.jetFred?.status === 'ok' ? 'live-jet-spot' : 'crude-proxy';
  results.sourceStatus = summarizeSourceStatuses(results.sources);
  results.meta = {
    refreshMode: force ? 'forced' : 'cached-or-live',
    cacheTtlMs: CACHE_TTL_MS,
    degraded: results.sourceStatus.overall !== 'ok',
    parserVersion: 'wave1-market-v2',
    payloadVersion: 'phase0-ia-split'
  };

  marketCache = {
    expiresAt: now + CACHE_TTL_MS,
    payload: results
  };

  return results;
}

async function serveStatic(res, pathname) {
  const safePath = resolvePublicPath(pathname);
  const filePath = path.resolve(publicDir, `.${safePath}`);

  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
    return notFound(res);
  }

  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Content-Length': content.length
    });
    res.end(content);
  } catch {
    notFound(res);
  }
}

function resolvePublicPath(pathname) {
  const normalized = normalizePathname(pathname);

  if (/^\/routes\/[^/]+$/.test(normalized)) {
    return '/routes-detail.html';
  }

  if (/^\/en\/routes\/[^/]+$/.test(normalized)) {
    return '/en/routes-detail.html';
  }

  return PAGE_ROUTE_MAP[normalized] ?? normalized;
}

function normalizePathname(pathname) {
  if (!pathname) {
    return '/';
  }

  const withoutTrailing = pathname.replace(/\/+$/, '');
  return withoutTrailing || '/';
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    return notFound(res);
  }

  const requestUrl = new URL(req.url, 'http://127.0.0.1');

  if (req.method === 'GET' && requestUrl.pathname === '/api/health') {
    return json(res, 200, { ok: true, now: new Date().toISOString() });
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/market-data') {
    try {
      const force = requestUrl.searchParams.get('refresh') === '1';
      const [marketData, localPreferences] = await Promise.all([
        loadMarketData({ force }),
        getLocalPreferencesState()
      ]);
      const payload = applyLocalPreferencesToMarketData(marketData, localPreferences);
      payload.localPreferences = buildLocalPreferencesResponse(localPreferences);
      return json(res, 200, payload);
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/local-preferences') {
    try {
      const localPreferences = await getLocalPreferencesState();
      return json(res, 200, buildLocalPreferencesResponse(localPreferences));
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === 'PUT' && requestUrl.pathname === '/api/local-preferences') {
    try {
      const body = await readJsonBody(req);
      const saved = await saveLocalPreferences(__dirname, {
        version: 1,
        preferences: body.preferences,
        routeEdits: body.routeEdits
      });
      localPreferencesCache = saved;
      const marketData = await loadMarketData({ force: false });
      const payload = buildLocalPreferencesResponse(saved);
      return json(res, 200, {
        ok: true,
        localPreferences: payload,
        marketData: applyLocalPreferencesToMarketData(marketData, saved)
      });
    } catch (error) {
      return json(res, 400, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === 'DELETE' && requestUrl.pathname === '/api/local-preferences') {
    try {
      const reset = await resetLocalPreferences(__dirname);
      localPreferencesCache = reset;
      const marketData = await loadMarketData({ force: false });
      return json(res, 200, {
        ok: true,
        reset: true,
        localPreferences: buildLocalPreferencesResponse(reset),
        marketData: applyLocalPreferencesToMarketData(marketData, reset)
      });
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/reset-defaults') {
    try {
      const reset = await resetLocalPreferences(__dirname);
      localPreferencesCache = reset;
      const marketData = await loadMarketData({ force: false });
      return json(res, 200, {
        ok: true,
        reset: true,
        localPreferences: buildLocalPreferencesResponse(reset),
        marketData: applyLocalPreferencesToMarketData(marketData, reset)
      });
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return serveStatic(res, requestUrl.pathname);
});

const requestedPort = process.env.PORT ? Number(process.env.PORT) : 0;

server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  if (typeof address === 'object' && address) {
    console.log(`SAFvsOil running at http://127.0.0.1:${address.port}`);
  }
});
