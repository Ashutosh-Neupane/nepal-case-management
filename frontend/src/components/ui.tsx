import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ALERT_STATUS, CASE_STATUS, PRIORITY } from '@/lib/format';
import type { AlertStatus, CaseStatus, Priority } from '@/lib/types';

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>{children}</span>;
}

export const CaseStatusBadge = ({ status }: { status: CaseStatus }) => <Badge tone={CASE_STATUS[status].tone}>{CASE_STATUS[status].label}</Badge>;
export const AlertStatusBadge = ({ status }: { status: AlertStatus }) => <Badge tone={ALERT_STATUS[status].tone}>{ALERT_STATUS[status].label}</Badge>;

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge tone={PRIORITY[priority].tone}>
      {priority === 'CRITICAL' && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-crimson-600" />}
      {PRIORITY[priority].label}
    </Badge>
  );
}

export const PepBadge = () => <Badge tone="bg-violet-50 text-violet-800 ring-violet-200">PEP</Badge>;

/** Risk score 0–100 as a short bar plus number. */
export function Score({ value }: { value: number }) {
  const tone = value >= 75 ? 'bg-crimson-600' : value >= 60 ? 'bg-orange-500' : 'bg-brand-500';
  return (
    <span className="inline-flex items-center gap-2" title={`Risk score ${value} of 100`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="font-mono text-xs tabular-nums text-slate-700">{value}</span>
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && <Link to={back.to} className="mb-2 inline-block text-sm text-slate-500 hover:text-brand-700">← {back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ title, actions, children, className = '' }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card min-w-0 ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-12 text-center text-sm text-slate-500">{children}</div>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="rounded-lg bg-crimson-50 px-3 py-2 text-sm text-crimson-700">{error instanceof Error ? error.message : String(error)}</p>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title} className="card w-full max-w-lg shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
        </header>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>{from}–{Math.min(total, page * pageSize)} of {total}</span>
      <div className="flex gap-2">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, hint, tone = 'text-slate-900', to }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; to?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </>
  );
  return to
    ? <Link to={to} className="card block p-5 transition hover:border-brand-200 hover:shadow">{body}</Link>
    : <div className="card p-5">{body}</div>;
}
