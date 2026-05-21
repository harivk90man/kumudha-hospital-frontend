import { Navigate, type RouteObject } from 'react-router-dom';
import { DiagnosticsLayout } from './components/DiagnosticsLayout';
import { DashboardPage } from './pages/DashboardPage';
import { LabPage } from './pages/LabPage';
import { LabResultEntryPage } from './pages/LabResultEntryPage';
import { RadiologyPage } from './pages/RadiologyPage';
import { RadiologyResultEntryPage } from './pages/RadiologyResultEntryPage';

/**
 * Diagnostics app-shell route table. Combines Lab + Radiology under one
 * shell (per the Phase-1 app-structure decision — small clinics often
 * run them as one role; ACL gating per tab is a follow-up).
 */
export const diagnosticsRoutes: RouteObject[] = [
  {
    path: '/diagnostics',
    element: <DiagnosticsLayout />,
    children: [
      // Lab is the diagnostics landing — Dashboard is off-sidebar but
      // mounted for back-compat.
      { index: true, element: <Navigate to="/diagnostics/lab" replace /> },
      { path: 'dashboard',                       element: <DashboardPage /> },
      { path: 'lab',                             element: <LabPage /> },
      { path: 'lab/:orderId/result',             element: <LabResultEntryPage /> },
      { path: 'radiology',                       element: <RadiologyPage /> },
      { path: 'radiology/:orderId/report',       element: <RadiologyResultEntryPage /> },
    ],
  },
];
