import { InfoCard } from '@/components/cards';

type SourceData = {
  name: string;
  last_updated: string;
  fallback_rate: number;
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
          <div key={source.name} className="p-4 border border-slate-700 rounded-lg bg-slate-800/50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-white">{source.name}</h3>
              {source.is_primary && <span className="text-xs text-emerald-300">主来源</span>}
            </div>
            <p className="text-sm text-slate-300 mb-1">
              最近更新：{new Date(source.last_updated).toLocaleString('zh-CN')}
            </p>
            <p className="text-sm text-slate-300 mb-2">
              回退率：{(source.fallback_rate * 100).toFixed(1)}%
            </p>
            <button className="text-sky-400 hover:text-sky-300 text-sm underline">
              查看详情
            </button>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}
