import { PageTemplate } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDictionary, isLocale, localeHref } from '@/lib/i18n';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * One page for three locales. Contract section 4: the route lives once under
 * `[locale]`, and its copy lives in `src/locales/*.json` (rule 3).
 *
 * Structure stays here and copy stays there. These entries carry the ordering
 * and the link target - the target is locale-free, because `localeHref` is what
 * knows that `zh` has no prefix - and the dictionary carries every word.
 */
const QUESTIONS = [
  { id: 'scope', route: '/dashboard' },
  { id: 'readiness', route: '/admin' },
  { id: 'sources', route: '/sources' },
  { id: 'research', route: '/research' },
  { id: 'scenarios', route: '/scenarios' }
] as const;

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getDictionary(locale).faq;

  return buildPageMetadata({
    title: copy.meta_title,
    description: copy.meta_description,
    path: localeHref(locale, '/faq'),
    alternateLanguages: {
      'zh-CN': '/faq',
      en: '/en/faq',
      de: '/de/faq'
    }
  });
}

export default async function FaqPage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getDictionary(locale).faq;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={null}
    >
      <div className="grid gap-6 md:grid-cols-2">
        {QUESTIONS.map(({ id, route }) => {
          const question = copy.questions[id];
          return (
            <Panel key={id} locale={locale} title={question.title} why={question.why}>
              <p className="text-sm leading-7 text-muted">{question.body}</p>
              <p className="mt-4 text-sm">
                <Link
                  className="font-semibold text-accent underline"
                  href={localeHref(locale, route) as Route}
                >
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
        methodHref={localeHref(locale, '/sources') as Route}
        methodLabel={copy.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
