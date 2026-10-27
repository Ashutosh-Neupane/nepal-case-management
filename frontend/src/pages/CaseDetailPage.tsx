import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CaseActions, useCaseMutation } from '@/components/CaseActions';
import { TransactionsTable } from '@/components/TransactionsTable';
import { AlertStatusBadge, Badge, CaseStatusBadge, Empty, ErrorText, PageHeader, PepBadge, PriorityBadge, Score, Section, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AGENCY, bsDate, bsDateTime, CASE_STATUS, PRIORITY, relative, rupeesShort, RULE_LABEL, TYPOLOGY } from '@/lib/format';
import type { AuditEvent, CaseDetail, CaseStatus, Person, Priority, Typology } from '@/lib/types';

const STEPS: { status: CaseStatus[]; label: string }[] = [
  { status: ['OPEN'], label: 'Opened' },
  { status: ['UNDER_INVESTIGATION'], label: 'Investigation' },
  { status: ['PENDING_APPROVAL'], label: 'Supervisor review' },
  { status: ['DISSEMINATED', 'CLOSED'], label: 'Decision' },
];

function Stepper({ c }: { c: CaseDetail }) {
  const current = STEPS.findIndex((s) => s.status.includes(c.status));
  return (
    <ol className="card mb-6 grid grid-cols-4 overflow-hidden text-xs sm:text-sm">
      {STEPS.map((s, i) => {
        const done = i < current || (i === 3 && current === 3);
        const active = i === current && i !== 3;
        const label = i === 3 && current === 3 ? CASE_STATUS[c.status].label : s.label;
        return (
          <li key={s.label} className={`flex items-center gap-2 border-r border-slate-100 px-3 py-3 last:border-r-0 sm:px-5 ${active ? 'bg-brand-50' : ''}`}>
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${done ? 'bg-brand-700 text-white' : active ? 'bg-white text-brand-700 ring-2 ring-brand-700' : 'bg-slate-100 text-slate-400'}`}>
              {done ? '✓' : i + 1}
            </span>
            <span className={`truncate font-medium ${active ? 'text-brand-800' : done ? 'text-slate-800' : 'text-slate-400'} max-sm:hidden`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Decision({ c }: { c: CaseDetail }) {
  if (c.status === 'PENDING_APPROVAL') {
    return (
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
        <p className="font-semibold">
          Recommendation: {c.recommendation === 'DISSEMINATE' ? `send to the ${AGENCY[c.agency!].name}` : 'close the case'}
        </p>
        <p className="mt-1 text-amber-800">Waiting for a supervisor who did not submit it. The findings are in the notes below.</p>
      </div>
    );
  }
  if (c.status === 'DISSEMINATED') {
    return (
      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
        <p className="font-semibold">Sent to the {AGENCY[c.agency!].name}</p>
        <p className="mt-1">on {bsDateTime(c.disseminatedAt)}</p>
      </div>
    );
  }
  if (c.status === 'CLOSED') {
    return (
      <div className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm">
        <p className="font-semibold text-slate-800">Closed {bsDate(c.closedAt)}</p>
        {c.closureReason && <p className="mt-1 text-slate-600">{c.closureReason}</p>}
      </div>
    );
  }
  return null;
}

function describe(e: AuditEvent): string {
  const d = (e.detail ?? {}) as Record<string, string>;
  switch (e.action) {
    case 'case.opened': return 'opened the case';
    case 'alert.escalated': return `added alert ${d.alert ?? ''}`.trim();
    case 'case.status': {
      if (d.to === 'PENDING_APPROVAL') return `submitted for approval, recommending ${d.recommendation === 'DISSEMINATE' ? `dissemination to ${AGENCY[d.agency as keyof typeof AGENCY]?.short ?? d.agency}` : 'closure'}`;
      if (d.to === 'UNDER_INVESTIGATION' && d.from === 'PENDING_APPROVAL') return 'returned the case for more work';
      if (d.to === 'UNDER_INVESTIGATION') return 'started the investigation';
      if (d.to === 'DISSEMINATED') return `approved dissemination to ${AGENCY[d.agency as keyof typeof AGENCY]?.short ?? 'the agency'}`;
      if (d.to === 'CLOSED') return 'closed the case';
      return `moved the case to ${d.to}`;
    }
    case 'case.updated':
      if ('assigneeId' in d) return d.assigneeId ? 'assigned the case' : 'unassigned the case';
      if ('priority' in d) return `set priority to ${PRIORITY[d.priority as Priority]?.label ?? d.priority}`;
      return 'updated case details';
    case 'task.added': return `added task “${d.title}”`;
    case 'task.done': return `completed “${d.title}”`;
    case 'task.reopened': return `reopened “${d.title}”`;
    case 'subject.linked': return 'linked a subject';
    default: return e.action;
  }
}

function Timeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <Empty>No activity yet.</Empty>;
  return (
    <ol className="relative space-y-4 px-5 py-4">
      <span aria-hidden className="absolute bottom-6 left-[1.6rem] top-6 w-px bg-slate-200" />
      {[...events].reverse().map((e) => (
        <li key={e.id} className="relative flex gap-3 text-sm">
          <span className="relative mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600 ring-4 ring-white" />
          <div>
            <p className="text-slate-700"><span className="font-medium text-slate-900">{e.actor?.name ?? 'System'}</span> {describe(e)}</p>
            <p className="text-xs text-slate-400" title={bsDateTime(e.createdAt)}>{relative(e.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Notes({ c, canWrite }: { c: CaseDetail; canWrite: boolean }) {
  const [body, setBody] = useState('');
  const mutation = useCaseMutation(c);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ path: '/notes', body: { body } }, { onSuccess: () => setBody('') });
  };
  return (
    <Section title={`Notes · ${c.notes.length}`}>
      {c.notes.length ? (
        <ul className="divide-y divide-slate-100">
          {c.notes.map((n) => (
            <li key={n.id} className="px-5 py-4">
              <p className="text-xs text-slate-500"><span className="font-semibold text-slate-800">{n.author.name}</span>{n.author.designation && ` · ${n.author.designation}`} · {bsDateTime(n.createdAt)}</p>
              <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{n.body}</p>
            </li>
          ))}
        </ul>
      ) : <Empty>No notes yet.</Empty>}
      {canWrite && (
        <form onSubmit={submit} className="space-y-2 border-t border-slate-100 p-4">
          <textarea className="textarea" rows={3} placeholder="Add a note for the case record" value={body} onChange={(e) => setBody(e.target.value)} aria-label="New note" />
          <ErrorText error={mutation.error} />
          <div className="flex justify-end"><button className="btn-primary btn-sm" disabled={!body.trim() || mutation.isPending}>Add note</button></div>
        </form>
      )}
    </Section>
  );
}

function Tasks({ c, canWrite }: { c: CaseDetail; canWrite: boolean }) {
  const [title, setTitle] = useState('');
  const mutation = useCaseMutation(c);
  const open = c.tasks.filter((t) => !t.doneAt).length;
  return (
    <Section title={`Tasks · ${open} open`}>
      {c.tasks.length ? (
        <ul className="divide-y divide-slate-100">
          {c.tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-5 py-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={!!t.doneAt} disabled={!canWrite || mutation.isPending}
                onChange={(e) => mutation.mutate({ path: `/tasks/${t.id}`, body: { done: e.target.checked }, method: 'patch' })} aria-label={t.title} />
              <div className="min-w-0">
                <p className={t.doneAt ? 'text-slate-400 line-through' : 'text-slate-800'}>{t.title}</p>
                <p className="text-xs text-slate-400">
                  {t.assignee?.name ?? 'Unassigned'}{t.dueAt && !t.doneAt ? ` · due ${bsDate(t.dueAt)}` : ''}{t.doneAt ? ` · done ${bsDate(t.doneAt)}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty>No tasks.</Empty>}
      {canWrite && (
        <form className="flex gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate({ path: '/tasks', body: { title, assigneeId: c.assignee?.id } }, { onSuccess: () => setTitle('') }); }}>
          <input className="input h-9" placeholder="e.g. Request KYC file from the bank" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task" />
          <button className="btn-secondary btn-sm h-9" disabled={title.trim().length < 3 || mutation.isPending}>Add</button>
        </form>
      )}
    </Section>
  );
}

function Details({ c, editable, supervisor }: { c: CaseDetail; editable: boolean; supervisor: boolean }) {
  const mutation = useCaseMutation(c);
  const { data: investigators } = useQuery({
    queryKey: ['investigators'],
    queryFn: () => api.get<(Person & { role: string })[]>('/admin/investigators'),
    enabled: supervisor && editable,
  });
  const patch = (body: Record<string, unknown>) => mutation.mutate({ path: '', body, method: 'patch' });
  const late = editable && new Date(c.dueAt) < new Date();

  return (
    <Section title="Details">
      <dl className="divide-y divide-slate-100 text-sm">
        <Item label="Priority">
          {editable && supervisor ? (
            <select className="input h-8 w-36 text-xs" value={c.priority} onChange={(e) => patch({ priority: e.target.value })} aria-label="Priority">
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </select>
          ) : <PriorityBadge priority={c.priority} />}
        </Item>
        <Item label="Typology">
          {editable ? (
            <select className="input h-8 w-44 text-xs" value={c.typology} onChange={(e) => patch({ typology: e.target.value as Typology })} aria-label="Typology">
              {(Object.keys(TYPOLOGY) as Typology[]).map((t) => <option key={t} value={t}>{TYPOLOGY[t]}</option>)}
            </select>
          ) : TYPOLOGY[c.typology]}
        </Item>
        <Item label="Analyst">
          {editable && supervisor ? (
            <select className="input h-8 w-44 text-xs" value={c.assignee?.id ?? ''} onChange={(e) => patch({ assigneeId: e.target.value || null })} aria-label="Assigned analyst">
              <option value="">Unassigned</option>
              {investigators?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          ) : c.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}
        </Item>
        <Item label="Deadline">
          {editable
            ? <span className={late ? 'font-semibold text-crimson-700' : ''}>{bsDate(c.dueAt)}<span className="block text-right text-xs font-normal text-slate-400">{late ? 'Overdue' : relative(c.dueAt)}</span></span>
            : <span className="text-slate-400">—</span>}
        </Item>
        <Item label="Opened">{bsDate(c.createdAt)}</Item>
      </dl>
      {mutation.error && <div className="p-3"><ErrorText error={mutation.error} /></div>}
    </Section>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 px-5 py-2.5"><dt className="text-slate-500">{label}</dt><dd className="text-right">{children}</dd></div>;
}

export function CaseDetailPage() {
  const { reference } = useParams();
  const { user } = useAuth();
  const { data: c, isLoading, error } = useQuery({ queryKey: ['case', reference], queryFn: () => api.get<CaseDetail>(`/cases/${encodeURIComponent(reference!)}`) });
  if (isLoading) return <Spinner />;
  if (!c) return <ErrorText error={error ?? 'Case not found.'} />;

  const active = ['OPEN', 'UNDER_INVESTIGATION', 'PENDING_APPROVAL'].includes(c.status);
  const supervisor = user!.role === 'SUPERVISOR';
  const canWrite = active && (user!.role === 'ANALYST' || supervisor);
  const transactions = c.alerts.flatMap((a) => a.transactions.map((t) => t.transaction));
  const unique = [...new Map(transactions.map((t) => [t.id, t])).values()];
  const total = unique.reduce((s, t) => s + Number(t.amount), 0);

  return (
    <>
      <PageHeader
        back={{ to: '/cases', label: 'Cases' }}
        title={c.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{c.reference}</span><CaseStatusBadge status={c.status} /><PriorityBadge priority={c.priority} /></span>}
        actions={<CaseActions c={c} />}
      />
      <Stepper c={c} />
      <Decision c={c} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Section title={`Alerts · ${c.alerts.length}`} actions={<span className="text-xs text-slate-500">{unique.length} transactions · {rupeesShort(total)}</span>}>
            <ul className="divide-y divide-slate-100">
              {c.alerts.map((a) => (
                <li key={a.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link to={`/alerts/${encodeURIComponent(a.reference)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{a.reference}</Link>
                    <Badge tone="bg-white text-slate-600 ring-slate-200">{a.type === 'STR' ? 'STR' : RULE_LABEL[a.ruleCode ?? ''] ?? a.type}</Badge>
                    <span className="text-xs text-slate-500">{a.entity.code}</span>
                    <span className="ml-auto flex items-center gap-3"><Score value={a.score} /><AlertStatusBadge status={a.status} /></span>
                  </div>
                  <p className="mt-1 text-slate-700">{a.summary}</p>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Transactions in the alerts"><TransactionsTable rows={unique} /></Section>
          <Notes c={c} canWrite={canWrite} />
        </div>

        <div className="min-w-0 space-y-6">
          <Details c={c} editable={active && (user!.role === 'ANALYST' || supervisor)} supervisor={supervisor} />
          <Section title="Subjects">
            <ul className="divide-y divide-slate-100">
              {c.subjects.map(({ subject: s, role }) => (
                <li key={s.id} className="px-5 py-3 text-sm">
                  <Link to={`/subjects/${s.id}`} className="flex items-center gap-2 font-medium text-slate-900 hover:text-brand-700">{s.name}{s.isPep && <PepBadge />}</Link>
                  <p className="text-xs text-slate-500">{role.charAt(0) + role.slice(1).toLowerCase()} · {s.district ?? '—'} · {s.accounts.length} account{s.accounts.length === 1 ? '' : 's'}</p>
                </li>
              ))}
            </ul>
          </Section>
          <Tasks c={c} canWrite={canWrite} />
          <Section title="Activity"><Timeline events={c.events} /></Section>
        </div>
      </div>
    </>
  );
}
