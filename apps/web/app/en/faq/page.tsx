import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const metadata: Metadata = buildPageMetadata({
  title: 'Frequently Asked Questions',
  description:
    'JetScope FAQ for launch readiness, source review, research workbench boundaries, scenario writes, and protected operations.',
  path: '/en/faq',
  alternateLanguages: {
    'zh-CN': '/faq',
    en: '/en/faq',
    de: '/de/faq'
  }
});

const questions = [
  {
    title: 'What can JetScope review today?',
    body:
      'JetScope combines jet-fuel prices, SAF breakeven pressure, EU reserve stress, source quality, saved scenario assumptions, and research signals into one review workflow.',
    href: '/en/dashboard' as Route,
    action: 'Open decision cockpit'
  },
  {
    title: 'Why can launch readiness be not ready?',
    body:
      'Launch readiness reports the actual environment. Missing management configuration, disabled AI research, database issues, or degraded source coverage are disclosed as blockers or review items instead of being hidden.',
    href: '/en/admin' as Route,
    action: 'Open Launch readiness'
  },
  {
    title: 'How should I read degraded or fallback sources?',
    body:
      'Source review separates live, proxy, fallback, unavailable, and error states. A degraded source can still be useful, but it should be reviewed before procurement or reporting use.',
    href: '/en/sources' as Route,
    action: 'Open Source review'
  },
  {
    title: 'Why might the research workbench be disabled?',
    body:
      'The Research workbench does not pretend that AI analysis is live when the pipeline is disabled or credentials are incomplete. It shows the boundary and the next review actions.',
    href: '/en/research' as Route,
    action: 'Open Research workbench'
  },
  {
    title: 'Can I save scenarios or refresh market data here?',
    body:
      'Scenario writes and refresh operations are protected. Without the configured management token, localized FAQ pages and review surfaces stay read-only and link back to the primary workspaces.',
    href: '/en/scenarios' as Route,
    action: 'Open Scenario workbench'
  }
] as const;

export default function EnglishFaqPage() {
  return (
    <Shell
      locale="en"
      eyebrow="Help · Launch Boundary"
      title="Frequently Asked Questions"
      description="A practical guide to JetScope launch readiness, source confidence, AI research boundaries, and protected write operations."
    >
      <section className="grid gap-4 md:grid-cols-2">
        {questions.map((item) => (
          <InfoCard key={item.title} title={item.title} subtitle={item.action}>
            <p className="text-sm leading-7 text-slate-700">{item.body}</p>
            <p className="mt-4 text-sm">
              <Link className="font-semibold text-sky-700 underline" href={item.href}>
                {item.action}
              </Link>
            </p>
          </InfoCard>
        ))}
      </section>
    </Shell>
  );
}
