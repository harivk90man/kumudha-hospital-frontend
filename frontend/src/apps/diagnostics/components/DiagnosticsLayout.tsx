import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isSuperRole, useAuth } from '@/features/auth';
import { pickRoleChrome } from '@/layouts/roleChrome';

const LOGO_SRC = '/branding/kh-logo.jpeg';

export function DiagnosticsLayout(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (
    user &&
    !user.allRoles.includes('lab_radio') &&
    !isSuperRole(user.role)
  ) {
    return <Navigate to="/" replace />;
  }

  const { Sidebar, BottomNav } = pickRoleChrome(user?.role ?? 'lab_radio');

  return (
    <div className="flex min-h-screen bg-page">
      <Sidebar logoSrc={LOGO_SRC} />
      <main className="flex min-h-screen flex-1 flex-col pb-16 md:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
