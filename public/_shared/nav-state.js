export function highlightCurrentNav() {
  const normalizedPath = normalizePath(window.location.pathname);
  const navLinks = Array.from(document.querySelectorAll('[data-nav]'));

  for (const link of navLinks) {
    const href = normalizePath(link.getAttribute('href') ?? '/');
    const isExact = normalizedPath === href;
    const isNested = href !== '/' && href !== '/en' && normalizedPath.startsWith(`${href}/`);
    const active = isExact || isNested;

    link.classList.toggle('is-active', active);
    link.setAttribute('aria-current', active ? 'page' : 'false');
  }
}

function normalizePath(pathname) {
  if (!pathname) {
    return '/';
  }

  const withoutTrailing = pathname.replace(/\/+$/, '');
  return withoutTrailing || '/';
}
