'use client';

import { useEffect, useState } from 'react';
import { PolicyTimeline } from './policy-timeline';

interface MarketSnapshot {
  generated_at: string;
  source_status: { overall: string };
  values: Record<string, number>;
}

export function PolicyTimelineWithMarketTime() {
  const [marketTimestamp, setMarketTimestamp] = useState<number>(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarketTime = async () => {
      try {
        const response = await fetch('/api/market/snapshot');
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const data: MarketSnapshot = await response.json();
        const timestamp = new Date(data.generated_at).getTime();
        setMarketTimestamp(timestamp);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch market snapshot:', err);
        setError(err instanceof Error ? err.message : 'Failed to load market data');
        // Fallback to current time
        setMarketTimestamp(Date.now());
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketTime();
    // Refresh every 5 minutes
    const interval = setInterval(fetchMarketTime, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg">
        <p className="text-sm text-yellow-300">Note: Using current time instead of market data ({error})</p>
        <PolicyTimeline currentTimestamp={marketTimestamp} />
      </div>
    );
  }

  return <PolicyTimeline currentTimestamp={marketTimestamp} />;
}
