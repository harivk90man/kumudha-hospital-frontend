import { Navigate, type RouteObject } from 'react-router-dom';
import { FrontdeskLayout } from './components/FrontdeskLayout';
import { DashboardPage } from './pages/DashboardPage';
import { NurseStationPage } from './pages/NurseStationPage';
import { BookAppointmentPage } from './pages/BookAppointmentPage';
import { WalkInPage } from './pages/WalkInPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { VitalsPage } from './pages/VitalsPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { QueuePage } from './pages/QueuePage';

/**
 * Front-desk app-shell route table. Mounted in `routes.tsx`.
 *
 * Auth: handled by `<FrontdeskLayout>`. Doctor signing in by mistake
 * here is bounced back to /doctor/dashboard.
 */
export const frontdeskRoutes: RouteObject[] = [
  {
    path: '/frontdesk',
    element: <FrontdeskLayout />,
    children: [
      // Station is the nurse’s primary surface (vitals queue + live
      // per-doctor queue, with the walk-in path one click away). The
      // legacy /dashboard, /vitals, /queue, /register routes stay
      // mounted for back-compat / deep-links but are off the sidebar.
      { index: true, element: <Navigate to="/frontdesk/station" replace /> },
      { path: 'station',             element: <NurseStationPage /> },
      { path: 'station/book/:uhid',  element: <BookAppointmentPage /> },
      { path: 'walkin',              element: <WalkInPage /> },
      { path: 'dashboard',    element: <DashboardPage /> },
      { path: 'register',     element: <RegistrationPage /> },
      { path: 'vitals',       element: <VitalsPage /> },
      { path: 'queue',        element: <QueuePage /> },
      { path: 'appointments', element: <AppointmentsPage /> },
    ],
  },
];
