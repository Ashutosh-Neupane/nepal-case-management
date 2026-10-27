import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ErrorText, Field, PageHeader, Section } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';

export function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => { setCurrent(''); setNext(''); setConfirm(''); },
  });
  const mismatch = confirm.length > 0 && confirm !== next;
  const submit = (e: FormEvent) => { e.preventDefault(); change.mutate(); };

  return (
    <div className="max-w-xl">
      <PageHeader title="Your account" subtitle={`${user!.name} · ${ROLE_LABEL[user!.role]}${user!.entity ? ` · ${user!.entity.name}` : ''}`} />
      <Section title="Change password">
        <form onSubmit={submit} className="space-y-4 p-5">
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label="New password" hint="At least 8 characters."><input className="input" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Repeat new password"><input className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          {mismatch && <p className="text-sm text-crimson-700">The passwords do not match.</p>}
          <ErrorText error={change.error} />
          {change.isSuccess && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Password changed.</p>}
          <button className="btn-primary" disabled={mismatch || next.length < 8 || change.isPending}>Change password</button>
        </form>
      </Section>
    </div>
  );
}
