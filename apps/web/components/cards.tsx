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
    <article className="js-panel">
      <div className="js-panel-heading">
        <h3 className="js-panel-title">{title}</h3>
        {subtitle ? <p className="js-panel-subtitle">{subtitle}</p> : null}
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
  const valueClass = `js-metric-value tabular-nums ${valueClassName ?? ''}`;
  const canLinkValue = valueHref && !cardHref;
  const content = (
    <>
      <p className="js-metric-label">{label}</p>
      {canLinkValue ? (
        <a href={valueHref} className={`${valueClass} underline decoration-accent/40 hover:decoration-accent`}>
          {value}
        </a>
      ) : (
        <strong className={valueClass}>{value}</strong>
      )}
      <span className="js-metric-hint">{hint}</span>
    </>
  );

  if (cardHref) {
    return (
      <a
        href={cardHref}
        className="js-metric-card js-metric-card-link"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="js-metric-card">
      {content}
    </div>
  );
}
