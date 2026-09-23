import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LufthansaCase } from '../lufthansa-case';

vi.mock('next/navigation', () => ({
  usePathname: () => '/analysis/lufthansa-flight-cuts-2026-04',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })
}));

describe('LufthansaCase', () => {
  it('renders correctly for zh locale', () => {
    render(<LufthansaCase locale="zh" />);
    expect(screen.getAllByText('Lufthansa 2026年运力削减：SAF转折点信号')[0]).toBeInTheDocument();
    expect(screen.getByText('来源口径与方法清单')).toBeInTheDocument();
  });

  it('renders correctly for en locale', () => {
    render(<LufthansaCase locale="en" />);
    expect(screen.getAllByText('Lufthansa SAF Inflection Review')[0]).toBeInTheDocument();
    expect(screen.getByText('Source and method registry')).toBeInTheDocument();
  });

  it('renders correctly for de locale', () => {
    render(<LufthansaCase locale="de" />);
    expect(screen.getAllByText('Lufthansa kürzt 20.000 Flüge: Wendepunkt für SAF?')[0]).toBeInTheDocument();
    expect(screen.getByText('Quellen- und Methodenliste')).toBeInTheDocument();
  });
});
