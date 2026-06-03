import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Shell } from '@/components/shell';

describe('Shell', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Shell title="Title" eyebrow="Eyebrow" description="Description">
        <div>Child</div>
      </Shell>
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('renders German navigation labels for German pages', () => {
    const { queryByText, getByText } = render(
      <Shell locale="de" title="Titel" eyebrow="Bereich" description="Beschreibung">
        <div>Inhalt</div>
      </Shell>
    );

    expect(getByText('Entscheidungscockpit')).toBeTruthy();
    expect(getByText('Preise')).toBeTruthy();
    expect(getByText('Analyse')).toBeTruthy();
    expect(queryByText('决策驾驶舱')).toBeNull();
  });

  it('renders English navigation labels for English pages', () => {
    const { queryByText, getByText } = render(
      <Shell locale="en" title="Title" eyebrow="Area" description="Description">
        <div>Content</div>
      </Shell>
    );

    expect(getByText('Decision Cockpit')).toBeTruthy();
    expect(getByText('Home')).toBeTruthy();
    expect(getByText('Sources')).toBeTruthy();
    expect(getByText('Research')).toBeTruthy();
    expect(queryByText('决策驾驶舱')).toBeNull();
  });
});
