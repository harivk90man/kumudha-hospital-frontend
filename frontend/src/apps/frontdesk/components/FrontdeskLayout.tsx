import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isSuperRole, useAuth } from '@/features/auth';
import { pickRoleChrome } from '@/layouts/roleChrome';

const LOGO_SRC = '/branding/kh-logo.jpeg';

export function FrontdeskLayout(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Doctors signing in by mistake at /frontdesk land back on their portal.
  // Owner / platform_admin admit through (full read access across surfaces).
  if (
    user &&
    !user.allRoles.includes('frontdesk') &&
    !isSuperRole(user.role)
  ) {
    return <Navigate to="/doctor/dashboard" replace />;
  }

  const { Sidebar, BottomNav } = pickRoleChrome(user?.role ?? 'frontdesk');

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
