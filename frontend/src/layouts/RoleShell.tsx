import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { pickRoleChrome } from './roleChrome';

const LOGO_SRC = '/branding/kh-logo.jpeg';

/**
 * Role-agnostic shell. Picks the correct sidebar + bottom-nav based on
 * the signed-in user’s role. Used for routes that aren’t bound to a
 * single role app — `/patient/:uhid` and `/patient/:uhid/edit` are the
 * primary examples, since a receptionist, nurse, doctor, and cashier
 * all need to land on them with their own portal chrome around.
 *
 * If the user isn’t authenticated, redirect to the front-desk staff
 * portal — the most-frequent sign-in path, and the canonical entry
 * point. Other portals are still directly reachable at their own URLs.
 */
export function RoleShell(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const { Sidebar, BottomNav } = pickRoleChrome(user.role);

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
