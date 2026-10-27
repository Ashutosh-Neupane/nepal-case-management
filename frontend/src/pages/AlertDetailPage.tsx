import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TransactionsTable } from '@/components/TransactionsTable';
import { AlertStatusBadge, CaseStatusBadge, ErrorText, Field, Modal, PageHeader, PepBadge, Score, Section, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { isStaff, useAuth } from '@/lib/auth';
import { bsDate, bsDateTime, PRIORITY, rupees, RULE_LABEL, TYPOLOGY } from '@/lib/format';
import type { AlertDetail, CaseRow, Page, Priority, Typology } from '@/lib/types';

type Decision = 'FALSE_POSITIVE' | 'NEW_CASE' | 'LINK_CASE';

function TriageModal({ alert, onClose }: { alert: AlertDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [decision, setDecision] = useState<Decision>(alert.score >= 60 ? 'NEW_CASE' : 'FALSE_POSITIVE');
  const [note, setNote] = useState('');
  const [title, setTitle] = useState(`${alert.subject.name}: ${RULE_LABEL[alert.ruleCode ?? 'STR'] ?? 'suspicious activity'}`.slice(0, 150));
  const [priority, setPriority] = useState<Priority>(alert.score >= 75 ? 'HIGH' : 'MEDIUM');
  const [typology, setTypology] = useState<Typology>(alert.ruleCode === 'STRUCTURING' ? 'STRUCTURING' : 'OTHER');
  const [caseId, setCaseId] = useState('');

  const { data: openCases } = useQuery({
    queryKey: ['cases', 'active-picker'],
    queryFn: () => api.get<Page<CaseRow>>('/cases', { status: 'ACTIVE', pageSize: 100 }),
    enabled: decision === 'LINK_CASE',
  });

  const triage = useMutation({
    mutationFn: () => api.post<{ caseId?: string }>(`/alerts/${alert.id}/triage`, {
      decision,
      note: note.trim() || undefined,
      ...(decision === 'NEW_CASE' && { title, priority, typology }),
      ...(decision === 'LINK_CASE' && { caseId }),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      onClose();
      if (res?.caseId) navigate(`/cases/${res.caseId}`);
    },
  });

  const OPTIONS: { value: Decision; label: string; hint: string }[] = [
    { value: 'NEW_CASE', label: 'Open a new case', hint: 'The activity needs investigation.' },
    { value: 'LINK_CASE', label: 'Add to an existing case', hint: 'The subject is already under investigation.' },
    { value: 'FALSE_POSITIVE', label: 'False positive', hint: 'The activity has a legitimate explanation.' },
  ];
  const valid = decision === 'FALSE_POSITIVE' ? note.trim().length > 0 : decision === 'LINK_CASE' ? !!caseId : title.trim().length >= 5;

  return (
    <Modal
      title={`Triage ${alert.reference}`}
      onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!valid || triage.isPending} onClick={() => triage.mutate()}>{triage.isPending ? 'Saving…' : 'Confirm'}</button>
      </>}
    >
      <fieldset className="space-y-2">
        {OPTIONS.map((o) => (
          <label key={o.value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${decision === o.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
            <input type="radio" name="decision" className="mt-1 accent-brand-700" checked={decision === o.value} onChange={() => setDecision(o.value)} />
            <span><span className="block text-sm font-medium">{o.label}</span><span className="text-xs text-slate-500">{o.hint}</span></span>
          </label>
        ))}
      </fieldset>

      {decision === 'NEW_CASE' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Case title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} /></Field></div>
          <Field label="Priority">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
            </select>
          </Field>
          <Field label="Typology">
            <select className="input" value={typology} onChange={(e) => setTypology(e.target.value as Typology)}>
              {(Object.keys(TYPOLOGY) as Typology[]).map((t) => <option key={t} value={t}>{TYPOLOGY[t]}</option>)}
            </select>
          </Field>
        </div>
      )}
      {decision === 'LINK_CASE' && (
        <Field label="Case">
          <select className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">Choose an active case</option>
            {openCases?.rows.map((c) => <option key={c.id} value={c.id}>{c.reference} · {c.title}</option>)}
          </select>
        </Field>
      )}
      <Field label={decision === 'FALSE_POSITIVE' ? 'Reason (required)' : 'Note'}>
        <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>
      <ErrorText error={triage.error} />
    </Modal>
  );
}

export function AlertDetailPage() {
  const { reference } = useParams();
  const { user } = useAuth();
  const [triaging, setTriaging] = useState(false);
  const { data: alert, isLoading, error } = useQuery({ queryKey: ['alert', reference], queryFn: () => api.get<AlertDetail>(`/alerts/${encodeURIComponent(reference!)}`) });
  if (isLoading) return <Spinner />;
  if (!alert) return <ErrorText error={error ?? 'Alert not found.'} />;

  const txns = alert.transactions.map((t) => t.transaction);
  const credit = txns.filter((t) => t.direction === 'CREDIT').reduce((s, t) => s + Number(t.amount), 0);
  const debit = txns.filter((t) => t.direction === 'DEBIT').reduce((s, t) => s + Number(t.amount), 0);
  const canTriage = alert.status === 'NEW' && (user!.role === 'ANALYST' || user!.role === 'SUPERVISOR');
  const s = alert.subject;

  return (
    <>
      <PageHeader
        back={{ to: '/alerts', label: 'Alerts' }}
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{alert.reference}</span><AlertStatusBadge status={alert.status} /></span>}
        subtitle={<>{alert.type === 'STR' ? 'Suspicious transaction report' : alert.type === 'TTR' ? 'Threshold transaction report' : `Rule: ${RULE_LABEL[alert.ruleCode!] ?? alert.ruleCode}`} · {alert.entity.name} · {bsDateTime(alert.createdAt)}</>}
        actions={canTriage && <button className="btn-primary" onClick={() => setTriaging(true)}>Triage alert</button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Section title="Why this was raised">
            <div className="space-y-4 px-5 py-4">
              <p className="text-slate-800">{alert.summary}</p>
              {alert.narrative && (
                <blockquote className="whitespace-pre-line border-l-2 border-brand-200 pl-4 text-sm text-slate-600">{alert.narrative}</blockquote>
              )}
              <dl className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-sm">
                <div><dt className="text-xs text-slate-500">Risk score</dt><dd className="mt-1"><Score value={alert.score} /></dd></div>
                <div><dt className="text-xs text-slate-500">Credits</dt><dd className="mt-1 font-medium tabular-nums">{rupees(credit)}</dd></div>
                <div><dt className="text-xs text-slate-500">Debits</dt><dd className="mt-1 font-medium tabular-nums">{rupees(debit)}</dd></div>
              </dl>
            </div>
          </Section>
          <Section title={`Transactions · ${txns.length}`}>
            <TransactionsTable rows={txns} />
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          <Section title="Subject" actions={isStaff(user) && <Link to={`/subjects/${s.id}`} className="text-xs font-semibold text-brand-700">Full profile</Link>}>
            <dl className="space-y-3 px-5 py-4 text-sm">
              <div className="flex items-center gap-2 text-base font-semibold">{s.name}{s.isPep && <PepBadge />}</div>
              {s.nameNe && <p className="-mt-2 text-slate-500">{s.nameNe}</p>}
              <Row label={s.kind === 'ORGANIZATION' ? 'PAN' : 'Citizenship no.'} value={s.kind === 'ORGANIZATION' ? s.panNo : s.citizenshipNo} mono />
              {s.kind === 'INDIVIDUAL' && s.panNo && <Row label="PAN" value={s.panNo} mono />}
              {s.dateOfBirth && <Row label="Date of birth" value={bsDate(s.dateOfBirth)} />}
              <Row label="District" value={s.district} />
              <Row label="Occupation" value={s.occupation} />
            </dl>
          </Section>

          {(alert.case || alert.triageNote) && (
            <Section title="Triage">
              <div className="space-y-3 px-5 py-4 text-sm">
                {alert.case && (
                  <Link to={`/cases/${encodeURIComponent(alert.case.reference)}`} className="block rounded-lg border border-slate-200 p-3 hover:border-brand-300">
                    <span className="font-mono text-xs text-slate-500">{alert.case.reference}</span>
                    <span className="block font-medium">{alert.case.title}</span>
                    <span className="mt-2 block"><CaseStatusBadge status={alert.case.status} /></span>
                  </Link>
                )}
                {alert.triageNote && <p className="text-slate-600">{alert.triageNote}</p>}
                {alert.triagedAt && <p className="text-xs text-slate-400">{bsDateTime(alert.triagedAt)}</p>}
              </div>
            </Section>
          )}
        </div>
      </div>

      {triaging && <TriageModal alert={alert} onClose={() => setTriaging(false)} />}
    </>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : ''}`}>{value || '—'}</dd>
    </div>
  );
}
