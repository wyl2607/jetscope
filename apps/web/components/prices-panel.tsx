import { InfoCard } from '@/components/cards';

type PriceData = {
  source: string;
  value: number;
  unit: string;
  priority: number; // figure-contract-lint-ignore: display sort order, not a measurement
  is_fallback: boolean;
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
          <div key={price.source} className="flex items-center justify-between p-3 border border-line-strong rounded-lg bg-surface">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-subtle">#{index + 1}</span>
              <div>
                <p className="font-semibold text-ink">{price.source}</p>
                <p className="text-sm text-muted">
                  {price.value} {price.unit}
                  {price.is_fallback && <span className="ml-2 text-warning">回退值</span>}
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
