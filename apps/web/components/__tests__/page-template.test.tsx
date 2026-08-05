import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { DataTable } from '@/components/data-table';
import { SourceFooter } from '@/components/source-footer';

/**
 * These assert the properties docs/UI_CONTRACT.md section 2 and 3 require, not
 * the markup. A page skeleton is only worth having if the guarantees it makes
 * are enforced somewhere.
 */

describe('PageTemplate', () => {
  it('states the decision question the page answers', () => {
    render(
      <PageTemplate eyebrow="决策驾驶舱" title="燃料切换" question="现在该不该切换到 SAF？">
        <p>body</p>
      </PageTemplate>
    );
    expect(screen.getByText('现在该不该切换到 SAF？')).toBeInTheDocument();
  });

  it('renders the data timestamp with an explicit timezone', () => {
    render(
      <PageTemplate eyebrow="e" title="t" question="q" asOf="2026-08-05T09:30:00Z">
        <p>body</p>
      </PageTemplate>
    );
    const stamp = screen.getByTestId('page-as-of');
    expect(stamp).toHaveTextContent(/GMT|UTC/);
    expect(within(stamp).getByText(/2026/)).toBeInTheDocument();
  });

  it('omits the stamp rather than inventing one when asOf is missing or unparseable', () => {
    const { rerender } = render(
      <PageTemplate eyebrow="e" title="t" question="q">
        <p>body</p>
      </PageTemplate>
    );
    expect(screen.queryByTestId('page-as-of')).toBeNull();

    rerender(
      <PageTemplate eyebrow="e" title="t" question="q" asOf="not-a-date">
        <p>body</p>
      </PageTemplate>
    );
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });
});

describe('SignalRow', () => {
  it('is labelled for assistive technology', () => {
    render(
      <SignalRow label="关键信号">
        <div>card</div>
      </SignalRow>
    );
    expect(screen.getByRole('region', { name: '关键信号' })).toBeInTheDocument();
  });
});

describe('Panel', () => {
  it('renders its artifact when ready', () => {
    render(
      <Panel title="价格趋势" why="解释为什么现在有压力">
        <div>chart</div>
      </Panel>
    );
    expect(screen.getByText('chart')).toBeInTheDocument();
    expect(screen.getByText('解释为什么现在有压力')).toBeInTheDocument();
  });

  it.each(['loading', 'empty'] as const)('replaces the artifact with a %s status, never nothing', (state) => {
    render(
      <Panel title="价格趋势" state={state} stateDetail="API 未启动">
        <div>chart</div>
      </Panel>
    );
    expect(screen.queryByText('chart')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('API 未启动');
  });

  it('treats an error as a problem: alert role and the danger tone, not neutral grey', () => {
    render(
      <Panel title="价格趋势" state="error" stateDetail="上游 502">
        <div>chart</div>
      </Panel>
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('上游 502');
    expect(alert.className).toMatch(/danger/);
    expect(alert.className).not.toMatch(/surface-muted/);
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 'a', name: 'Brent', price: 82.4 },
    { id: 'b', name: 'Jet', price: 731.05 }
  ];
  const columns = [
    { key: 'name', header: 'Source', render: (r: (typeof rows)[number]) => r.name },
    { key: 'price', header: 'Price', numeric: true, render: (r: (typeof rows)[number]) => r.price.toFixed(2) }
  ];

  it('right-aligns numeric columns and renders them with tabular figures', () => {
    render(<DataTable caption="价格" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const cell = screen.getByText('731.05');
    expect(cell.className).toMatch(/text-right/);
    expect(cell.className).toMatch(/tabular-nums/);
  });

  it('carries a caption for screen readers', () => {
    render(<DataTable caption="价格对照" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole('table', { name: '价格对照' })).toBeInTheDocument();
  });

  it('says why it is empty instead of rendering an empty grid', () => {
    render(<DataTable caption="价格" columns={columns} rows={[]} rowKey={(r) => r.id} emptyMessage="筛选过窄" />);
    expect(screen.getByRole('status')).toHaveTextContent('筛选过窄');
  });
});

describe('SourceFooter', () => {
  it('marks assumptions visibly and never styles them like observations', () => {
    render(
      <SourceFooter
        sources={[
          { id: 'eurostat', label: 'Eurostat', basis: 'observed' },
          { id: 'reserve', label: 'EU 储备天数', basis: 'assumption' }
        ]}
      />
    );
    const assumption = screen.getByText('情景假设');
    const observed = screen.getByText('实测');

    expect(assumption.className).toMatch(/warning/);
    expect(observed.className).not.toMatch(/warning/);
    expect(assumption.className).not.toEqual(observed.className);
  });

  it('shows the method link and the limitations rather than implying completeness', () => {
    render(
      <SourceFooter
        sources={[{ id: 's', label: 'S' }]}
        methodHref="/sources"
        methodLabel="口径说明"
        limitations={['不含电力上游排放']}
      />
    );
    expect(screen.getByRole('link', { name: '口径说明' })).toBeInTheDocument();
    expect(screen.getByText('不含电力上游排放')).toBeInTheDocument();
  });
});
