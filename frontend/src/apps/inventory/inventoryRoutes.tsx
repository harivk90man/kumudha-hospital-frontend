import { Navigate, type RouteObject } from 'react-router-dom';
import { InventoryLayout } from './components/InventoryLayout';
import { DashboardPage } from './pages/DashboardPage';
import { MedicinesPage } from './pages/MedicinesPage';
import { BatchesPage } from './pages/BatchesPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { SupplierFormPage } from './pages/SupplierFormPage';
import { GrnPage } from './pages/GrnPage';
import { GrnNewPage } from './pages/GrnNewPage';

export const inventoryRoutes: RouteObject[] = [
  {
    path: '/inventory',
    element: <InventoryLayout />,
    children: [
      // Medicines is the clerk’s primary surface — Dashboard is
      // off-sidebar but mounted for back-compat.
      { index: true, element: <Navigate to="/inventory/medicines" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'medicines', element: <MedicinesPage /> },
      { path: 'batches',   element: <BatchesPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      // Supplier add/edit — one component handles both modes via the
      // optional `:id` URL param so the form/validation lives in one
      // place (mirrors the GRN new+edit pattern below).
      { path: 'suppliers/new',      element: <SupplierFormPage /> },
      { path: 'suppliers/:id/edit', element: <SupplierFormPage /> },
      { path: 'grn',       element: <GrnPage /> },
      // GRN creation moved out of a side sheet onto its own page so
      // the spreadsheet-style line editor has a full canvas (matches
      // the standard sub-page header pattern with back-link + CTAs).
      // The same component handles edit-mode at /grn/:id/edit so the
      // metadata-edit screen reuses the page chrome and validation.
      { path: 'grn/new',         element: <GrnNewPage /> },
      { path: 'grn/:id/edit',    element: <GrnNewPage /> },
    ],
  },
];
