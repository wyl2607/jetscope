import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErrorPage from '@/app/error';
import NotFound from '@/app/not-found';

describe('NotFound', () => {
  it('links back to the home page', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: /页面不存在/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回首页/ })).toHaveAttribute('href', '/');
  });
});

describe('ErrorPage', () => {
  it('retries through reset without exposing the error message', () => {
    const reset = vi.fn();
    const message = 'database password leaked in stack trace';
    const { container } = render(<ErrorPage error={new Error(message)} reset={reset} />);

    expect(container.textContent).not.toContain(message);

    fireEvent.click(screen.getByRole('button', { name: /重试/ }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
