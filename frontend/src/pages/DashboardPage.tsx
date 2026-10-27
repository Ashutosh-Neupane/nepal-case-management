import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CaseStatusBadge, Empty, PageHeader, PriorityBadge, Section, Spinner, Stat } from '@/components/ui';
import { api } from '@/lib/api';
import { isStaff, useAuth } from '@/lib/auth';
import { AGENCY, bsDate, bsShort, relative, RULE_LABEL } from '@/lib/format';
import type { Agency, AlertStatus, CaseStatus, Priority } from '@/lib/types';

interface Summary {
  fiscalYear: string;
  alerts: {
    byStatus: Partial<Record<AlertStatus, number>>;
    byType: Record<string, number>;
    byRule: { rule: string; count: number }[];
    trend: { day: string; count: number }[];
  };
  cases?: {
    byStatus: Partial<Record<CaseStatus, number>>;
    overdue: number;
    mine: number;
    awaitingApproval?: number;
    disseminatedByAgency: { agency: Agency; count: number }[];
    dueSoon: { id: string; reference: string; title: string; status: CaseStatus; priority: Priority; dueAt: string; assignee: { name: string } | null }[];
  };
  reportingEntities?: { code: string; name: string; alerts: number }[];
}

function TrendChart({ data }: { data: Summary['alerts']['trend'] }) {
  return (
    <div className="h-56 px-2 pb-3 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#003893" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#003893" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="day" tickFormatter={bsShort} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={40} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            labelFormatter={(d) => bsShort(String(d))}
            formatter={(v) => [String(v), 'Alerts']}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
          />
          <Area type="monotone" dataKey="count" stroke="#003893" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bars with the value written beside each, one hue. */
function Bars({ rows }: { rows: { label: string; value: number; to?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>Nothing yet.</Empty>;
  return (
    <ul className="space-y-3 px-5 py-4">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm" title={`${r.label}: ${r.value}`}>
          <span className="truncate text-slate-600">{r.label}</span>
          <span className="h-2 rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums text-slate-800">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Summary>('/dashboard') });
  if (isLoading || !data) return <Spinner />;
  const { alerts, cases } = data;
  const staff = isStaff(user);
  const total30 = alerts.trend.reduce((s, d) => s + d.count, 0);
  const active = cases ? (cases.byStatus.OPEN ?? 0) + (cases.byStatus.UNDER_INVESTIGATION ?? 0) + (cases.byStatus.PENDING_APPROVAL ?? 0) : 0;

  return (
    <>
      <PageHeader
        title={`Namaste, ${user!.name.split(' ')[0]}`}
        subtitle={<>{bsDate(new Date())} · Fiscal year {data.fiscalYear}{!staff && user!.entity ? ` · ${user!.entity.name}` : ''}</>}
        actions={!staff && <Link to="/report/str" className="btn-primary">File a suspicious transaction report</Link>}
      />

      {staff && cases ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="New alerts" value={alerts.byStatus.NEW ?? 0} hint="Waiting for triage" to="/alerts?status=NEW" />
          <Stat label="Active cases" value={active} hint={`${cases.mine} assigned to you`} to="/cases?status=ACTIVE" />
          {cases.awaitingApproval !== undefined
            ? <Stat label="Awaiting your approval" value={cases.awaitingApproval} hint="Submitted by analysts" to="/cases?status=PENDING_APPROVAL" />
            : <Stat label="Awaiting approval" value={cases.byStatus.PENDING_APPROVAL ?? 0} hint="With a supervisor" to="/cases?status=PENDING_APPROVAL" />}
          <Stat label="Overdue" value={cases.overdue} hint="Past the investigation deadline" tone={cases.overdue ? 'text-crimson-700' : 'text-slate-900'} to="/cases?overdue=1" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Reports and alerts" value={Object.values(alerts.byType).reduce((a, b) => a + b, 0)} hint="From your institution" to="/alerts" />
          <Stat label="Suspicious transaction reports" value={alerts.byType.STR ?? 0} hint="Filed by your officers" />
          <Stat label="Threshold reports" value={alerts.byType.TTR ?? 0} hint="Cash of Rs 10 lakh or more" />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section title={`Alerts raised, last 30 days · ${total30}`} className="xl:col-span-2">
          <TrendChart data={alerts.trend} />
        </Section>
        <Section title="Alerts by rule, last 30 days">
          <Bars rows={alerts.byRule.map((r) => ({ label: RULE_LABEL[r.rule] ?? r.rule, value: r.count }))} />
        </Section>
      </div>

      {staff && cases && (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Section title="Deadlines" className="xl:col-span-2" actions={<Link to="/cases?status=ACTIVE" className="text-xs font-semibold text-brand-700">All active cases</Link>}>
            {cases.dueSoon.length ? (
              <ul className="divide-y divide-slate-100">
                {cases.dueSoon.map((c) => {
                  const late = new Date(c.dueAt) < new Date();
                  return (
                    <li key={c.id}>
                      <Link to={`/cases/${c.reference}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50">
                        <span className="font-mono text-xs text-slate-500">{c.reference}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                        <PriorityBadge priority={c.priority} />
                        <CaseStatusBadge status={c.status} />
                        <span className={`w-32 text-right text-xs ${late ? 'font-semibold text-crimson-700' : 'text-slate-500'}`}>
                          {late ? `Overdue ${relative(c.dueAt).replace(' ago', '')}` : `Due ${relative(c.dueAt)}`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : <Empty>No active cases.</Empty>}
          </Section>
          <div className="space-y-6">
            <Section title="Alerts by reporting institution">
              <Bars rows={(data.reportingEntities ?? []).map((e) => ({ label: e.name, value: e.alerts }))} />
            </Section>
            <Section title="Sent to agencies">
              <Bars rows={cases.disseminatedByAgency.map((d) => ({ label: AGENCY[d.agency].short, value: d.count }))} />
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
