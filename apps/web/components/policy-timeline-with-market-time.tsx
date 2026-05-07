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
        const response = await fetch('/api/market');
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const data: MarketSnapshot = await response.json();
        const timestamp = new Date(data.generated_at).getTime();
        setMarketTimestamp(timestamp);
        setError(null);
      } catch (err) {
        console.warn('Market timeline is using local time because the live market snapshot is unavailable.', err);
        setError(err instanceof Error ? err.message : '市场数据加载失败');
        // Fallback to current time.
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
      <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
        <p className="text-sm text-amber-200">
          实时市场快照暂不可用，时间线暂用本地时间。
        </p>
        <PolicyTimeline currentTimestamp={marketTimestamp} />
      </div>
    );
  }

  return <PolicyTimeline currentTimestamp={marketTimestamp} />;
}
