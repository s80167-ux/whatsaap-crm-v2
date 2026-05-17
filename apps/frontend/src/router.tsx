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
import { RouteTransition } from "./components/RouteTransition";

const DashboardLayout = lazy(() =>
  import("./layouts/DashboardLayout").then((module) => ({ default: module.DashboardLayout }))
);
const ContactsPage = lazy(() => import("./pages/ContactsPage").then((module) => ({ default: module.ContactsPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DataExportPage = lazy(() => import("./pages/DataExportPage").then((module) => ({ default: module.DataExportPage })));
const InboxPage = lazy(() => import("./pages/InboxPage").then((module) => ({ default: module.InboxPage })));
const InboxChannelPlaceholderPage = lazy(() =>
  import("./pages/InboxChannelPlaceholderPage").then((module) => ({ default: module.InboxChannelPlaceholderPage }))
);
const InboxReplyLibraryPage = lazy(() =>
  import("./pages/InboxReplyLibraryPage").then((module) => ({ default: module.InboxReplyLibraryPage }))
);
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const PlatformPage = lazy(() => import("./pages/PlatformPage").then((module) => ({ default: module.PlatformPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const SalesPage = lazy(() => import("./pages/SalesPage").then((module) => ({ default: module.SalesPage })));
const SetupPage = lazy(() => import("./pages/SetupPage").then((module) => ({ default: module.SetupPage })));
const ChannelSetupPage = lazy(() => import("./pages/ChannelSetupPage").then((module) => ({ default: module.ChannelSetupPage })));
const ChannelSetupPlaceholderPage = lazy(() =>
  import("./pages/ChannelSetupPlaceholderPage").then((module) => ({ default: module.ChannelSetupPlaceholderPage }))
);
const WhatsAppAccountDashboard = lazy(() => import("./pages/WhatsAppAccountDashboard").then((module) => ({ default: module.WhatsAppAccountDashboard })));
const SuperAdminMapPage = lazy(() =>
  import("./pages/SuperAdminMapPage").then((module) => ({ default: module.SuperAdminMapPage }))
);
const ProfilePage = lazy(() => import("./pages/ProfilePage").then((module) => ({ default: module.default })));
const ClearOrganizationDataPage = lazy(() =>
  import("./pages/ClearOrganizationDataPage").then((module) => ({ default: module.ClearOrganizationDataPage }))
);
const SuperAdminAuditLogsPage = lazy(() =>
  import("./pages/SuperAdminAuditLogsPage").then((module) => ({ default: module.SuperAdminAuditLogsPage }))
);
const OrganizationAccessLimitsPage = lazy(() =>
  import("./pages/OrganizationCampaignAccessLimitsPage").then((module) => ({ default: module.OrganizationCampaignAccessLimitsPage }))
);
const CampaignsPage = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.CampaignsPage }))
);
const EmailCampaignPage = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.EmailCampaignPage }))
);
const AudienceGroupsPage = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.AudienceGroupsPage }))
);
const MessageTemplatesPage = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.MessageTemplatesPage }))
);
const CreateTemplatePage = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.CreateTemplatePage }))
);
const CampaignsRouteGuard = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.CampaignsRouteGuard }))
);

function withRouteFallback(page: ReactElement) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading page...</div>}>
      <RouteTransition>{page}</RouteTransition>
    </Suspense>
  );
}

function withSuspense(page: ReactElement) {
  return <Suspense fallback={<div className="p-6 text-sm text-text-muted">Loading page...</div>}>{page}</Suspense>;
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
        element: withSuspense(<DashboardLayout />),
        errorElement: <GlobalErrorElement />, // Dashboard-level error boundary
        children: [
          { path: "dashboard", element: withRouteFallback(<DashboardPage />) },
          { index: true, element: <Navigate to="/inbox" replace /> },
          { path: "inbox", element: withRouteFallback(<InboxPage />) },
          { path: "inbox/whatsapp", element: withRouteFallback(<InboxPage />) },
          { path: "inbox/social", element: withRouteFallback(<InboxChannelPlaceholderPage variant="social" />) },
          { path: "inbox/ecommerce", element: withRouteFallback(<InboxChannelPlaceholderPage variant="ecommerce" />) },
          { path: "inbox/replies", element: withRouteFallback(<InboxReplyLibraryPage />) },
          { path: "contacts", element: withRouteFallback(<ContactsPage />) },
          { path: "sales", element: withRouteFallback(<SalesPage />) },
          { path: "reports", element: withRouteFallback(<ReportsPage />) },
          { path: "exports", element: withRouteFallback(<DataExportPage />) },
          {
            path: "campaigns",
            element: <Navigate to="/campaigns/whatsapp" replace />
          },
          {
            path: "campaigns/whatsapp",
            element: withRouteFallback(
              <CampaignsRouteGuard moduleKey="campaign.whatsapp">
                <CampaignsPage />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/whatsapp/create",
            element: withRouteFallback(
              <CampaignsRouteGuard moduleKey="campaign.whatsapp">
                <CampaignsPage activeTab="create" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/whatsapp/history",
            element: withRouteFallback(
              <CampaignsRouteGuard moduleKey="campaign.whatsapp">
                <CampaignsPage activeTab="history" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/whatsapp/audience",
            element: withRouteFallback(
              <CampaignsRouteGuard moduleKey="campaign.whatsapp">
                <AudienceGroupsPage />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/whatsapp/templates",
            element: withRouteFallback(
              <CampaignsRouteGuard moduleKey="campaign.whatsapp">
                <MessageTemplatesPage />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/whatsapp/templates/create",
            element: withRouteFallback(
              <CampaignsRouteGuard moduleKey="campaign.whatsapp">
                <CreateTemplatePage />
              </CampaignsRouteGuard>
            )
          },
          { path: "campaigns/audience-groups", element: <Navigate to="/campaigns/whatsapp/audience" replace /> },
          { path: "campaigns/templates", element: <Navigate to="/campaigns/whatsapp/templates" replace /> },
          { path: "campaigns/templates/create", element: <Navigate to="/campaigns/whatsapp/templates/create" replace /> },
          {
            path: "campaigns/email",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/create",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="create" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/templates",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="templates" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/audience",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="audience" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/sender-setup",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="senderSetup" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/suppression-list",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="suppressionList" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/compliance",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="compliance" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/reports",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="reports" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "campaigns/email/history",
            element: withRouteFallback(
              <CampaignsRouteGuard>
                <EmailCampaignPage activeTab="history" />
              </CampaignsRouteGuard>
            )
          },
          {
            path: "setup",
            element: withRouteFallback(<SetupPage />)
          },
          { path: "setup/channels", element: withRouteFallback(<ChannelSetupPage />) },
          { path: "setup/channels/whatsapp", element: withRouteFallback(<WhatsAppAccountDashboard />) },
          { path: "setup/whatsapp-number-access", element: <Navigate to="/setup/channels/whatsapp" replace /> },
          { path: "setup/channels/social", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="social" />) },
          { path: "setup/channels/ecommerce", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="ecommerce" />) },
          { path: "setup/channels/email", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="email" />) },
          { path: "setup/whatsapp-accounts", element: <Navigate to="/setup/channels/whatsapp" replace /> },
          { path: "whatsapp-accounts", element: withRouteFallback(<WhatsAppAccountDashboard />) },
          { path: "super-admin-map", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "super-admin-map/data-structure", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "super-admin-map/organization-structure", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "platform", element: withRouteFallback(<PlatformPage />) },
          { path: "super-admin/access-limits", element: withRouteFallback(<OrganizationAccessLimitsPage />) },
          { path: "super-admin/clear-organization-data", element: withRouteFallback(<ClearOrganizationDataPage />) },
          { path: "super-admin/audit-logs", element: withRouteFallback(<SuperAdminAuditLogsPage />) },
          { path: "profile", element: withRouteFallback(<ProfilePage />) }
        ]
      }
    ]
  }
]);
