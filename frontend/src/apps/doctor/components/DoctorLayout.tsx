import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { pickRoleChrome } from '@/layouts/roleChrome';
import { DoctorTopSearch } from './DoctorTopSearch';
import { ChiefDoctorShiftPill } from './ChiefDoctorShiftPill';

const LOGO_SRC = '/branding/kh-logo.jpeg';

export function DoctorLayout(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const { Sidebar, BottomNav } = pickRoleChrome(user?.role ?? 'doctor');
  const isChiefDoctor =
    user?.role === 'chief_doctor' || user?.allRoles.includes('chief_doctor') === true;

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <Sidebar logoSrc={LOGO_SRC} />
      <main className="flex flex-1 flex-col overflow-hidden pb-16 md:pb-0">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <DoctorTopSearch />
          </div>
          {isChiefDoctor && (
            <div className="hidden pr-3 md:block">
              <ChiefDoctorShiftPill />
            </div>
          )}
        </div>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
