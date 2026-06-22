import type { ReactNode } from "react";
export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="page-title rich-title">
      <span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </span>
      {action}
    </header>
  );
}

export function InlinePage({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <section className="center-page page-fade">
      <div className="main-column compact">
        <h1>{title}</h1>
        {detail && <p className="muted">{detail}</p>}
        {action}
      </div>
    </section>
  );
}

export function InlineState({ title, detail }: { title: string; detail: string }) {
  return (
    <article className="inline-state">
      <strong>{title}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <article className="empty-state">
      <strong>{title}</strong>
      <small>{detail}</small>
      {action}
    </article>
  );
}
