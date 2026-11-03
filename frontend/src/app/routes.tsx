import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Spinner } from '@/components/common/Panel';

// Route-level code splitting: each dashboard loads on demand.
const CitizenDashboard = lazy(() => import('@/dashboards/citizen/CitizenDashboard'));
const AdminLayout = lazy(() => import('@/dashboards/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('@/dashboards/admin/AdminDashboard'));
const AdminAnalytics = lazy(() => import('@/dashboards/admin/AdminAnalytics'));
const DataImport = lazy(() => import('@/dashboards/admin/DataImport'));
const IncidentReports = lazy(() => import('@/dashboards/admin/IncidentReports'));
const StakeholderDashboard = lazy(() => import('@/dashboards/stakeholder/StakeholderDashboard'));
const FieldOfficerDashboard = lazy(() => import('@/dashboards/field-officer/FieldOfficerDashboard'));

const page = (el: ReactNode) => (
  <Suspense
    fallback={
      <div className="flex h-64 items-center justify-center gap-3 text-sm text-ink-400">
        <Spinner className="text-accent" /> Loading dashboard…
      </div>
    }
  >
    {el}
  </Suspense>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/citizen" replace /> },
      { path: 'citizen', element: page(<CitizenDashboard />) },
      {
        path: 'admin',
        element: page(<AdminLayout />),
        children: [
          { index: true, element: page(<AdminDashboard />) },
          { path: 'analytics', element: page(<AdminAnalytics />) },
          { path: 'import', element: page(<DataImport />) },
          { path: 'reports', element: page(<IncidentReports />) },
        ],
      },
      { path: 'stakeholder', element: page(<StakeholderDashboard />) },
      { path: 'field', element: page(<FieldOfficerDashboard />) },
      { path: '*', element: <Navigate to="/citizen" replace /> },
    ],
  },
], {
  future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true },
});
