import { LufthansaCase } from '@/components/lufthansa-case';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

const LUFTHANSA_NEWSROOM =
  'https://newsroom.lufthansagroup.com/en/lufthansa-group-optimises-flight-offering-in-summer-across-all-six-hubs/';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa 2026 年夏季航班削减分析：短途航线的油价压力与 SAF 转折点',
  description:
    '事件分析：Lufthansa Group 削减两万航班背后的燃料经济学。油价如何将 SAF 从“绿色溢价”转变为“战略采购降本工具”，以及德国本土产业链的优势。',
  path: '/analysis/lufthansa-flight-cuts-2026-04',
  alternateLanguages: {
    de: '/de/lufthansa-saf-2026',
    en: '/en/lufthansa-saf-2026'
  }
});

export default function LufthansaAnalysisPage() {
  return <LufthansaCase locale="zh" />;
}
