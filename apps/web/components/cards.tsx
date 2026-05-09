import { ReactNode } from 'react';

export function InfoCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-slate-950">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {children}
    </article>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  valueClassName,
  valueHref,
  cardHref
}: {
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
  valueHref?: string;
  cardHref?: string;
}) {
  const valueClass = `mt-3 block text-3xl font-semibold text-slate-950 ${valueClassName ?? ''}`;
  const canLinkValue = valueHref && !cardHref;
  const content = (
    <>
      <p className="text-sm text-slate-600">{label}</p>
      {canLinkValue ? (
        <a href={valueHref} className={`${valueClass} underline decoration-sky-500/40 hover:decoration-sky-400`}>
          {value}
        </a>
      ) : (
        <strong className={valueClass}>{value}</strong>
      )}
      <span className="mt-2 block text-sm text-slate-600">{hint}</span>
    </>
  );

  if (cardHref) {
    return (
      <a
        href={cardHref}
        className="block rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70 transition hover:border-sky-300 hover:bg-sky-50"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70">
      {content}
    </div>
  );
}
