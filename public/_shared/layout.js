import { highlightCurrentNav } from '/_shared/nav-state.js';

const THEME_STORAGE_KEY = 'safvsoil.theme.v1';
const locale = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';

await Promise.all([mountFragment('#site-header', getHeaderPath()), mountFragment('#site-footer', getFooterPath())]);
highlightCurrentNav();
wireLanguageToggle();
wireThemeToggle();
await refreshFooterMeta();

function getHeaderPath() {
  return locale === 'en' ? '/_shared/header.en.html' : '/_shared/header.html';
}

function getFooterPath() {
  return locale === 'en' ? '/_shared/footer.en.html' : '/_shared/footer.html';
}

async function mountFragment(selector, path) {
  const target = document.querySelector(selector);
  if (!target) {
    return;
  }

  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }
    target.innerHTML = await response.text();
  } catch (error) {
    target.innerHTML = `<div class="layout-load-error">${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

function wireLanguageToggle() {
  const button = document.querySelector('#lang-toggle');
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    const { pathname, search } = window.location;
    const targetPath = locale === 'en' ? stripEnglishPrefix(pathname) : addEnglishPrefix(pathname);
    window.location.assign(`${targetPath}${search}`);
  });
}

function addEnglishPrefix(pathname) {
  const normalized = pathname === '/' ? '' : pathname;
  return `/en${normalized}`;
}

function stripEnglishPrefix(pathname) {
  const stripped = pathname.replace(/^\/en(?=\/|$)/, '');
  return stripped || '/';
}

function wireThemeToggle() {
  const button = document.querySelector('#theme-toggle');
  if (!button) {
    return;
  }

  applyTheme(getPreferredTheme(), button);
  button.addEventListener('click', () => {
    applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark', button);
  });
}

function getPreferredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
  } catch {
    // ignore storage read issues
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme, button) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;

  if (button) {
    button.textContent =
      locale === 'en'
        ? nextTheme === 'dark'
          ? 'Switch light'
          : 'Toggle dark'
        : nextTheme === 'dark'
          ? '切换浅色'
          : '切换深色';
    button.setAttribute('aria-pressed', String(nextTheme === 'dark'));
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // ignore storage write issues
  }
}

async function refreshFooterMeta() {
  const refreshNode = document.querySelector('#footer-last-refresh');
  const brentDot = document.querySelector('#footer-dot-brent');
  const jetDot = document.querySelector('#footer-dot-jet');
  const carbonDot = document.querySelector('#footer-dot-carbon');

  if (!refreshNode || !brentDot || !jetDot || !carbonDot) {
    return;
  }

  try {
    const response = await fetch('/api/market-data');
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load market data');
    }

    refreshNode.textContent = formatDate(payload.generatedAt);
    paintDot(brentDot, payload?.sources?.brentEia ?? payload?.sources?.brentFred);
    paintDot(jetDot, payload?.sources?.jetFred);
    paintDot(carbonDot, payload?.sources?.cbamCarbonProxyUsd ?? payload?.sources?.cbamPriceOfficial);
  } catch {
    refreshNode.textContent = locale === 'en' ? 'unavailable' : '不可用';
    [brentDot, jetDot, carbonDot].forEach((dot) => {
      dot.classList.remove('is-ok', 'is-warn');
      dot.classList.add('is-error');
    });
  }
}

function paintDot(node, source) {
  const status = source?.status ?? 'error';
  node.classList.remove('is-ok', 'is-warn', 'is-error');
  if (status === 'ok') {
    node.classList.add('is-ok');
    return;
  }
  if (status === 'reference') {
    node.classList.add('is-warn');
    return;
  }
  node.classList.add('is-error');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return locale === 'en' ? 'unknown' : '未知';
  }
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN');
}
