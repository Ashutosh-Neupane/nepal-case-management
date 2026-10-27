import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorText, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { bsDate } from '@/lib/format';

const DEMO = [
  { email: 'analyst@demo.np', label: 'Analyst' },
  { email: 'supervisor@demo.np', label: 'Supervisor' },
  { email: 'adb@demo.np', label: 'Bank compliance officer' },
  { email: 'admin@demo.np', label: 'Administrator' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const showDemo = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === '1';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-10 w-10" />
          <span className="font-semibold">Case Management</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight">From suspicious transaction to disseminated case.</h1>
          <p className="mt-4 max-w-md text-brand-100/80">
            Reports from banks and financial institutions, automatic detection of structuring and rapid movement,
            and a reviewed path for sending intelligence to the investigating agency.
          </p>
        </div>
        <p className="text-sm text-brand-100/60">{bsDate(new Date())} · वित्तीय जानकारी इकाई</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your official account.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Email">
              <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <ErrorText error={error} />
            <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>

          {showDemo && (
            <div className="mt-10 rounded-xl border border-dashed border-slate-300 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts · password Demo@2083</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DEMO.map((d) => (
                  <button key={d.email} type="button" className="btn-secondary btn-sm justify-start" onClick={() => { setEmail(d.email); setPassword('Demo@2083'); }}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
