import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { NetworkGraph } from '@/components/NetworkGraph';
import { TransactionsTable } from '@/components/TransactionsTable';
import { AlertStatusBadge, CaseStatusBadge, Empty, ErrorText, PageHeader, PepBadge, PriorityBadge, Score, Section, Spinner, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { bsDate, relative, rupeesShort } from '@/lib/format';
import type { SubjectProfile } from '@/lib/types';

export function SubjectProfilePage() {
  const { id } = useParams();
  const { data: s, isLoading, error } = useQuery({ queryKey: ['subject', id], queryFn: () => api.get<SubjectProfile>(`/subjects/${id}`) });
  if (isLoading) return <Spinner />;
  if (!s) return <ErrorText error={error ?? 'Subject not found.'} />;

  const transactions = s.accounts.flatMap((a) => a.transactions.map((t) => ({ ...t, account: { accountNo: a.accountNo } })));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const credits = transactions.filter((t) => t.direction === 'CREDIT').length;
  const ids = [
    s.citizenshipNo && `Citizenship ${s.citizenshipNo}`,
    s.panNo && `PAN ${s.panNo}`,
    s.dateOfBirth && `Born ${bsDate(s.dateOfBirth)}`,
    s.district, s.occupation,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        back={{ to: '/subjects', label: 'Subjects' }}
        title={<span className="flex flex-wrap items-center gap-3">{s.name}{s.isPep && <PepBadge />}</span>}
        subtitle={<>{s.nameNe && <span className="mr-2 text-slate-700">{s.nameNe}</span>}{ids.join(' · ')}</>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Money in" value={rupeesShort(s.totals.inflow)} hint={plural(credits, 'credit')} />
        <Stat label="Money out" value={rupeesShort(s.totals.outflow)} hint={plural(transactions.length - credits, 'debit')} />
        <Stat label="Cash" value={rupeesShort(s.totals.cash)} hint="Deposits and withdrawals" />
        <Stat label="Alerts" value={s.alerts.length} hint={plural(s.cases.length, 'case')} />
      </div>

      <Section title="Money flow" className="mt-6">
        <div className="pt-4"><NetworkGraph nodes={s.network.nodes} edges={s.network.edges} focusId={s.id} /></div>
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={`Alerts · ${s.alerts.length}`}>
          {s.alerts.length ? (
            <ul className="divide-y divide-slate-100">
              {s.alerts.map((a) => (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link to={`/alerts/${encodeURIComponent(a.reference)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{a.reference}</Link>
                    <p className="truncate text-slate-700">{a.summary}</p>
                    <p className="text-xs text-slate-400">{relative(a.createdAt)}</p>
                  </div>
                  <Score value={a.score} />
                  <AlertStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          ) : <Empty>No alerts.</Empty>}
        </Section>
        <Section title={`Cases · ${s.cases.length}`}>
          {s.cases.length ? (
            <ul className="divide-y divide-slate-100">
              {s.cases.map(({ case: c }) => (
                <li key={c.id} className="px-5 py-3 text-sm">
                  <Link to={`/cases/${encodeURIComponent(c.reference)}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{c.reference}</Link>
                  <p className="font-medium text-slate-800">{c.title}</p>
                  <p className="mt-1 flex gap-2"><CaseStatusBadge status={c.status} /><PriorityBadge priority={c.priority} /></p>
                </li>
              ))}
            </ul>
          ) : <Empty>Not part of any case.</Empty>}
        </Section>
      </div>

      <Section title={`Accounts · ${s.accounts.length}`} className="mt-6">
        <ul className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4">
          {s.accounts.map((a) => (
            <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="font-mono text-xs font-semibold">{a.accountNo}</span>
              <span className="block text-xs text-slate-500">{a.entity.name}</span>
            </li>
          ))}
        </ul>
        <TransactionsTable rows={transactions} />
      </Section>
    </>
  );
}
