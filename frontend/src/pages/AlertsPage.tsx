import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertStatusBadge, Badge, Empty, PageHeader, Pagination, PepBadge, Score, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { isStaff, useAuth } from '@/lib/auth';
import { ALERT_STATUS, bsDate, relative, RULE_LABEL } from '@/lib/format';
import type { AlertRow, AlertStatus, Entity, Page } from '@/lib/types';

const TYPE_LABEL = { STR: 'STR', TTR: 'Threshold', RULE: 'Rule' } as const;

export function AlertsPage() {
  const { user } = useAuth();
  const staff = isStaff(user);
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? (staff ? 'NEW' : '');
  const filters = { status, type: params.get('type') ?? '', entityId: params.get('entityId') ?? '', q: params.get('q') ?? '', page: Number(params.get('page') ?? 1) };

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'status' && !value) next.set('status', '');
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', filters],
    queryFn: () => api.get<Page<AlertRow>>('/alerts', filters),
    placeholderData: keepPreviousData,
  });
  const { data: entities } = useQuery({ queryKey: ['entities'], queryFn: () => api.get<Entity[]>('/admin/entities'), enabled: staff });

  return (
    <>
      <PageHeader
        title={staff ? 'Alert queue' : 'Reports from your institution'}
        subtitle={staff ? 'Highest risk first. Triage each alert as a false positive or escalate it to a case.' : 'Reports your officers filed and alerts raised on your customers’ transactions.'}
      />

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(['NEW', 'ESCALATED', 'FALSE_POSITIVE', ''] as const).map((s) => (
            <button
              key={s || 'all'}
              onClick={() => set('status', s)}
              className={`rounded-md px-3 py-1.5 font-medium ${status === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {s ? ALERT_STATUS[s as AlertStatus].label : 'All'}
            </button>
          ))}
        </div>
        <select className="input h-9 w-auto" value={filters.type} onChange={(e) => set('type', e.target.value)} aria-label="Alert type">
          <option value="">All types</option>
          <option value="STR">Suspicious transaction reports</option>
          <option value="TTR">Threshold reports</option>
          <option value="RULE">Detection rules</option>
        </select>
        {staff && (
          <select className="input h-9 w-auto" value={filters.entityId} onChange={(e) => set('entityId', e.target.value)} aria-label="Reporting institution">
            <option value="">All institutions</option>
            {entities?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <input className="input h-9 min-w-[12rem] flex-1" placeholder="Search reference, summary or name" defaultValue={filters.q}
          onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value.trim())} aria-label="Search alerts" />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? <Spinner /> : !data?.rows.length ? <Empty>No alerts match these filters.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Alert</th>
                  <th className="th">Subject</th>
                  <th className="th">Reason</th>
                  {staff && <th className="th">Institution</th>}
                  <th className="th">Risk</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((a) => (
                  <tr key={a.id} className="group hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <Link to={`/alerts/${encodeURIComponent(a.reference)}`} className="font-mono text-xs font-semibold text-brand-700 group-hover:underline">{a.reference}</Link>
                      <span className="block text-xs text-slate-400" title={bsDate(a.createdAt)}>{relative(a.createdAt)}</span>
                    </td>
                    <td className="td">
                      <span className="flex items-center gap-2 font-medium">{a.subject.name}{a.subject.isPep && <PepBadge />}</span>
                    </td>
                    <td className="td max-w-sm">
                      <span className="mb-1 flex gap-1.5">
                        <Badge tone="bg-white text-slate-600 ring-slate-200">{TYPE_LABEL[a.type]}</Badge>
                        {a.ruleCode && a.type === 'RULE' && <Badge tone="bg-white text-slate-600 ring-slate-200">{RULE_LABEL[a.ruleCode] ?? a.ruleCode}</Badge>}
                      </span>
                      <span className="line-clamp-2 text-slate-600">{a.summary}</span>
                    </td>
                    {staff && <td className="td whitespace-nowrap text-slate-600">{a.entity.code}</td>}
                    <td className="td"><Score value={a.score} /></td>
                    <td className="td"><AlertStatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set('page', String(p))} />}
      </div>
    </>
  );
}
