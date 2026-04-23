import { lazy, Suspense, type ReactElement } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { ProtectedLayout } from "./layouts/ProtectedLayout";

const DashboardLayout = lazy(() =>
  import("./layouts/DashboardLayout").then((module) => ({ default: module.DashboardLayout }))
);
const ContactsPage = lazy(() => import("./pages/ContactsPage").then((module) => ({ default: module.ContactsPage })));
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
const SuperAdminMapPage = lazy(() =>
  import("./pages/SuperAdminMapPage").then((module) => ({ default: module.SuperAdminMapPage }))
);

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
    children: [
      {
        path: "/",
        element: withRouteFallback(<DashboardLayout />),
        children: [
          { path: "dashboard", element: withRouteFallback(<DashboardPage />) },
          { index: true, element: <Navigate to="/inbox" replace /> },
          { path: "inbox", element: withRouteFallback(<InboxPage />) },
          { path: "inbox/replies", element: withRouteFallback(<InboxReplyLibraryPage />) },
          { path: "contacts", element: withRouteFallback(<ContactsPage />) },
          { path: "sales", element: withRouteFallback(<SalesPage />) },
          { path: "reports", element: withRouteFallback(<ReportsPage />) },
          { path: "setup", element: withRouteFallback(<SetupPage />) },
          { path: "super-admin-map", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "platform", element: withRouteFallback(<PlatformPage />) }
        ]
      }
    ]
  }
]);
