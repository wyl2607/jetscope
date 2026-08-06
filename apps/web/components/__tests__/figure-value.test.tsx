import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FigureValue } from '@/components/figure-value';
import { assumed, derived, missing, observed } from '@/lib/figure';

/**
 * docs/UI_CONTRACT.md section 3, asserted rather than trusted.
 *
 * Each of these has been broken in production code at least once by someone who
 * knew the rule: an assumption rendered exactly like a measurement, a fallback
 * stamped with the current time, a missing value shown as 0. The point of
 * routing every number through one component is that the rules only have to
 * hold here.
 */

describe('FigureValue', () => {
  it('marks an assumption visibly and in warning, never like a measurement', () => {
    render(
      <FigureValue
        figure={assumed({ value: 0.657, unit: 'USD/L', sourceId: 'jet-price', method: '内置默认值' })}
      />
    );
    const mark = screen.getByTestId('figure-basis-assumption');
    expect(mark).toHaveTextContent('情景假设');
    expect(mark.className).toMatch(/warning/);
  });

  it('does not colour an observation - the semantic palette is for problems', () => {
    render(
      <FigureValue
        figure={observed({ value: 0.657, unit: 'USD/L', asOf: '2026-08-05T09:00:00Z', sourceId: 'jet-price' })}
      />
    );
    const mark = screen.getByTestId('figure-basis-observed');
    expect(mark.className).not.toMatch(/warning|danger|success/);
  });

  it('renders an em dash and the reason when the value is unknown, never a zero', () => {
    render(
      <FigureValue figure={missing({ unit: 'weeks', sourceId: 'reserves', reason: '上游接口暂时不可用' })} />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('上游接口暂时不可用')).toBeInTheDocument();
    expect(screen.queryByText('0.00 weeks')).toBeNull();
  });

  it('links a derived figure to its method', () => {
    render(
      <FigureValue
        figure={derived({
          value: 12.5,
          unit: '%',
          asOf: '2026-08-05T09:00:00Z',
          sourceId: 'spread',
          method: '相对有效化石航油价差',
          methodHref: '/reports/tipping-point-analysis'
        })}
      />
    );
    expect(screen.getByRole('link', { name: '方法' })).toHaveAttribute(
      'href',
      '/reports/tipping-point-analysis'
    );
  });

  it('renders the timestamp in UTC so three locales quote the same instant', () => {
    render(
      <FigureValue
        figure={observed({ value: 1, unit: 'USD/L', asOf: '2026-08-05T09:30:00Z', sourceId: 'jet-price' })}
        locale="de"
      />
    );
    expect(screen.getByText(/GMT|UTC/)).toBeInTheDocument();
  });

  it('warns when a figure is older than the cadence its source promised', () => {
    render(
      <FigureValue
        figure={observed({
          value: 1,
          unit: 'USD/L',
          asOf: '2020-01-01T00:00:00Z',
          sourceId: 'jet-price',
          maxAgeHours: 24
        })}
      />
    );
    const stamp = screen.getByText(/已过期/);
    expect(stamp.className).toMatch(/warning/);
  });

  it('refuses to render a figure that breaks the contract', () => {
    const forged = {
      value: 1,
      unit: 'USD/L',
      asOf: '2026-08-05T09:00:00Z',
      sourceId: 'jet-price',
      basis: 'assumption' as const,
      method: '默认值'
    };
    expect(() => render(<FigureValue figure={forged} />)).toThrow(/asOf must be null/);
  });
});
