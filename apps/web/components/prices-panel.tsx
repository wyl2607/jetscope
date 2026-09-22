import { InfoCard } from '@/components/cards';
import { FigureValue } from '@/components/figure-value';
import type { Figure } from '@/lib/figure';

type PriceData = {
  /**
   * Unit, source and fallback flag live on the Figure (unit / sourceId / basis).
   * `is_fallback: true` is carried as `basis: 'assumption'`.
   */
  value: Figure;
  priority: number; // figure-contract-lint-ignore: display sort order, not a measurement
};

type PricesPanelProps = {
  prices: PriceData[];
};

export function PricesPanel({ prices }: PricesPanelProps) {
  // Sort by priority: lower number = higher priority
  const sortedPrices = [...prices].sort((a, b) => a.priority - b.priority);

  return (
    <InfoCard title="按优先级排序的价格" subtitle="EU ETS > Rotterdam > Germany > Cache">
      <div className="space-y-4">
        {sortedPrices.map((price, index) => (
          <div key={price.value.sourceId} className="flex items-center justify-between p-3 border border-line-strong rounded-lg bg-surface">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-subtle">#{index + 1}</span>
              <div>
                <p className="font-semibold text-ink">{price.value.sourceId}</p>
                <p className="text-sm text-muted">
                  <FigureValue figure={price.value} locale="zh" size="inline" showTimestamp={false} />
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-subtle">优先级：{price.priority}</p>
            </div>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}
