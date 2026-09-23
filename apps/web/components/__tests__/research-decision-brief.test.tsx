import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';

describe('ResearchDecisionBriefCard', () => {
  it('does not link to the retired research route', () => {
    render(
      <ResearchDecisionBriefCard
        brief={{
          status: 'empty', headline: '暂无信号', whyMatters: '暂无', action: '等待',
          activeCount: 0, positiveCount: 0, negativeCount: 0, neutralCount: 0, topSignals: []
        }}
      />
    );

    expect(screen.queryByRole('link', { name: '打开信号' })).not.toBeInTheDocument();
  });
  it('renders without crashing', () => {
    const { container } = render(
      <ResearchDecisionBriefCard
        brief={{
          status: 'ok',
          headline: 'Headline',
          whyMatters: 'Because',
          action: 'Act',
          activeCount: 1,
          positiveCount: 1,
          negativeCount: 0,
          neutralCount: 0,
          topSignals: [
            {
              id: 's1',
              signal_type: 'policy',
              impact_direction: 'positive',
              confidence: 0.8,
              title: 'Signal title',
              summary_cn: '信号摘要',
              summary_en: 'Signal summary',
              published_at: new Date().toISOString()
            }
          ]
        }}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
