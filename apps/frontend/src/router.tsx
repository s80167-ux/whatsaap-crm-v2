import { lazy, Suspense, type ReactElement } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";

function GlobalErrorElement() {
  return (
    <div className="global-error-element">
      <h1 className="global-error-title">Something went wrong</h1>
      <p className="global-error-message">The page you are looking for does not exist or an unexpected error occurred.</p>
      <a href="/" className="global-error-link">Go to Dashboard</a>
    </div>
  );
}
import { ProtectedLayout } from "./layouts/ProtectedLayout";

const DashboardLayout = lazy(() =>
  import("./layouts/DashboardLayout").then((module) => ({ default: module.DashboardLayout }))
);
const ContactsPage = lazy(() => import("./pages/ContactsPage").then((module) => ({ default: module.ContactsPage })));
const ContactRepairQueuePage = lazy(() => import("./pages/ContactRepairQueuePage").then((m) => ({default: m.ContactRepairQueuePage})));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const InboxPage = lazy(() => import("./pages/InboxPage").then((module) => ({ default: module.InboxPage })));
const InboxReplyLibraryPage = lazy(() =>
  import("./pages/InboxReplyLibraryPage").then((module) => ({ default: module.InboxReplyLibraryPage }))
);
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const PlatformPage = lazy(() => import("./pages/PlatformPage").then((module) => ({ default: module.PlatformPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const SalesPage = lazy(() => import("./pages/SalesPage").then((module) => ({ default: module.SalesPage })));
const SetupPage = lazy(() => import("./pages/SetupPage").then((module) => ({ default: module.SetupPage })));
const WhatsAppAccountDashboard = lazy(() => import("./pages/WhatsAppAccountDashboard").then((module) => ({ default: module.WhatsAppAccountDashboard })));
const SuperAdminMapPage = lazy(() =>
  import("./pages/SuperAdminMapPage").then((module) => ({ default: module.SuperAdminMapPage }))
);
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((module) => ({ default: module.default })));

function withRouteFallback(page: ReactElement) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading page...</div>}>
      {page}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: withRouteFallback(<LoginPage />)
  },
  {
    element: <ProtectedLayout />, 
    errorElement: <GlobalErrorElement />, // Global error boundary
    children: [
      {
        path: "/",
        element: withRouteFallback(<DashboardLayout />),
        errorElement: <GlobalErrorElement />, // Dashboard-level error boundary
        children: [
          { path: "repair-queue", element: withRouteFallback(<ContactRepairQueuePage />) },
          { path: "dashboard", element: withRouteFallback(<DashboardPage />) },
          { index: true, element: <Navigate to="/inbox" replace /> },
          { path: "inbox", element: withRouteFallback(<InboxPage />) },
          { path: "inbox/replies", element: withRouteFallback(<InboxReplyLibraryPage />) },
          { path: "contacts", element: withRouteFallback(<ContactsPage />) },
          { path: "sales", element: withRouteFallback(<SalesPage />) },
          { path: "reports", element: withRouteFallback(<ReportsPage />) },
          {
            path: "setup",
            element: withRouteFallback(<SetupPage />)
          },
          { path: "setup/whatsapp-accounts", element: <Navigate to="/whatsapp-accounts" replace /> },
          { path: "whatsapp-accounts", element: withRouteFallback(<WhatsAppAccountDashboard />) },
          { path: "super-admin-map", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "super-admin-map/data-structure", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "super-admin-map/organization-structure", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "platform", element: withRouteFallback(<PlatformPage />) },
          { path: "profile", element: withRouteFallback(<ProfilePage />) }
        ]
      }
    ]
  }
]);
