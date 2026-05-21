import { Navigate, type RouteObject } from 'react-router-dom';
import { DoctorLayout } from './components/DoctorLayout';
import { DashboardPage } from './pages/DashboardPage';
import { QueuePage } from './pages/QueuePage';
import { ConsultationPage } from './pages/ConsultationPage';

/**
 * Doctor app-shell route table. Login lives at the shared `/login`
 * (see `src/routes.tsx`) — there is no per-app login page anymore.
 */
export const doctorRoutes: RouteObject[] = [
  {
    path: '/doctor',
    element: <DoctorLayout />,
    children: [
      { index: true, element: <Navigate to="/doctor/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'queue', element: <QueuePage /> },
      { path: 'consultation/:opNumber', element: <ConsultationPage /> },
    ],
  },
];
