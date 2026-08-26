import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPage } from '@/components/admin-page';
import { messagesFor, type Locale } from '@/lib/i18n';
import { getLaunchReadinessReadModel } from '@/lib/readiness-read-model';

vi.mock('@/lib/readiness-read-model', () => ({
  getLaunchReadinessReadModel: vi.fn()
}));

vi.mock('@/components/admin-data-ops', () => ({
  AdminDataOps: () => <div data-testid="admin-data-ops">AdminDataOps</div>
}));

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function readinessFixture() {
  return {
    generatedAt: '2026-01-15T12:00:00Z',
    status: 'not_ready',
    statusLabel: '未就绪',
    ready: false,
    degraded: true,
    environment: 'test',
    apiPrefix: '/v1',
    schemaBootstrapMode: 'create',
    checks: [
      {
        key: 'source_coverage',
        label: '来源覆盖',
        ok: false,
        status: 'degraded',
        statusLabel: '降级',
        detail: 'completeness=0.4 metrics=12',
        actionLabel: '修复来源覆盖',
        actionHref: '/sources?filter=review',
        actionKey: 'review_source_coverage',
        severity: 'review',
        blocking: false,
        configKeys: ['SOURCE_COVERAGE'],
        tone: 'review' as const
      },
      {
        key: 'admin_token',
        label: '管理令牌',
        ok: false,
        status: 'missing',
        statusLabel: '缺少配置',
        detail: 'JETSCOPE_ADMIN_TOKEN is not configured',
        actionLabel: '配置管理令牌',
        actionHref: '/admin',
        actionKey: 'configure_admin_token',
        severity: 'blocker',
        blocking: true,
        configKeys: ['JETSCOPE_ADMIN_TOKEN'],
        tone: 'critical' as const
      },
      {
        key: 'ai_research_pipeline',
        label: 'AI 研究流水线',
        ok: false,
        status: 'disabled',
        statusLabel: '未启用',
        detail: 'JETSCOPE_AI_RESEARCH_ENABLED is false',
        actionLabel: '打开研究工作台',
        actionHref: '/research',
        actionKey: 'enable_ai_research',
        severity: 'review',
        blocking: false,
        configKeys: ['JETSCOPE_AI_RESEARCH_ENABLED'],
        tone: 'review' as const
      }
    ],
    error: null
  };
}

async function renderAdmin(locale: Locale) {
  const ui = await AdminPage({ locale });
  return render(ui);
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.mocked(getLaunchReadinessReadModel).mockResolvedValue(readinessFixture());
  });

  it('zh renders AdminDataOps write controls', async () => {
    await renderAdmin('zh');
    expect(screen.getByTestId('admin-data-ops')).toBeInTheDocument();
  });

  it.each(['de', 'en'] as const)('%s does not render AdminDataOps or write controls', async (locale) => {
    await renderAdmin(locale);
    expect(screen.queryByTestId('admin-data-ops')).toBeNull();
    expect(screen.queryByLabelText(/管理令牌/)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });

  it.each(LOCALES)('renders %s readiness copy from the locale file', async (locale) => {
    const copy = messagesFor(locale).admin;
    await renderAdmin(locale);

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.scope_title })).toBeInTheDocument();
    for (const item of copy.scope_items) {
      expect(screen.getByText(`${copy.scope_bullet}${item}`)).toBeInTheDocument();
    }
    expect(screen.getAllByText(copy.check_labels.admin_token).length).toBeGreaterThan(0);
    expect(screen.getByText(copy.impact_blocking)).toBeInTheDocument();
    expect(screen.getByText(copy.check_labels.ai_research_pipeline)).toBeInTheDocument();
  });

  it('keeps show_admin_ops true only in zh', () => {
    expect(messagesFor('zh').admin.show_admin_ops).toBe(true);
    expect(messagesFor('de').admin.show_admin_ops).toBe(false);
    expect(messagesFor('en').admin.show_admin_ops).toBe(false);
  });

  it('uses locale-specific recovery hrefs already encoded in navigation.ts', async () => {
    const { rerender } = render(await AdminPage({ locale: 'zh' }));
    expect(screen.getByRole('link', { name: '修复来源覆盖' })).toHaveAttribute('href', '/sources?filter=review');
    expect(screen.getByRole('link', { name: messagesFor('zh').admin.method_label })).toHaveAttribute(
      'href',
      '/sources'
    );

    rerender(await AdminPage({ locale: 'de' }));
    expect(screen.getByRole('link', { name: 'Quellen beheben' })).toHaveAttribute(
      'href',
      '/de/sources?filter=review'
    );
    expect(screen.getByRole('link', { name: 'Forschungspfad prüfen' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: messagesFor('de').admin.method_label })).toHaveAttribute(
      'href',
      '/de/sources'
    );

    rerender(await AdminPage({ locale: 'en' }));
    expect(screen.getByRole('link', { name: 'Fix sources' })).toHaveAttribute('href', '/en/sources?filter=review');
    expect(screen.getByRole('link', { name: 'Open research' })).toHaveAttribute('href', '/en/research');
    expect(screen.getByRole('link', { name: 'Open primary admin' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: messagesFor('en').admin.method_label })).toHaveAttribute(
      'href',
      '/en/sources'
    );
  });

  it('suppresses as-of when readiness is on fallback', async () => {
    vi.mocked(getLaunchReadinessReadModel).mockResolvedValue({
      ...readinessFixture(),
      generatedAt: '2026-01-15T12:00:00Z',
      error: 'readiness unavailable'
    });
    await renderAdmin('zh');
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('does not invent a data timestamp from the clock', async () => {
    await renderAdmin('en');
    const stamp = screen.getByTestId('page-as-of');
    expect(stamp.querySelector('time')).toHaveAttribute('dateTime', '2026-01-15T12:00:00Z');
  });

  it('does not introduce middleware or a [locale] rewrite', () => {
    const files = [
      'components/admin-page.tsx',
      'app/admin/page.tsx',
      'app/de/admin/page.tsx',
      'app/en/admin/page.tsx'
    ];
    for (const file of files) {
      const source = readFileSync(resolve(file), 'utf8');
      expect(source).not.toMatch(/\bmiddleware\b/);
      expect(source).not.toMatch(/\/\[locale\]/);
    }
  });
});
