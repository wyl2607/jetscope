const NUMBER_KEYS = ['crude', 'carbon', 'subsidy'];
const STRING_KEYS = ['benchmarkMode', 'crudeSource', 'carbonSource', 'scenario'];

export function parseUrlState(search = window.location.search) {
  const params = new URLSearchParams(search);
  const state = {};

  for (const key of NUMBER_KEYS) {
    const value = params.get(key);
    if (value == null || value === '') {
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      state[key] = numeric;
    }
  }

  for (const key of STRING_KEYS) {
    const value = params.get(key);
    if (value != null && value !== '') {
      state[key] = value;
    }
  }

  return state;
}

export function writeUrlState(nextState, { replace = true } = {}) {
  const url = new URL(window.location.href);

  for (const key of [...NUMBER_KEYS, ...STRING_KEYS]) {
    const value = nextState?.[key];
    if (value == null || value === '') {
      url.searchParams.delete(key);
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (replace) {
    window.history.replaceState({}, '', nextUrl);
  } else {
    window.history.pushState({}, '', nextUrl);
  }
}
