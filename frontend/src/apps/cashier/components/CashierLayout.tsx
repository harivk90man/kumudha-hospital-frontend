import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { homeForRole, isSuperRole, useAuth, userHas } from '@/features/auth';
import { pickRoleChrome } from '@/layouts/roleChrome';

const LOGO_SRC = '/branding/kh-logo.jpeg';

/**
 * Cashier app shell. Gates on the till-related capabilities rather than
 * a hard `role === 'cashier'` check — so anyone with `take_payment`
 * (frontdesk), `open_shift` (owner / chief_doctor), or `close_shift`
 * (the same set) can reach `/cashier/shift` and the related surfaces.
 *
 * The sidebar adapts to the signed-in user's role so a frontdesk user
 * arriving here keeps their familiar chrome instead of the cashier rail.
 */
export function CashierLayout(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (
    user &&
    !isSuperRole(user.role) &&
    !userHas(user, 'take_payment') &&
    !userHas(user, 'open_shift') &&
    !userHas(user, 'close_shift')
  ) {
    return <Navigate to={homeForRole(user.role)} replace />;
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
