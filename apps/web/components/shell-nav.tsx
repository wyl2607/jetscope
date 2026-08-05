'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type NavItem = Readonly<{ href: string; label: string }>;

export function ShellNav({
  items,
  navigationLabel,
  menuLabel,
  closeLabel
}: {
  items: readonly NavItem[];
  navigationLabel: string;
  menuLabel: string;
  closeLabel: string;
}) {
  const pathname = usePathname() ?? '/';
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === pathname || (href !== '/' && pathname.startsWith(`${href}/`));

  return (
    <div className="js-nav-wrap">
      <button
        type="button"
        className="js-nav-toggle"
        aria-expanded={open}
        aria-controls="jetscope-primary-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? closeLabel : menuLabel}</span>
        <span aria-hidden="true" className="js-nav-toggle-icon">
          {open ? '×' : '☰'}
        </span>
      </button>

      <nav
        id="jetscope-primary-navigation"
        aria-label={navigationLabel}
        className={`js-primary-nav${open ? ' is-open' : ''}`}
      >
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={active ? 'page' : undefined}
              className={`js-nav-link${active ? ' is-active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
