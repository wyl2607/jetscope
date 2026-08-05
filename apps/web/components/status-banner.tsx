import { ReactNode } from 'react';

type StatusTone = 'success' | 'info' | 'warning' | 'danger';

export function StatusBanner({
  tone,
  label,
  title,
  children,
  detail,
  actions
}: {
  tone: StatusTone;
  label: string;
  title?: string;
  children: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`js-status-banner js-status-banner-${tone}`}>
      <div className="js-status-banner-copy">
        <p className="js-status-banner-label">{label}</p>
        {title ? <h2 className="js-status-banner-title">{title}</h2> : null}
        <div className="js-status-banner-message">{children}</div>
        {detail ? <div className="js-status-banner-detail">{detail}</div> : null}
      </div>
      {actions ? <div className="js-status-banner-actions">{actions}</div> : null}
    </section>
  );
}
