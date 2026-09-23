'use client';

import { useEffect, useState } from 'react';
import { FigureValue } from '@/components/figure-value';
import { derived, formatFigure, observed, type Figure } from '@/lib/figure';
import type { PathwayCostRow, PathwaySourceView } from '@/lib/pathways-read-model';

type Props = {
  pathways: PathwayCostRow[];
  selectedPathwayKey: string;
  pathwayDetails?: PathwayDetailsByKey;
  /** Optional source-trust metadata keyed by pathway_key. When provided,
   *  the table renders provenance columns; when omitted it renders as before. */
  sources?: Record<string, PathwaySourceView>;
};

export type PathwayDetailsByKey = Record<
  string,
  { carbonReduction: Figure; maturityLevel: string }
>;

type PathwayComparisonWire = {
  generated_at?: string | null;
  rows: Array<{
    pathway_key: string;
    carbon_reduction_pct: number; // figure-contract-lint-ignore: raw API wire value converted to Figure before display
    maturity_level: string;
  }>;
};

const maturityLabels: Record<string, string> = {
  commercial: '商业化',
  early_commercial: '早期商业化',
  scaling: '扩规模',
  demonstration: '示范阶段',
  incumbent: '成熟在用',
  limited: '受限',
  future: '未来路径'
};

export function pathwayDetailsFromComparison(response: PathwayComparisonWire): PathwayDetailsByKey {
  return Object.fromEntries(
    response.rows.map((row) => {
      const carbonReduction = response.generated_at
        ? observed({
            value: row.carbon_reduction_pct,
            unit: '%',
            sourceId: 'pathway-comparison',
            asOf: response.generated_at,
            precision: 0
          })
        : derived({
            value: row.carbon_reduction_pct,
            unit: '%',
            sourceId: 'pathway-comparison',
            asOf: null,
            precision: 0,
            method: 'SAF lifecycle carbon reduction from canonical pathway analysis input'
          });
      return [row.pathway_key, { carbonReduction, maturityLevel: row.maturity_level }];
    })
  );
}

export function SafPathwayComparisonTable({ pathways, selectedPathwayKey, pathwayDetails, sources }: Props) {
  const [fetchedDetails, setFetchedDetails] = useState<PathwayDetailsByKey>({});
  useEffect(() => {
    if (pathwayDetails) return;
    const controller = new AbortController();
    fetch('/api/pathways/compare?fossil_jet_usd_per_l=1', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<PathwayComparisonWire>;
      })
      .then((response) => setFetchedDetails(pathwayDetailsFromComparison(response)))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathwayDetails]);
  const detailsByKey = pathwayDetails ?? fetchedDetails;
  const showSources = Boolean(sources);
  return (
    // Bare artifact: card, title and why-line come from the wrapping Panel.
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-ink">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-3 pr-4">路径</th>
              <th className="py-3 pr-4">净成本</th>
              <th className="py-3 pr-4">CO₂ 减排</th>
              <th className="py-3 pr-4">成熟度</th>
              <th className="py-3 pr-4">状态</th>
              <th className="py-3 pr-4">价差</th>
              {showSources ? <th className="py-3">来源可信度</th> : null}
            </tr>
          </thead>
          <tbody>
            {pathways.map((pathway) => {
              const details = detailsByKey[pathway.pathway_key];
              const isSelected = pathway.pathway_key === selectedPathwayKey;
              const rowClass = isSelected ? 'bg-accent-soft ring-1 ring-accent' : '';
              const statusColor =
                pathway.status === 'competitive'
                  ? 'text-success'
                  : pathway.status === 'inflection'
                    ? 'text-warning'
                    : 'text-danger';
              return (
                <tr key={pathway.pathway_key} className={`border-b border-line last:border-none ${rowClass}`}>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-ink">{pathway.display_name}</div>
                    <div className="text-xs text-muted">{pathway.pathway_key}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className="inline-flex flex-wrap items-baseline gap-1">
                      <FigureValue figure={pathway.netCostLow} locale="zh" size="inline" showTimestamp={false} />
                      <span>–</span>
                      <FigureValue figure={pathway.netCostHigh} locale="zh" size="inline" showTimestamp={false} />
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {details ? (
                      <FigureValue figure={details.carbonReduction} locale="zh" size="inline" showTimestamp={false} />
                    ) : '无数据'}
                  </td>
                  <td className="py-3 pr-4">
                    {details ? maturityLabels[details.maturityLevel] ?? details.maturityLevel : '无数据'}
                  </td>
                  <td className={`py-3 pr-4 font-medium ${statusColor}`}>{pathway.status}</td>
                  <td className="py-3 pr-4">
                    {formatFigure(pathway.spreadLow)} 至 {formatFigure(pathway.spreadHigh)}
                  </td>
                  {showSources ? (
                    <td className="py-3">
                      {sources?.[pathway.pathway_key] ? (
                        <div>
                          <div className="text-ink">
                            {sources[pathway.pathway_key].sourceType} · {sources[pathway.pathway_key].confidenceLabel}（
                            {sources[pathway.pathway_key].confidencePct}%）
                          </div>
                          <div className="text-xs text-muted">
                            {sources[pathway.pathway_key].freshnessLabel}
                            {sources[pathway.pathway_key].fallbackUsed ? ' · 回退' : ''}
                          </div>
                          {sources[pathway.pathway_key].sourceUrl ? (
                            <a className="text-xs underline" href={sources[pathway.pathway_key].sourceUrl ?? undefined}>
                              {sources[pathway.pathway_key].sourceName ?? sources[pathway.pathway_key].sourceUrl}
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-subtle">无数据</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
