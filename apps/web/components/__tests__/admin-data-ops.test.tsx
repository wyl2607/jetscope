import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminDataOps } from '@/components/admin-data-ops';

describe('AdminDataOps', () => {
  it('renders without crashing', () => {
    const { container } = render(<AdminDataOps />);
    expect(container.firstChild).not.toBeNull();
  });
});
