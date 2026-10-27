import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErrorText, Field, PageHeader, Section } from '@/components/ui';
import { api } from '@/lib/api';
import { bsDate } from '@/lib/format';
import { DISTRICTS } from '@/lib/nepal';

const EMPTY = { kind: 'INDIVIDUAL', name: '', nameNe: '', citizenshipNo: '', panNo: '', dateOfBirth: '', district: '', occupation: '', isPep: false };

export function StrPage() {
  const [subject, setSubject] = useState(EMPTY);
  const [summary, setSummary] = useState('');
  const [narrative, setNarrative] = useState('');
  const [refs, setRefs] = useState('');
  const filing = useMutation({
    mutationFn: () => {
      const clean = Object.fromEntries(Object.entries(subject).filter(([, v]) => v !== '')) as typeof subject;
      return api.post<{ reference: string; linkedTransactions: number }>('/reports/str', {
        subject: clean,
        summary: summary.trim(),
        narrative: narrative.trim(),
        transactionReferences: refs.split(/[\s,]+/).map((r) => r.trim()).filter(Boolean),
      });
    },
  });
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setSubject((s) => ({ ...s, [key]: value }));
  const org = subject.kind === 'ORGANIZATION';

  if (filing.data) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-xl text-emerald-700">✓</div>
        <h1 className="mt-4 text-2xl font-semibold">Report filed</h1>
        <p className="mt-2 text-slate-600">
          Reference <span className="font-mono font-semibold text-slate-900">{filing.data.reference}</span>
          {filing.data.linkedTransactions > 0 && <>, linked to {filing.data.linkedTransactions} transaction{filing.data.linkedTransactions === 1 ? '' : 's'}</>}.
          Keep it for your records. Do not tell the customer about this report.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to={`/alerts/${encodeURIComponent(filing.data.reference)}`} className="btn-secondary">View report</Link>
          <button className="btn-primary" onClick={() => { filing.reset(); setSubject(EMPTY); setSummary(''); setNarrative(''); setRefs(''); }}>File another</button>
        </div>
      </div>
    );
  }

  const submit = (e: FormEvent) => { e.preventDefault(); filing.mutate(); };
  return (
    <>
      <PageHeader title="Suspicious transaction report" subtitle="Report activity you suspect is linked to money laundering or terrorism financing. The customer must not be told." />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="Subject">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="flex gap-2 sm:col-span-2">
                {(['INDIVIDUAL', 'ORGANIZATION'] as const).map((k) => (
                  <label key={k} className={`flex-1 cursor-pointer rounded-lg border p-3 text-sm ${subject.kind === k ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                    <input type="radio" className="mr-2 accent-brand-700" checked={subject.kind === k} onChange={() => set('kind', k)} />
                    {k === 'INDIVIDUAL' ? 'Individual' : 'Company or organization'}
                  </label>
                ))}
              </div>
              <Field label="Name (English)"><input className="input" required minLength={2} value={subject.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="नाम (नेपालीमा)"><input className="input" lang="ne" value={subject.nameNe} onChange={(e) => set('nameNe', e.target.value)} /></Field>
              {!org && <Field label="Citizenship number"><input className="input font-mono" value={subject.citizenshipNo} onChange={(e) => set('citizenshipNo', e.target.value)} placeholder="27-01-71-04512" /></Field>}
              <Field label={org ? 'PAN (required)' : 'PAN'} hint="9 digits">
                <input className="input font-mono" inputMode="numeric" pattern="\d{9}" required={org} value={subject.panNo} onChange={(e) => set('panNo', e.target.value)} />
              </Field>
              {!org && (
                <Field label="Date of birth (AD)" hint={subject.dateOfBirth ? `${bsDate(subject.dateOfBirth)} BS` : undefined}>
                  <input className="input" type="date" value={subject.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
                </Field>
              )}
              <Field label="District">
                <input className="input" list="districts" value={subject.district} onChange={(e) => set('district', e.target.value)} />
                <datalist id="districts">{DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
              </Field>
              <Field label={org ? 'Business' : 'Occupation'}><input className="input" value={subject.occupation} onChange={(e) => set('occupation', e.target.value)} /></Field>
              {!org && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={subject.isPep} onChange={(e) => set('isPep', e.target.checked)} />
                  Politically exposed person, or a family member or close associate of one
                </label>
              )}
            </div>
          </Section>
          <Section title="What you suspect">
            <div className="space-y-4 p-5">
              <Field label="Summary" hint="One line, 10–200 characters.">
                <input className="input" required minLength={10} maxLength={200} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Import invoices do not match goods cleared at customs" />
              </Field>
              <Field label="Grounds for suspicion" hint={`${narrative.trim().length} / at least 30 characters. Say what happened, why it is unusual for this customer, and what they told you.`}>
                <textarea className="textarea" rows={8} required minLength={30} maxLength={5000} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
              </Field>
              <Field label="Transaction references" hint="Optional. References of transactions you already uploaded, separated by commas.">
                <input className="input font-mono" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="KDB-TT-5001, KDB-TT-5002" />
              </Field>
            </div>
          </Section>
        </div>
        <aside className="space-y-4">
          <div className="card space-y-3 p-5 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Before you file</p>
            <p>File as soon as you form a suspicion, and within three days.</p>
            <p>Report even if the transaction did not go ahead.</p>
            <p>Keep the customer file and transaction records ready; an analyst may ask for them.</p>
          </div>
          <ErrorText error={filing.error} />
          <button className="btn-primary w-full" disabled={filing.isPending}>{filing.isPending ? 'Filing…' : 'File report'}</button>
        </aside>
      </form>
    </>
  );
}
