import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, PageHeader, PepBadge, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { Subject } from '@/lib/types';

type Row = Subject & { _count: { alerts: number; cases: number; accounts: number } };

export function SubjectsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const { data, isLoading } = useQuery({ queryKey: ['subjects', q], queryFn: () => api.get<Row[]>('/subjects', { q }), placeholderData: keepPreviousData });

  return (
    <>
      <PageHeader title="Subjects" subtitle="People and organizations reported by institutions. Search by name, citizenship number or PAN." />
      <form className="card mb-4 flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }); }}>
        <input className="input" placeholder="e.g. Adhikari, 27-01-71-04512 or 609874123" value={text} onChange={(e) => setText(e.target.value)} aria-label="Search subjects" />
        <button className="btn-primary">Search</button>
      </form>
      <div className="card overflow-hidden">
        {isLoading ? <Spinner /> : !data?.length ? <Empty>No subjects found.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Identifier</th>
                  <th className="th">District</th>
                  <th className="th text-right">Accounts</th>
                  <th className="th text-right">Alerts</th>
                  <th className="th text-right">Cases</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((s) => (
                  <tr key={s.id} className="group hover:bg-slate-50">
                    <td className="td">
                      <Link to={`/subjects/${s.id}`} className="flex items-center gap-2 font-medium text-slate-900 group-hover:text-brand-700">{s.name}{s.isPep && <PepBadge />}</Link>
                      <span className="text-xs text-slate-500">{s.nameNe ?? ''}{s.nameNe && s.occupation ? ' · ' : ''}{s.occupation ?? ''}</span>
                    </td>
                    <td className="td font-mono text-xs text-slate-600">
                      {s.kind === 'ORGANIZATION' ? `PAN ${s.panNo ?? '—'}` : s.citizenshipNo ?? '—'}
                    </td>
                    <td className="td text-slate-600">{s.district ?? '—'}</td>
                    <td className="td text-right tabular-nums">{s._count.accounts}</td>
                    <td className="td text-right tabular-nums">{s._count.alerts}</td>
                    <td className="td text-right tabular-nums">{s._count.cases || <span className="text-slate-300">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
