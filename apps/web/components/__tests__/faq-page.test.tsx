import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FaqPage } from '@/components/faq-page';
import { messagesFor, type Locale } from '@/lib/i18n';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

describe('FaqPage', () => {
  it.each(LOCALES)('renders %s copy from the locale file, not from hardcoded siblings', (locale) => {
    const copy = messagesFor(locale).faq;
    render(<FaqPage locale={locale} />);

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();

    for (const question of Object.values(copy.questions)) {
      expect(screen.getByRole('heading', { name: question.title })).toBeInTheDocument();
      expect(screen.getByText(question.why)).toBeInTheDocument();
      expect(screen.getByText(question.body)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: question.action })).toBeInTheDocument();
    }
  });

  it('keeps the five-question grid', () => {
    const questions = Object.values(messagesFor('zh').faq.questions);
    expect(questions).toHaveLength(5);
    render(<FaqPage locale="zh" />);
    expect(document.querySelectorAll('.grid.md\\:grid-cols-2').length).toBe(1);
    for (const question of questions) {
      expect(screen.getByRole('heading', { name: question.title })).toBeInTheDocument();
    }
  });

  it('uses locale-specific hrefs already encoded in navigation.ts', () => {
    const { rerender } = render(<FaqPage locale="zh" />);
    expect(screen.getByRole('link', { name: messagesFor('zh').faq.questions.scope.action })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByRole('link', { name: messagesFor('zh').faq.questions.readiness.action })).toHaveAttribute(
      'href',
      '/admin'
    );
    expect(screen.getByRole('link', { name: messagesFor('zh').faq.method_label })).toHaveAttribute('href', '/sources');

    rerender(<FaqPage locale="de" />);
    expect(screen.getByRole('link', { name: messagesFor('de').faq.questions.scope.action })).toHaveAttribute(
      'href',
      '/de/dashboard'
    );
    expect(screen.getByRole('link', { name: messagesFor('de').faq.method_label })).toHaveAttribute('href', '/de/sources');

    rerender(<FaqPage locale="en" />);
    expect(screen.getByRole('link', { name: messagesFor('en').faq.questions.scope.action })).toHaveAttribute(
      'href',
      '/en/dashboard'
    );
    expect(screen.getByRole('link', { name: messagesFor('en').faq.method_label })).toHaveAttribute('href', '/en/sources');
  });

  it('does not invent a data timestamp', () => {
    render(<FaqPage locale="zh" />);
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('does not bleed copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').faq);
    const de = JSON.stringify(messagesFor('de').faq);
    const en = JSON.stringify(messagesFor('en').faq);

    expect(en).not.toMatch(/上线前置状态|数据来源|研究信号|Häufige Fragen|Startbereitschaft/);
    expect(de).not.toMatch(/Frequently Asked Questions|Launch readiness|Source review|上线前置状态|数据来源/);
    expect(zh).toMatch(/常见问题/);
    expect(en).toMatch(/Frequently Asked Questions/);
    expect(de).toMatch(/Häufige Fragen/);
  });
});
