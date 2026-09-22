import { InfoCard } from '@/components/cards';
import { FigureValue } from '@/components/figure-value';
import type { Figure } from '@/lib/figure';

type SourceData = {
  name: string;
  /** Source observation time; also the `asOf` on `fallback_rate`. */
  last_updated: string;
  fallback_rate: Figure;
  is_primary: boolean;
};

type SourcesPanelProps = {
  sources: SourceData[];
};

export function SourcesPanel({ sources }: SourcesPanelProps) {
  return (
    <InfoCard title="数据来源" subtitle="来源健康度与状态">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sources.map((source) => (
          <div key={source.name} className="p-4 border border-line-strong rounded-lg bg-surface">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-ink">{source.name}</h3>
              {source.is_primary && <span className="text-xs text-success">主来源</span>}
            </div>
            <p className="text-sm text-muted mb-1">
              最近更新：{new Date(source.last_updated).toLocaleString('zh-CN')}
            </p>
            <p className="text-sm text-muted mb-2">
              回退率：
              <FigureValue figure={source.fallback_rate} locale="zh" size="inline" showTimestamp={false} />
            </p>
            <button className="text-accent hover:text-accent text-sm underline">
              查看详情
            </button>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}
