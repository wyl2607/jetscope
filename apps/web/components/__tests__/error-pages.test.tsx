import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorPage from '@/app/error';
import NotFound from '@/app/not-found';
import { messagesFor, type Locale } from '@/lib/i18n';
import { homeHrefFor } from '@/lib/navigation';

const mockedPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockedPathname.value
}));

afterEach(cleanup);

describe('NotFound', () => {
  it.each([
    ['zh', '/missing-page'],
    ['de', '/de/missing-page'],
    ['en', '/en/missing-page']
  ] as const)('uses %s copy and links to its home page', (locale, pathname) => {
    mockedPathname.value = pathname;
    render(<NotFound />);
    const copy = messagesFor(locale);

    expect(screen.getByRole('heading', { name: copy.error_page.not_found_title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.error_page.home })).toHaveAttribute('href', homeHrefFor(locale));
    expect(screen.getByRole('link', { name: copy.error_page.home })).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-accent'
    );
  });
});

describe('ErrorPage', () => {
  it.each([
    ['zh', '/missing-page'],
    ['de', '/de/missing-page'],
    ['en', '/en/missing-page']
  ] as const)('uses %s copy and retries without exposing the error message', (locale: Locale, pathname) => {
    mockedPathname.value = pathname;
    const reset = vi.fn();
    const message = 'database password leaked in stack trace';
    const { container } = render(<ErrorPage error={new Error(message)} reset={reset} />);
    const copy = messagesFor(locale);

    expect(container.textContent).not.toContain(message);
    expect(screen.getByRole('heading', { name: copy.error_page.error_title })).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: copy.error_page.retry });
    expect(retry).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-accent');
    fireEvent.click(retry);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
