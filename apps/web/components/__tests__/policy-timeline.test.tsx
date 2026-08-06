import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PolicyTimeline } from '@/components/policy-timeline';

describe('PolicyTimeline', () => {
  it('renders without crashing', () => {
    const { container } = render(<PolicyTimeline currentTimestamp={Date.now()} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders German labels when locale is German', () => {
    const { getByText, queryByText } = render(
      <PolicyTimeline locale="de" currentTimestamp={new Date('2026-06-03T12:00:00Z').getTime()} />
    );

    // The heading moved to the wrapping Panel when this became a bare artifact,
    // so the locale is asserted through the copy the component still owns: the
    // reference-date line, the milestones and the current-year marker.
    expect(getByText(/Regulatorische Ziele auf Basis der Marktdaten vom/)).toBeTruthy();
    expect(getByText('EU SAF-Mandat tritt in Kraft')).toBeTruthy();
    expect(getByText('Aktuelles Jahr')).toBeTruthy();
    expect(queryByText('政策里程碑时间线')).toBeNull();
    expect(queryByText('Policy-Meilenstein-Zeitlinie')).toBeNull();
  });
});
