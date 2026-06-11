import { lazy, Suspense, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, createBrowserRouter } from "react-router-dom";

function GlobalErrorElement() {
  const { t } = useTranslation();

  return (
    <div className="global-error-element">
      <h1 className="global-error-title">{t("router.errorTitle")}</h1>
      <p className="global-error-message">{t("router.errorMessage")}</p>
      <a href="/" className="global-error-link">{t("router.goToDashboard")}</a>
    </div>
  );
}
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { PublicLayout } from "./layouts/PublicLayout";
import { RouteTransition } from "./components/RouteTransition";

const DashboardLayout = lazy(() =>
  import("./layouts/DashboardLayout").then((module) => ({ default: module.DashboardLayout }))
);
const ContactsPage = lazy(() => import("./pages/ContactsPage").then((module) => ({ default: module.ContactsPage })));
const ContactReliabilityPage = lazy(() =>
  import("./pages/ContactReliabilityPage").then((module) => ({ default: module.ContactReliabilityPage }))
);
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const DataExportPage = lazy(() => import("./pages/DataExportPage").then((module) => ({ default: module.DataExportPage })));
const InboxPage = lazy(() => import("./pages/InboxPage").then((module) => ({ default: module.InboxPage })));
const InboxChannelPlaceholderPage = lazy(() =>
  import("./pages/InboxChannelPlaceholderPage").then((module) => ({ default: module.InboxChannelPlaceholderPage }))
);
const InboxReplyLibraryPage = lazy(() =>
  import("./pages/InboxReplyLibraryPage").then((module) => ({ default: module.InboxReplyLibraryPage }))
);
const InboxAutoReplyPage = lazy(() =>
  import("./pages/InboxAutoReplyPage").then((module) => ({ default: module.InboxAutoReplyPage }))
);
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const PublicCompliancePage = lazy(() =>
  import("./pages/PublicCompliancePage").then((module) => ({ default: module.PublicCompliancePage }))
);
const LandingPage = lazy(() => import("./pages/public/LandingPage").then((module) => ({ default: module.LandingPage })));
const FeaturesPage = lazy(() => import("./pages/public/FeaturesPage").then((module) => ({ default: module.FeaturesPage })));
const PricingPage = lazy(() => import("./pages/public/PricingPage").then((module) => ({ default: module.PricingPage })));
const DemoPage = lazy(() => import("./pages/public/DemoPage").then((module) => ({ default: module.DemoPage })));
const FaqPage = lazy(() => import("./pages/public/FaqPage").then((module) => ({ default: module.FaqPage })));
const ContactPage = lazy(() => import("./pages/public/ContactPage").then((module) => ({ default: module.ContactPage })));
const PlatformPage = lazy(() => import("./pages/PlatformPage").then((module) => ({ default: module.PlatformPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const SalesPage = lazy(() => import("./pages/SalesPage").then((module) => ({ default: module.SalesPage })));
const SetupPage = lazy(() => import("./pages/SetupPage").then((module) => ({ default: module.SetupPage })));
const ChannelSetupPage = lazy(() => import("./pages/ChannelSetupPage").then((module) => ({ default: module.ChannelSetupPage })));
const EmailSetupPage = lazy(() => import("./pages/EmailSetupPage").then((module) => ({ default: module.EmailSetupPage })));
const ChannelSetupPlaceholderPage = lazy(() =>
  import("./pages/ChannelSetupPlaceholderPage").then((module) => ({ default: module.ChannelSetupPlaceholderPage }))
);
const WhatsAppAccountDashboard = lazy(() => import("./pages/WhatsAppAccountDashboard").then((module) => ({ default: module.WhatsAppAccountDashboard })));
const WhatsAppContactRecoveryPage = lazy(() => import("./pages/WhatsAppContactRecoveryPage").then((module) => ({ default: module.WhatsAppContactRecoveryPage })));
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
const SuperAdminOpsCenterPage = lazy(() =>
  import("./pages/SuperAdminOpsCenterPage").then((module) => ({ default: module.SuperAdminOpsCenterPage }))
);
const OrganizationAccessLimitsPage = lazy(() =>
  import("./pages/OrganizationCampaignAccessLimitsPage").then((module) => ({ default: module.OrganizationCampaignAccessLimitsPage }))
);
const CampaignsPage = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.CampaignsPage }))
);
const CreateCampaignPage = lazy(() =>
  import("./modules/campaigns").then((module) => ({ default: module.CreateCampaignPage }))
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
const ModuleRouteGuard = lazy(() =>
  import("./components/ModuleRouteGuard").then((module) => ({ default: module.ModuleRouteGuard }))
);

function withRouteFallback(page: ReactElement) {
  const Fallback = () => {
    const { t } = useTranslation();

    return <div className="p-6 text-sm text-text-muted">{t("common.loadingPage")}</div>;
  };

  return (
    <Suspense fallback={<Fallback />}>
      <RouteTransition>{page}</RouteTransition>
    </Suspense>
  );
}

function withSuspense(page: ReactElement) {
  const Fallback = () => {
    const { t } = useTranslation();

    return <div className="p-6 text-sm text-text-muted">{t("common.loadingPage")}</div>;
  };

  return <Suspense fallback={<Fallback />}>{page}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <PublicLayout />,
    errorElement: <GlobalErrorElement />,
    children: [
      { index: true, element: withRouteFallback(<LandingPage />) },
      { path: "features", element: withRouteFallback(<FeaturesPage />) },
      { path: "pricing", element: withRouteFallback(<PricingPage />) },
      { path: "demo", element: withRouteFallback(<DemoPage />) },
      { path: "faq", element: withRouteFallback(<FaqPage />) },
      { path: "contact", element: withRouteFallback(<ContactPage />) },
      { path: "data-deletion", element: withRouteFallback(<PublicCompliancePage variant="data-deletion" />) },
      { path: "privacy-policy", element: withRouteFallback(<PublicCompliancePage variant="privacy-policy" />) },
      { path: "terms", element: withRouteFallback(<PublicCompliancePage variant="terms" />) }
    ]
  },
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
          { path: "inbox", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxPage /></ModuleRouteGuard>) },
          { path: "inbox/whatsapp", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxPage /></ModuleRouteGuard>) },
          { path: "inbox/social", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxChannelPlaceholderPage variant="social" /></ModuleRouteGuard>) },
          { path: "inbox/facebook", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxChannelPlaceholderPage variant="facebook" /></ModuleRouteGuard>) },
          { path: "inbox/instagram", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxChannelPlaceholderPage variant="instagram" /></ModuleRouteGuard>) },
          { path: "inbox/ecommerce", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxChannelPlaceholderPage variant="ecommerce" /></ModuleRouteGuard>) },
          { path: "inbox/replies", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxReplyLibraryPage /></ModuleRouteGuard>) },
          { path: "inbox/auto-replies", element: withRouteFallback(<ModuleRouteGuard moduleKey="inbox" moduleName="Inbox"><InboxAutoReplyPage /></ModuleRouteGuard>) },
          { path: "contacts", element: withRouteFallback(<ModuleRouteGuard moduleKey="crm" moduleName="CRM"><ContactsPage /></ModuleRouteGuard>) },
          { path: "contacts/reliability", element: withRouteFallback(<ModuleRouteGuard moduleKey="crm" moduleName="CRM"><ContactReliabilityPage /></ModuleRouteGuard>) },
          { path: "sales", element: withRouteFallback(<ModuleRouteGuard moduleKey="sales" moduleName="Sales"><SalesPage /></ModuleRouteGuard>) },
          { path: "reports", element: withRouteFallback(<ModuleRouteGuard moduleKey="sales" moduleName="Sales"><ReportsPage /></ModuleRouteGuard>) },
          { path: "exports", element: withRouteFallback(<ModuleRouteGuard moduleKey="crm" moduleName="CRM"><DataExportPage /></ModuleRouteGuard>) },
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
                <CreateCampaignPage />
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
          {
            path: "campaigns/whatsapp/templates/governance",
            element: <Navigate to="/campaigns/whatsapp/templates" replace />
          },
          {
            path: "campaigns/whatsapp/safety",
            element: <Navigate to="/campaigns/whatsapp" replace />
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
          { path: "setup/channels/whatsapp/recovery", element: withRouteFallback(<WhatsAppContactRecoveryPage />) },
          { path: "setup/whatsapp-number-access", element: <Navigate to="/setup/channels/whatsapp" replace /> },
          { path: "setup/channels/facebook", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="facebook" />) },
          { path: "setup/channels/instagram", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="instagram" />) },
          { path: "setup/channels/meta/callback", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="facebook" />) },
          { path: "setup/channels/tiktok", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="tiktok" />) },
          { path: "setup/channels/social", element: <Navigate to="/setup/channels/facebook" replace /> },
          { path: "setup/channels/ecommerce", element: withRouteFallback(<ChannelSetupPlaceholderPage variant="ecommerce" />) },
          { path: "setup/channels/email", element: withRouteFallback(<EmailSetupPage />) },
          { path: "setup/whatsapp-accounts", element: <Navigate to="/setup/channels/whatsapp" replace /> },
          { path: "whatsapp-accounts", element: withRouteFallback(<WhatsAppAccountDashboard />) },
          { path: "whatsapp-accounts/recovery", element: withRouteFallback(<WhatsAppContactRecoveryPage />) },
          { path: "super-admin-map", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "super-admin-map/data-structure", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "super-admin-map/organization-structure", element: withRouteFallback(<SuperAdminMapPage />) },
          { path: "platform", element: withRouteFallback(<PlatformPage />) },
          { path: "super-admin/access-limits", element: withRouteFallback(<OrganizationAccessLimitsPage />) },
          { path: "super-admin/ops-center", element: withRouteFallback(<SuperAdminOpsCenterPage />) },
          { path: "super-admin/clear-organization-data", element: withRouteFallback(<ClearOrganizationDataPage />) },
          { path: "super-admin/audit-logs", element: withRouteFallback(<SuperAdminAuditLogsPage />) },
          { path: "profile", element: withRouteFallback(<ProfilePage />) }
        ]
      }
    ]
  }
]);
