import { LOCALES, isLocale } from '@/lib/i18n';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Validates the locale segment. Without this, `/xx/faq` would render the page
 * with `locale = "xx"`, the dictionary lookup would come back undefined, and the
 * reader would get a page of blanks instead of a 404.
 */
export function generateStaticParams(): Array<{ locale: string }> {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return children;
}
