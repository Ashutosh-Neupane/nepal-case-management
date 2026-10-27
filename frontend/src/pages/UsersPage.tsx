import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge, Empty, ErrorText, Field, Modal, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';
import type { Entity, Role, User } from '@/lib/types';

const STAFF_ROLES: Role[] = ['ANALYST', 'SUPERVISOR', 'ADMIN'];

function PasswordNotice({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  return (
    <Modal title="Temporary password" onClose={onClose} footer={<button className="btn-primary" onClick={onClose}>Done</button>}>
      <p className="text-sm text-slate-600">Give this password to <span className="font-medium text-slate-900">{email}</span> in person or by phone. It is shown only once; they should change it after signing in.</p>
      <p className="rounded-lg bg-slate-100 px-4 py-3 text-center font-mono text-lg font-semibold tracking-wider">{password}</p>
    </Modal>
  );
}

function AddUser({ onClose, onCreated }: { onClose: () => void; onCreated: (email: string, password: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', name: '', designation: '', role: 'ANALYST' as Role, entityId: '' });
  const { data: entities } = useQuery({ queryKey: ['entities'], queryFn: () => api.get<Entity[]>('/admin/entities') });
  const officer = form.role === 'REPORTING_OFFICER';
  const create = useMutation({
    mutationFn: () => api.post<{ user: User; temporaryPassword: string }>('/admin/users', {
      email: form.email, name: form.name, designation: form.designation || undefined, role: form.role, entityId: officer ? form.entityId : undefined,
    }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['users'] }); onCreated(res.user.email, res.temporaryPassword); },
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  return (
    <Modal title="Add user" onClose={onClose} footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={create.isPending || !form.email || form.name.length < 3 || (officer && !form.entityId)} onClick={() => create.mutate()}>Create user</button>
    </>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Official email"><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>
            {(['ANALYST', 'SUPERVISOR', 'ADMIN', 'REPORTING_OFFICER'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        <Field label="Designation"><input className="input" value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="e.g. Section Officer" /></Field>
        {officer && (
          <div className="sm:col-span-2">
            <Field label="Institution">
              <select className="input" value={form.entityId} onChange={(e) => set('entityId', e.target.value)}>
                <option value="">Choose an institution</option>
                {entities?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>
      <ErrorText error={create.error} />
    </Modal>
  );
}

export function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'staff' | 'officers'>('staff');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ email: string; password: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/admin/users') });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<User> }) => api.patch<User>(`/admin/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const reset = useMutation({
    mutationFn: (u: User) => api.post<{ temporaryPassword: string }>(`/admin/users/${u.id}/reset-password`).then((r) => ({ email: u.email, password: r.temporaryPassword })),
    onSuccess: setNotice,
  });

  const rows = (data ?? []).filter((u) => (tab === 'staff') === (u.role !== 'REPORTING_OFFICER'));
  return (
    <>
      <PageHeader title="Users" subtitle="Unit staff and the compliance officers of reporting institutions." actions={<button className="btn-primary" onClick={() => setAdding(true)}>Add user</button>} />
      <div className="mb-4 flex w-fit rounded-lg bg-slate-100 p-1 text-sm">
        {(['staff', 'officers'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 font-medium ${tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            {t === 'staff' ? 'Unit staff' : 'Institution officers'}
          </button>
        ))}
      </div>
      <ErrorText error={update.error ?? reset.error} />
      <div className="card mt-2 overflow-hidden">
        {isLoading ? <Spinner /> : !rows.length ? <Empty>No users.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">{tab === 'staff' ? 'Role' : 'Institution'}</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'text-slate-400'}>
                    <td className="td">
                      <span className="font-medium text-slate-900">{u.name}</span>{u.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                      <span className="block text-xs text-slate-500">{u.email}{u.designation ? ` · ${u.designation}` : ''}</span>
                    </td>
                    <td className="td">
                      {tab === 'staff' ? (
                        <select className="input h-8 w-40 text-xs" value={u.role} disabled={u.id === me?.id || update.isPending}
                          onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })} aria-label={`Role of ${u.name}`}>
                          {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      ) : <span className="text-slate-700">{u.entity?.name}</span>}
                    </td>
                    <td className="td">
                      {u.active ? <Badge tone="bg-emerald-50 text-emerald-800 ring-emerald-200">Active</Badge> : <Badge tone="bg-slate-100 text-slate-500 ring-slate-200">Deactivated</Badge>}
                    </td>
                    <td className="td whitespace-nowrap text-right">
                      <button className="btn-secondary btn-sm" disabled={reset.isPending} onClick={() => reset.mutate(u)}>Reset password</button>
                      {u.id !== me?.id && (
                        <button className="btn-secondary btn-sm ml-2" disabled={update.isPending} onClick={() => update.mutate({ id: u.id, body: { active: !u.active } })}>
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && <AddUser onClose={() => setAdding(false)} onCreated={(email, password) => { setAdding(false); setNotice({ email, password }); }} />}
      {notice && <PasswordNotice {...notice} onClose={() => setNotice(null)} />}
    </>
  );
}
