'use client';

import { useEffect } from 'react';

export function FocusScroll({ focusMetricKey }: { focusMetricKey?: string }) {
  useEffect(() => {
    if (!focusMetricKey) {
      return;
    }

    const targetId = `metric-${focusMetricKey}`;
    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    element.classList.add('ring-2', 'ring-sky-300');

    const timer = window.setTimeout(() => {
      element.classList.remove('ring-2', 'ring-sky-300');
    }, 1800);

    return () => {
      window.clearTimeout(timer);
      element.classList.remove('ring-2', 'ring-sky-300');
    };
  }, [focusMetricKey]);

  return null;
}
