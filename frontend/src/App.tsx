import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { AlertDetailPage } from '@/pages/AlertDetailPage';
import { AlertsPage } from '@/pages/AlertsPage';
import { CaseDetailPage } from '@/pages/CaseDetailPage';
import { CasesPage } from '@/pages/CasesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { LoginPage } from '@/pages/LoginPage';
import { SubjectProfilePage } from '@/pages/SubjectProfilePage';
import { SubjectsPage } from '@/pages/SubjectsPage';

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  return user && roles.includes(user.role) ? <>{children}</> : <Navigate to="/" replace />;
}

const STAFF: Role[] = ['ANALYST', 'SUPERVISOR', 'ADMIN'];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="alerts/:reference" element={<AlertDetailPage />} />
        <Route path="cases" element={<RequireRole roles={STAFF}><CasesPage /></RequireRole>} />
        <Route path="cases/:reference" element={<RequireRole roles={STAFF}><CaseDetailPage /></RequireRole>} />
        <Route path="subjects" element={<RequireRole roles={STAFF}><SubjectsPage /></RequireRole>} />
        <Route path="subjects/:id" element={<RequireRole roles={STAFF}><SubjectProfilePage /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export { RequireRole, STAFF };
