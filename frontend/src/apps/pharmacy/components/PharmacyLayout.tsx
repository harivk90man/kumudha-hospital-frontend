import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isSuperRole, useAuth } from '@/features/auth';
import { pickRoleChrome } from '@/layouts/roleChrome';

const LOGO_SRC = '/branding/kh-logo.jpeg';

/**
 * Pharmacy app shell. Gates entry to the pharmacist role and super-roles
 * (owner / platform_admin). When a super-role navigates here from their
 * own home (e.g. owner clicking a "low stock" alert), the chrome stays
 * the SIGNED-IN user's chrome — so the owner keeps the owner sidebar
 * around the pharmacy page and can navigate back without browser back.
 */
export function PharmacyLayout(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user && !user.allRoles.includes('pharma') && !isSuperRole(user.role)) {
    return <Navigate to="/" replace />;
  }

  const { Sidebar, BottomNav } = pickRoleChrome(user?.role ?? 'pharma');

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
