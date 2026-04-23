import { InfoCard } from '@/components/cards';

type PriceData = {
  source: string;
  value: number;
  unit: string;
  priority: number;
  is_fallback: boolean;
};

type PricesPanelProps = {
  prices: PriceData[];
};

export function PricesPanel({ prices }: PricesPanelProps) {
  // Sort by priority: lower number = higher priority
  const sortedPrices = [...prices].sort((a, b) => a.priority - b.priority);

  return (
    <InfoCard title="Prices by Priority" subtitle="EU ETS > Rotterdam > Germany > Cache">
      <div className="space-y-4">
        {sortedPrices.map((price, index) => (
          <div key={price.source} className="flex items-center justify-between p-3 border border-slate-700 rounded-lg bg-slate-800/50">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-400">#{index + 1}</span>
              <div>
                <p className="font-semibold text-white">{price.source}</p>
                <p className="text-sm text-slate-300">
                  {price.value} {price.unit}
                  {price.is_fallback && <span className="ml-2 text-amber-300">⚠️ Fallback</span>}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Priority: {price.priority}</p>
            </div>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}