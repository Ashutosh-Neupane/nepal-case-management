import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AGENCY } from '@/lib/format';
import type { Agency, CaseDetail, CaseStatus, Recommendation } from '@/lib/types';
import { ErrorText, Field, Modal } from './ui';

type Dialog = null | 'submit' | 'approve' | 'return' | 'close';

export function useCaseMutation(c: CaseDetail) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body, method = 'post' }: { path: string; body: unknown; method?: 'post' | 'patch' }) =>
      api[method](`/cases/${c.id}${path}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case'] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/** The buttons the signed-in officer may use on this case, following the workflow on the server. */
export function CaseActions({ c }: { c: CaseDetail }) {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<Dialog>(null);
  const mutation = useCaseMutation(c);
  const me = user!;
  const supervisor = me.role === 'SUPERVISOR';
  const assignee = c.assignee?.id === me.id;
  const move = (to: CaseStatus, extra: Record<string, unknown> = {}) =>
    mutation.mutateAsync({ path: '/transition', body: { to, ...extra } }).then(() => setDialog(null));

  const buttons: JSX.Element[] = [];
  if (c.status === 'OPEN' && !c.assignee && me.role === 'ANALYST') {
    buttons.push(<button key="take" className="btn-primary" disabled={mutation.isPending}
      onClick={() => mutation.mutate({ path: '', body: { assigneeId: me.id }, method: 'patch' })}>Take this case</button>);
  }
  if (c.status === 'OPEN' && c.assignee && (assignee || supervisor)) {
    buttons.push(<button key="start" className="btn-primary" disabled={mutation.isPending} onClick={() => move('UNDER_INVESTIGATION')}>Start investigation</button>);
  }
  if (c.status === 'UNDER_INVESTIGATION' && assignee) {
    buttons.push(<button key="submit" className="btn-primary" onClick={() => setDialog('submit')}>Submit for approval</button>);
  }
  if (c.status === 'PENDING_APPROVAL' && supervisor && c.submittedById !== me.id) {
    buttons.push(<button key="return" className="btn-secondary" onClick={() => setDialog('return')}>Return to analyst</button>);
    buttons.push(<button key="approve" className="btn-primary" onClick={() => setDialog('approve')}>
      {c.recommendation === 'DISSEMINATE' ? `Approve and send to ${AGENCY[c.agency!].short}` : 'Approve closure'}
    </button>);
  }
  if ((c.status === 'OPEN' || c.status === 'UNDER_INVESTIGATION') && supervisor) {
    buttons.push(<button key="close" className="btn-secondary" onClick={() => setDialog('close')}>Close case</button>);
  }

  return (
    <>
      {buttons}
      {mutation.error && !dialog && <div className="w-full"><ErrorText error={mutation.error} /></div>}
      {dialog === 'submit' && <SubmitDialog onClose={() => setDialog(null)} busy={mutation.isPending} error={mutation.error}
        onSubmit={(recommendation, agency, note) => move('PENDING_APPROVAL', { recommendation, agency, note })} />}
      {dialog === 'approve' && (
        <NoteDialog
          title={c.recommendation === 'DISSEMINATE' ? 'Approve dissemination' : 'Approve closure'}
          intro={c.recommendation === 'DISSEMINATE'
            ? `The case and its findings will be sent to the ${AGENCY[c.agency!].name}. This cannot be undone.`
            : 'The case will be closed on the analyst’s recommendation. This cannot be undone.'}
          label="Comment (optional)" required={false} confirm="Approve" busy={mutation.isPending} error={mutation.error}
          onClose={() => setDialog(null)}
          onSubmit={(note) => move(c.recommendation === 'DISSEMINATE' ? 'DISSEMINATED' : 'CLOSED', { note })}
        />
      )}
      {dialog === 'return' && (
        <NoteDialog title="Return to analyst" intro="The case goes back to investigation. Say what more is needed." label="What is needed"
          confirm="Return case" busy={mutation.isPending} error={mutation.error} onClose={() => setDialog(null)}
          onSubmit={(note) => move('UNDER_INVESTIGATION', { note })} />
      )}
      {dialog === 'close' && (
        <NoteDialog title="Close case" intro="Close this case without dissemination, for example a duplicate or a confirmed legitimate source of funds." label="Reason"
          confirm="Close case" danger busy={mutation.isPending} error={mutation.error} onClose={() => setDialog(null)}
          onSubmit={(note) => move('CLOSED', { note })} />
      )}
    </>
  );
}

function SubmitDialog({ onClose, onSubmit, busy, error }: {
  onClose: () => void; onSubmit: (r: Recommendation, a: Agency | undefined, note: string) => void; busy: boolean; error: unknown;
}) {
  const [recommendation, setRecommendation] = useState<Recommendation>('DISSEMINATE');
  const [agency, setAgency] = useState<Agency>('DMLI');
  const [note, setNote] = useState('');
  return (
    <Modal title="Submit for approval" onClose={onClose} footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={busy || note.trim().length < 20}
        onClick={() => onSubmit(recommendation, recommendation === 'DISSEMINATE' ? agency : undefined, note)}>Submit</button>
    </>}>
      <p className="text-sm text-slate-600">A supervisor other than you will review your recommendation.</p>
      <div className="grid grid-cols-2 gap-2">
        {(['DISSEMINATE', 'CLOSE'] as const).map((r) => (
          <label key={r} className={`cursor-pointer rounded-lg border p-3 text-sm ${recommendation === r ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
            <input type="radio" className="mr-2 accent-brand-700" checked={recommendation === r} onChange={() => setRecommendation(r)} />
            {r === 'DISSEMINATE' ? 'Send to an agency' : 'Close the case'}
          </label>
        ))}
      </div>
      {recommendation === 'DISSEMINATE' && (
        <Field label="Agency">
          <select className="input" value={agency} onChange={(e) => setAgency(e.target.value as Agency)}>
            {(Object.keys(AGENCY) as Agency[]).map((a) => <option key={a} value={a}>{AGENCY[a].name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Findings" hint="At least 20 characters. This becomes part of the case record.">
        <textarea className="textarea" rows={5} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={error} />
    </Modal>
  );
}

function NoteDialog({ title, intro, label, confirm, onClose, onSubmit, busy, error, required = true, danger }: {
  title: string; intro: string; label: string; confirm: string; onClose: () => void; onSubmit: (note: string) => void;
  busy: boolean; error: unknown; required?: boolean; danger?: boolean;
}) {
  const [note, setNote] = useState('');
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy || (required && !note.trim())} onClick={() => onSubmit(note)}>{confirm}</button>
    </>}>
      <p className="text-sm text-slate-600">{intro}</p>
      <Field label={label}><textarea className="textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <ErrorText error={error} />
    </Modal>
  );
}
