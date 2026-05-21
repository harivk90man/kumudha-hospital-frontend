import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PatientProfilePage, PatientEditPage } from './features/patient';
import { PaymentPage } from './features/billing';
import { RoleShell } from './layouts/RoleShell';
import { RootLayout } from './layouts/RootLayout';
import { doctorRoutes } from './apps/doctor';
import { frontdeskRoutes } from './apps/frontdesk';
import { cashierRoutes } from './apps/cashier';
import { diagnosticsRoutes } from './apps/diagnostics';
import { pharmacyRoutes } from './apps/pharmacy';
import { inventoryRoutes } from './apps/inventory';
import { ownerRoutes } from './apps/owner';
import { adminRoutes } from './apps/admin';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <Navigate to="/login" replace /> },
      { path: '/login', element: <LoginPage /> },
      {
        element: <RoleShell />,
        children: [
          { path: '/patient/:uhid',      element: <PatientProfilePage /> },
          { path: '/patient/:uhid/edit', element: <PatientEditPage /> },
          { path: '/payment/:opNumber',                   element: <PaymentPage /> },
          { path: '/payment/appointment/:appointmentId', element: <PaymentPage /> },
        ],
      },
      ...doctorRoutes,
      ...frontdeskRoutes,
      ...cashierRoutes,
      ...diagnosticsRoutes,
      ...pharmacyRoutes,
      ...inventoryRoutes,
      ...ownerRoutes,
      ...adminRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
