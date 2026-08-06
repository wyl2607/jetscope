import type { ReactNode } from 'react';
import type { NavLocale } from '@/lib/navigation';

/**
 * The one table in the product. Every tabular artifact goes through here so
 * that column alignment, numeric rendering and the empty state stop being
 * decided per page.
 *
 * Numeric columns are right-aligned and tabular-nums, which is what makes a
 * column of figures readable as a column rather than as ragged text
 * (docs/UI_CONTRACT.md section 1, type scale).
 */

export type Column<Row> = {
  key: string;
  header: string;
  /** Numeric columns right-align and use tabular figures. */
  numeric?: boolean;
  /** Column width hint, e.g. 'w-40'. */
  width?: string;
  render: (row: Row) => ReactNode;
};

const EMPTY_COPY = {
  zh: '当前筛选没有匹配数据',
  de: 'Keine Daten für die aktuelle Auswahl',
  en: 'No rows match the current filter'
} as const satisfies Record<NavLocale, string>;

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage,
  locale = 'zh',
  rowTone
}: {
  /** Screen-reader caption. Every table needs one. */
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, index: number) => string;
  emptyMessage?: string;
  locale?: NavLocale;
  /** Optional semantic row highlight, e.g. a breached threshold. */
  rowTone?: (row: Row) => string | undefined;
}) {
  if (rows.length === 0) {
    return (
      <p role="status" className="rounded-xl border border-line bg-surface-muted px-4 py-6 text-sm text-muted">
        {emptyMessage ?? EMPTY_COPY[locale]}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line-strong">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted ${
                  column.numeric ? 'text-right' : 'text-left'
                } ${column.width ?? ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const tone = rowTone?.(row);
            return (
              <tr
                key={rowKey(row, index)}
                className={`border-b border-line ${tone ?? (index % 2 === 1 ? 'bg-surface-muted' : '')}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-3 py-3 align-top text-ink ${
                      column.numeric ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
