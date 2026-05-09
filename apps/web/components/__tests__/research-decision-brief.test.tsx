import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';

describe('ResearchDecisionBriefCard', () => {
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
              title: 'Signal title'
            }
          ]
        }}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
