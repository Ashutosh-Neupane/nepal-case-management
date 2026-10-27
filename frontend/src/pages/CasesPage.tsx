import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CaseStatusBadge, Empty, PageHeader, Pagination, PepBadge, PriorityBadge, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { bsDate, CASE_STATUS, PRIORITY, relative, TYPOLOGY } from '@/lib/format';
import type { CaseRow, CaseStatus, Page, Priority, Typology } from '@/lib/types';

const TABS: { value: string; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING_APPROVAL', label: CASE_STATUS.PENDING_APPROVAL.label },
  { value: 'DISSEMINATED', label: CASE_STATUS.DISSEMINATED.label },
  { value: 'CLOSED', label: CASE_STATUS.CLOSED.label },
  { value: '', label: 'All' },
];

const FINISHED: CaseStatus[] = ['DISSEMINATED', 'CLOSED'];

export function CasesPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    status: params.get('status') ?? 'ACTIVE',
    assignee: params.get('assignee') ?? '',
    priority: params.get('priority') ?? '',
    typology: params.get('typology') ?? '',
    overdue: params.get('overdue') ?? '',
    q: params.get('q') ?? '',
    page: Number(params.get('page') ?? 1),
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (!value && key !== 'status') next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const { data, isLoading } = useQuery({
    queryKey: ['cases', filters],
    queryFn: () => api.get<Page<CaseRow>>('/cases', filters),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Cases" subtitle="Investigations opened from alerts, ordered by deadline." />

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-wrap rounded-lg bg-slate-100 p-1 text-sm">
          {TABS.map((t) => (
            <button key={t.value || 'all'} onClick={() => set('status', t.value)}
              className={`rounded-md px-3 py-1.5 font-medium ${filters.status === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select className="input h-9 w-auto" value={filters.assignee} onChange={(e) => set('assignee', e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
        </select>
        <select className="input h-9 w-auto" value={filters.priority} onChange={(e) => set('priority', e.target.value)} aria-label="Priority">
          <option value="">Any priority</option>
          {(Object.keys(PRIORITY) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}
        </select>
        <select className="input h-9 w-auto" value={filters.typology} onChange={(e) => set('typology', e.target.value)} aria-label="Typology">
          <option value="">Any typology</option>
          {(Object.keys(TYPOLOGY) as Typology[]).map((t) => <option key={t} value={t}>{TYPOLOGY[t]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-brand-700" checked={filters.overdue === '1'} onChange={(e) => set('overdue', e.target.checked ? '1' : '')} />
          Overdue only
        </label>
        <input className="input h-9 min-w-[12rem] flex-1" placeholder="Search reference, title or subject" defaultValue={filters.q}
          onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value.trim())} aria-label="Search cases" />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <Spinner /> : !data?.rows.length ? <Empty>No cases match these filters.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Case</th>
                  <th className="th">Subjects</th>
                  <th className="th">Priority</th>
                  <th className="th">Status</th>
                  <th className="th">Analyst</th>
                  <th className="th text-right">Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((c) => {
                  const late = !FINISHED.includes(c.status) && new Date(c.dueAt) < new Date();
                  return (
                    <tr key={c.id} className="group hover:bg-slate-50">
                      <td className="td max-w-md">
                        <Link to={`/cases/${encodeURIComponent(c.reference)}`} className="font-mono text-xs font-semibold text-brand-700 group-hover:underline">{c.reference}</Link>
                        <span className="block font-medium text-slate-900">{c.title}</span>
                        <span className="text-xs text-slate-500">{TYPOLOGY[c.typology]} · {c._count.alerts} alert{c._count.alerts === 1 ? '' : 's'}</span>
                      </td>
                      <td className="td">
                        {c.subjects.map(({ subject }) => (
                          <span key={subject.id} className="flex items-center gap-1.5 text-slate-700">{subject.name}{subject.isPep && <PepBadge />}</span>
                        ))}
                      </td>
                      <td className="td"><PriorityBadge priority={c.priority} /></td>
                      <td className="td"><CaseStatusBadge status={c.status} /></td>
                      <td className="td text-slate-700">{c.assignee?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                      <td className="td whitespace-nowrap text-right">
                        {FINISHED.includes(c.status) ? <span className="text-slate-400">—</span> : (
                          <>
                            <span className={late ? 'font-semibold text-crimson-700' : 'text-slate-700'}>{bsDate(c.dueAt)}</span>
                            <span className={`block text-xs ${late ? 'text-crimson-700' : 'text-slate-400'}`}>{late ? 'Overdue' : relative(c.dueAt)}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', String(p))} />}
      </div>
    </>
  );
}
