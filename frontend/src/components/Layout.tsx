import { NavLink, Outlet } from 'react-router-dom';
import { isStaff, useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';
import type { Role } from '@/lib/types';

interface NavItem { to: string; label: string; icon: string; roles?: Role[] }

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { to: '/alerts', label: 'Alerts', icon: 'M12 3l9 16H3L12 3zm0 6v4m0 3v.01' },
  { to: '/cases', label: 'Cases', icon: 'M4 7h16v12H4zM9 7V5h6v2', roles: ['ANALYST', 'SUPERVISOR', 'ADMIN'] },
  { to: '/subjects', label: 'Subjects', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0', roles: ['ANALYST', 'SUPERVISOR', 'ADMIN'] },
  { to: '/report/str', label: 'File STR', icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5', roles: ['REPORTING_OFFICER'] },
  { to: '/report/transactions', label: 'Upload transactions', icon: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16', roles: ['REPORTING_OFFICER'] },
  { to: '/admin/users', label: 'Users', icon: 'M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zm-6 9a6 6 0 0112 0m2 0a6 6 0 016-6', roles: ['ADMIN'] },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role));

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="border-b border-brand-900 bg-brand-800 text-brand-100 lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0">
        <div className="flex items-center gap-3 px-5 py-4 lg:py-6">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Case Management</p>
            <p className="text-xs text-brand-100/70">{isStaff(user) ? 'Financial Intelligence Unit' : user.entity?.name}</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-brand-100/80 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <NavLink to="/account" className="block truncate text-sm font-medium text-white hover:underline">{user.name}</NavLink>
          <p className="truncate text-xs text-brand-100/70">{ROLE_LABEL[user.role]}{user.designation ? ` · ${user.designation}` : ''}</p>
          <button onClick={logout} className="mt-3 text-xs font-semibold text-brand-100/80 hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-4 flex justify-end lg:hidden">
          <NavLink to="/account" className="mr-4 text-xs font-semibold text-slate-500">Account</NavLink>
          <button onClick={logout} className="text-xs font-semibold text-slate-500">Sign out</button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
