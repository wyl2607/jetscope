import type { ReactNode } from 'react';
import type { NavLocale } from '@/lib/navigation';

/**
 * One section of a page: a title, the sentence explaining why it matters, and
 * exactly one artifact. Section 2 rules 3 and 6.
 *
 * The `state` prop exists because "renders nothing when the API is down" is a
 * bug, not a state. Making empty / loading / error cheap to express is the only
 * reliable way to get them written.
 */

export type PanelState = 'ready' | 'loading' | 'empty' | 'error';

const COPY = {
  zh: { loading: '加载中', empty: '暂无数据', error: '数据暂不可用' },
  de: { loading: 'Wird geladen', empty: 'Keine Daten', error: 'Daten nicht verfügbar' },
  en: { loading: 'Loading', empty: 'No data', error: 'Data unavailable' }
} as const satisfies Record<NavLocale, { loading: string; empty: string; error: string }>;

export function Panel({
  title,
  why,
  state = 'ready',
  stateDetail,
  action,
  locale = 'zh',
  children
}: {
  title: string;
  /** One sentence: why a reader should care about this section. */
  why?: string;
  state?: PanelState;
  /** Why it is empty or broken. Required reading when state is empty or error. */
  stateDetail?: string;
  action?: ReactNode;
  locale?: NavLocale;
  children: ReactNode;
}) {
  const copy = COPY[locale];

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-ink">{title}</h2>
          {why ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{why}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="mt-5">
        {state === 'ready' ? (
          children
        ) : (
          <PanelPlaceholder
            state={state}
            label={state === 'loading' ? copy.loading : state === 'empty' ? copy.empty : copy.error}
            detail={stateDetail}
          />
        )}
      </div>
    </section>
  );
}

function PanelPlaceholder({
  state,
  label,
  detail
}: {
  state: Exclude<PanelState, 'ready'>;
  label: string;
  detail?: string;
}) {
  // Loading and empty are neutral; error is a problem and is coloured like one.
  const tone =
    state === 'error'
      ? 'border-danger bg-danger-soft text-danger'
      : 'border-line bg-surface-muted text-muted';

  return (
    <div
      role={state === 'error' ? 'alert' : 'status'}
      aria-busy={state === 'loading' || undefined}
      className={`rounded-xl border px-4 py-6 text-sm ${tone}`}
    >
      <p className="font-medium">{label}</p>
      {detail ? <p className="mt-1 leading-6">{detail}</p> : null}
    </div>
  );
}
