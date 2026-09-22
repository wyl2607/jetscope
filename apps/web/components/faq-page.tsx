import { PageTemplate } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { messagesFor, type Locale } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One FAQ view for three real routes. Copy comes from `src/locales/*.json`.
 * The thin `app/faq`, `app/de/faq` and `app/en/faq` pages pass the locale they
 * already own; they do not rewrite the public URL.
 *
 * These entries carry ordering and the navigation target. `NAV_ENTRIES` already
 * encodes the locale-specific path (`/dashboard` vs `/de/dashboard`).
 */
const QUESTIONS = [
  { id: 'scope', navId: 'dashboard' },
  { id: 'readiness', navId: 'admin' },
  { id: 'sources', navId: 'sources' },
  { id: 'research', navId: 'research' },
  { id: 'scenarios', navId: 'scenarios' }
] as const;

function hrefFor(locale: Locale, navId: (typeof QUESTIONS)[number]['navId']): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`FAQ has no ${locale} path for ${navId}`);
  }
  return path as Route;
}

export function FaqPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).faq;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={null}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {QUESTIONS.map(({ id, navId }) => {
          const question = copy.questions[id];
          return (
            <Panel key={id} locale={locale} title={question.title} why={question.why}>
              <p className="text-sm leading-7 text-muted">{question.body}</p>
              <p className="mt-4 text-sm">
                <Link className="font-semibold text-accent underline" href={hrefFor(locale, navId)}>
                  {question.action}
                </Link>
              </p>
            </Panel>
          );
        })}
      </div>

      <SourceFooter
        locale={locale}
        sources={[
          { id: 'ui-contract', label: copy.source_ui_contract, basis: 'assumption' },
          {
            id: 'launch-readiness-contract',
            label: copy.source_launch_readiness,
            basis: 'assumption'
          }
        ]}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
