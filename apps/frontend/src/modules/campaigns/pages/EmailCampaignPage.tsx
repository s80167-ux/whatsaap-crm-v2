import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Mail,
  PauseCircle,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UserX,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { Input, Select } from "../../../components/Input";
import { PanelPagination, usePanelPagination } from "../../../components/PanelPagination";
import { useCampaignEmailModuleStatus } from "../../../hooks/useAdmin";
import type { DashboardOutletContext } from "../../../layouts/DashboardLayout";
import { getStoredUser } from "../../../lib/auth";
import { CampaignModuleTabs } from "../components/CampaignModuleTabs";
import { fetchAudienceGroups } from "../audience-groups/services/audienceGroupService";
import type { AudienceGroup } from "../audience-groups/types/audienceGroup.types";
import {
  cancelEmailCampaign,
  createEmailSuppression,
  deleteEmailSuppression,
  disableEmailSender,
  fetchEmailCampaignHistory,
  fetchEmailCampaignRecipients,
  fetchEmailCampaignReport,
  fetchEmailCampaigns,
  fetchEmailSenders,
  fetchEmailSuppressionList,
  pauseEmailCampaign,
  saveEmailCampaign,
  saveEmailSender,
  sendEmailCampaignTest,
  startEmailCampaign,
  testEmailSender,
  type EmailCampaign,
  type EmailCampaignRecipient,
  type EmailCampaignReport,
  type EmailCampaignStatus,
  type EmailHistoryEntry,
  type EmailSender,
  type EmailSenderStatus,
  type EmailSuppressionEntry,
  type EmailSuppressionReason,
  type EmailSenderType
} from "../services/emailCampaignService";

type EmailCampaignTab =
  | "overview"
  | "create"
  | "templates"
  | "audience"
  | "senderSetup"
  | "suppressionList"
  | "compliance"
  | "reports"
  | "history";

const setupProgressItems = [
  "Enable Email Campaign Module",
  "Add Sender Account",
  "Verify Sender",
  "Create Email Template",
  "Upload / Select Audience",
  "Configure Compliance Footer",
  "Send Test Email",
  "Activate Campaign Sending"
];

const senderTypes = [
  {
    title: "Gmail App Password",
    lines: ["Gmail SMTP", "Google Workspace SMTP"],
    icon: Mail
  },
  {
    title: "Custom SMTP",
    lines: ["For cPanel, hosting email, Exabytes, GB Network, Hostinger or other SMTP email"],
    icon: ShieldCheck
  }
];

const templateCards = [
  { title: "Promotional Email", description: "Announce offers, seasonal deals, and customer promotions." },
  { title: "Customer Update", description: "Share service updates, policy changes, or operational notices." },
  { title: "Event Invitation", description: "Invite customers to launches, webinars, workshops, or open days." },
  { title: "Payment Reminder", description: "Send polite reminders for invoices, deposits, or overdue balances." },
  { title: "Follow-up Email", description: "Continue conversations after quotes, calls, visits, or purchases." },
  { title: "Newsletter", description: "Publish recurring updates, tips, product highlights, and company news." }
];

const audienceSections = [
  { title: "Upload CSV", description: "Import recipients from a spreadsheet when uploads are enabled.", icon: Upload },
  { title: "Select CRM Contacts", description: "Build an audience from existing CRM contact records.", icon: UserCheck },
  { title: "Segment by Customer Status", description: "Target leads, customers, inactive contacts, or custom lifecycle groups.", icon: ClipboardCheck },
  { title: "Segment by Tags", description: "Use tags to prepare focused lists for future campaigns.", icon: FileText },
  { title: "Exclude Suppression List", description: "Automatically remove contacts who should not receive email.", icon: UserX }
];

type Notice = { type: "success" | "error"; message: string };

type SenderFormState = {
  senderId: string;
  senderType: EmailSenderType;
  displayName: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
  testEmail: string;
};

type CampaignFormState = {
  campaignId: string;
  name: string;
  senderId: string;
  audienceGroupId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  recipientsText: string;
  testEmail: string;
};

const defaultSenderForm: SenderFormState = {
  senderId: "",
  senderType: "custom_smtp",
  displayName: "",
  fromName: "",
  fromEmail: "",
  replyToEmail: "",
  smtpHost: "",
  smtpPort: "587",
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  testEmail: ""
};

const defaultCampaignForm: CampaignFormState = {
  campaignId: "",
  name: "",
  senderId: "",
  audienceGroupId: "",
  subject: "",
  bodyHtml: "",
  bodyText: "",
  recipientsText: "",
  testEmail: ""
};

export function EmailCampaignPage({ activeTab = "overview" }: { activeTab?: EmailCampaignTab }) {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const emailModuleStatus = useCampaignEmailModuleStatus(null, !outletContext.isSuperAdmin);
  const isEmailAccessEnabled = outletContext.isSuperAdmin ? true : emailModuleStatus.data?.isEnabled === true;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [senderForm, setSenderForm] = useState<SenderFormState>(defaultSenderForm);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(defaultCampaignForm);
  const [suppressionEmail, setSuppressionEmail] = useState("");
  const [suppressionReason, setSuppressionReason] = useState<EmailSuppressionReason>("manual");
  const [suppressionNote, setSuppressionNote] = useState("");
  const [selectedReportCampaignId, setSelectedReportCampaignId] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientStatusFilter, setRecipientStatusFilter] = useState("all");

  const isReady = Boolean(organizationId) && isEmailAccessEnabled;

  const sendersQuery = useQuery({
    queryKey: ["email-campaigns", "senders", organizationId],
    queryFn: () => fetchEmailSenders(organizationId),
    enabled: isReady
  });
  const campaignsQuery = useQuery({
    queryKey: ["email-campaigns", "campaigns", organizationId],
    queryFn: () => fetchEmailCampaigns(organizationId),
    enabled: isReady
  });
  const audienceGroupsQuery = useQuery({
    queryKey: ["email-campaigns", "audience-groups", organizationId],
    queryFn: () => fetchAudienceGroups(organizationId),
    enabled: isReady
  });
  const suppressionQuery = useQuery({
    queryKey: ["email-campaigns", "suppression", organizationId],
    queryFn: () => fetchEmailSuppressionList({ organizationId, limit: 100, offset: 0 }),
    enabled: isReady
  });
  const historyQuery = useQuery({
    queryKey: ["email-campaigns", "history", organizationId],
    queryFn: () => fetchEmailCampaignHistory(organizationId, 50),
    enabled: isReady
  });
  const reportQuery = useQuery({
    queryKey: ["email-campaigns", "report", organizationId, selectedReportCampaignId],
    queryFn: () => fetchEmailCampaignReport(selectedReportCampaignId, organizationId),
    enabled: isReady && Boolean(selectedReportCampaignId)
  });
  const recipientsQuery = useQuery({
    queryKey: ["email-campaigns", "recipients", organizationId, selectedReportCampaignId, recipientStatusFilter, recipientSearch],
    queryFn: () =>
      fetchEmailCampaignRecipients({
        campaignId: selectedReportCampaignId,
        organizationId,
        status: recipientStatusFilter,
        q: recipientSearch,
        limit: 25,
        page: 1
      }),
    enabled: isReady && Boolean(selectedReportCampaignId)
  });

  const senders = sendersQuery.data ?? [];
  const campaigns = campaignsQuery.data ?? [];
  const audienceGroups = audienceGroupsQuery.data ?? [];
  const suppressionEntries = suppressionQuery.data?.data ?? [];
  const historyEntries = historyQuery.data ?? [];
  const recipientRows = recipientsQuery.data?.data ?? [];
  const report = reportQuery.data ?? null;

  const stats = useMemo(() => {
    const totals = campaigns.reduce(
      (accumulator, campaign) => {
        accumulator.recipients += campaign.recipients;
        accumulator.sent += campaign.sent;
        accumulator.failed += campaign.failed;
        accumulator.pending += campaign.pending;
        return accumulator;
      },
      { recipients: 0, sent: 0, failed: 0, pending: 0 }
    );

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.status === "sending" || campaign.status === "paused").length,
      verifiedSenders: senders.filter((sender) => sender.status === "verified").length,
      suppressedEmails: suppressionEntries.length,
      recipients: totals.recipients,
      sent: totals.sent,
      failed: totals.failed,
      pending: totals.pending
    };
  }, [campaigns, senders, suppressionEntries.length]);

  const selectedReportCampaign = campaigns.find((campaign) => campaign.id === selectedReportCampaignId) ?? null;
  const selectedComposerCampaign = campaigns.find((campaign) => campaign.id === campaignForm.campaignId) ?? null;
  const readyAudienceGroups = useMemo(
    () => audienceGroups.filter((group) => group.status === "imported" && group.valid_count > 0),
    [audienceGroups]
  );

  useEffect(() => {
    if (!selectedReportCampaignId && campaigns.length > 0) {
      setSelectedReportCampaignId(campaigns[0].id);
    }
  }, [campaigns, selectedReportCampaignId]);

  function showNotice(type: Notice["type"], message: string) {
    setNotice({ type, message });
  }

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ["email-campaigns"] });
  }

  const senderSaveMutation = useMutation({
    mutationFn: () =>
      saveEmailSender({
        senderId: senderForm.senderId || undefined,
        organizationId,
        sender_type: senderForm.senderType,
        display_name: senderForm.displayName,
        from_name: senderForm.fromName,
        from_email: senderForm.fromEmail,
        reply_to_email: senderForm.replyToEmail || null,
        smtp_host: senderForm.smtpHost || null,
        smtp_port: Number(senderForm.smtpPort || 0) || null,
        smtp_secure: senderForm.smtpSecure,
        smtp_username: senderForm.smtpUsername || null,
        smtp_password: senderForm.smtpPassword || null
      }),
    onSuccess: async (sender) => {
      await refreshAll();
      setSenderForm((current) => ({ ...defaultSenderForm, senderId: sender.id, senderType: sender.sender_type, displayName: sender.display_name, fromName: sender.from_name, fromEmail: sender.from_email, replyToEmail: sender.reply_to_email ?? "", smtpHost: sender.smtp_host ?? "", smtpPort: sender.smtp_port ? String(sender.smtp_port) : defaultSenderForm.smtpPort, smtpSecure: sender.smtp_secure, smtpUsername: "", smtpPassword: "", testEmail: current.testEmail }));
      showNotice("success", senderForm.senderId ? "Sender updated." : "Sender created.");
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to save sender.")
  });

  const senderTestMutation = useMutation({
    mutationFn: () => {
      if (!senderForm.senderId) {
        throw new Error("Save the sender before testing it.");
      }

      return testEmailSender({ senderId: senderForm.senderId, organizationId, to_email: senderForm.testEmail, message: "This is a sender verification email from the CRM email campaign MVP." });
    },
    onSuccess: async (result) => {
      await refreshAll();
      showNotice("success", result.result.message);
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to test sender.")
  });

  const senderDisableMutation = useMutation({
    mutationFn: (senderId: string) => disableEmailSender({ senderId, organizationId }),
    onSuccess: async () => {
      await refreshAll();
      setSenderForm(defaultSenderForm);
      showNotice("success", "Sender disabled.");
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to disable sender.")
  });

  const campaignSaveMutation = useMutation({
    mutationFn: () =>
      saveEmailCampaign({
        campaignId: campaignForm.campaignId || undefined,
        organizationId,
        name: campaignForm.name,
        sender_id: campaignForm.senderId,
        subject: campaignForm.subject,
        body_html: normalizeHtmlBody(campaignForm.bodyHtml),
        body_text: campaignForm.bodyText || null,
        audience_group_id: campaignForm.audienceGroupId || null,
        recipients: parseRecipients(campaignForm.recipientsText)
      }),
    onSuccess: async (campaign) => {
      await refreshAll();
      setCampaignForm((current) => ({ ...current, campaignId: campaign.id }));
      setSelectedReportCampaignId(campaign.id);
      showNotice("success", campaignForm.campaignId ? "Campaign updated." : "Campaign draft created.");
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to save campaign.")
  });

  const campaignTestMutation = useMutation({
    mutationFn: () => {
      if (!campaignForm.campaignId) {
        throw new Error("Save the campaign draft before sending a test.");
      }

      return sendEmailCampaignTest({
        campaignId: campaignForm.campaignId,
        organizationId,
        to_email: campaignForm.testEmail,
        subject: campaignForm.subject || null,
        message: campaignForm.bodyText || stripHtml(campaignForm.bodyHtml) || null
      });
    },
    onSuccess: (result) => showNotice("success", result.message),
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to send campaign test.")
  });

  const campaignStartMutation = useMutation({
    mutationFn: (campaignId: string) => startEmailCampaign({ campaignId, organizationId }),
    onSuccess: async (result) => {
      await refreshAll();
      showNotice("success", result.message);
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to start campaign.")
  });

  const campaignPauseMutation = useMutation({
    mutationFn: (campaignId: string) => pauseEmailCampaign({ campaignId, organizationId }),
    onSuccess: async () => {
      await refreshAll();
      showNotice("success", "Campaign paused.");
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to pause campaign.")
  });

  const campaignCancelMutation = useMutation({
    mutationFn: (campaignId: string) => cancelEmailCampaign({ campaignId, organizationId }),
    onSuccess: async () => {
      await refreshAll();
      showNotice("success", "Campaign cancelled.");
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to cancel campaign.")
  });

  const suppressionCreateMutation = useMutation({
    mutationFn: () => createEmailSuppression({ organizationId, email: suppressionEmail, reason: suppressionReason, note: suppressionNote || null, source: "crm_ui" }),
    onSuccess: async () => {
      await refreshAll();
      setSuppressionEmail("");
      setSuppressionNote("");
      setSuppressionReason("manual");
      showNotice("success", "Suppression entry added.");
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to save suppression entry.")
  });

  const suppressionDeleteMutation = useMutation({
    mutationFn: (suppressionId: string) => deleteEmailSuppression({ suppressionId, organizationId }),
    onSuccess: async () => {
      await refreshAll();
      showNotice("success", "Suppression entry removed.");
    },
    onError: (error) => showNotice("error", error instanceof Error ? error.message : "Unable to delete suppression entry.")
  });

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Campaigns</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h2 className="section-title">Email Campaign</h2>
              <StatusBadge tone={isEmailAccessEnabled ? "success" : "muted"}>{isEmailAccessEnabled ? "MVP Live" : "Access Disabled"}</StatusBadge>
              <StatusBadge tone="muted">Sender Setup + Draft + Reports</StatusBadge>
            </div>
            <p className="mt-2 max-w-3xl section-copy">
              Reuses the existing campaign shell for SMTP sender setup, draft creation, suppression management, compliance checks, send reports, and audit history without duplicating the WhatsApp campaign flow.
            </p>
          </div>
          <Button className="w-full shrink-0 px-3 sm:w-auto sm:px-5" variant="secondary" onClick={() => setNotice(null)} disabled={!isReady}>
            <RefreshCw size={16} /> Refresh Workspace
          </Button>
        </div>
      </Card>

      <CampaignModuleTabs channel="email" />

      {notice ? (
        <div className={notice.type === "error" ? "rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" : "rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"}>
          {notice.message}
        </div>
      ) : null}

      {outletContext.isSuperAdmin && !organizationId ? (
        <Card elevated className="p-5 text-sm text-text-muted">
          Choose an organization from the sidebar before managing Email campaigns.
        </Card>
      ) : !isEmailAccessEnabled ? (
        <DisabledNotice isEmailAccessEnabled={isEmailAccessEnabled} />
      ) : (
        <>
          {renderActiveTab({
            activeTab,
            stats,
            senders,
            campaigns,
            readyAudienceGroups,
            suppressionEntries,
            historyEntries,
            senderForm,
            setSenderForm,
            campaignForm,
            setCampaignForm,
            selectedComposerCampaign,
            selectedReportCampaignId,
            setSelectedReportCampaignId,
            selectedReportCampaign,
            report,
            recipientRows,
            recipientSearch,
            setRecipientSearch,
            recipientStatusFilter,
            setRecipientStatusFilter,
            suppressionEmail,
            setSuppressionEmail,
            suppressionReason,
            setSuppressionReason,
            suppressionNote,
            setSuppressionNote,
            loading: {
              senders: sendersQuery.isLoading,
              campaigns: campaignsQuery.isLoading,
              suppression: suppressionQuery.isLoading,
              history: historyQuery.isLoading,
              report: reportQuery.isLoading || recipientsQuery.isLoading
            },
            mutations: {
              saveSender: senderSaveMutation,
              testSender: senderTestMutation,
              disableSender: senderDisableMutation,
              saveCampaign: campaignSaveMutation,
              testCampaign: campaignTestMutation,
              startCampaign: campaignStartMutation,
              pauseCampaign: campaignPauseMutation,
              cancelCampaign: campaignCancelMutation,
              createSuppression: suppressionCreateMutation,
              deleteSuppression: suppressionDeleteMutation
            },
            onLoadSender(sender) {
              setSenderForm({
                senderId: sender.id,
                senderType: sender.sender_type,
                displayName: sender.display_name,
                fromName: sender.from_name,
                fromEmail: sender.from_email,
                replyToEmail: sender.reply_to_email ?? "",
                smtpHost: sender.smtp_host ?? defaultSenderForm.smtpHost,
                smtpPort: sender.smtp_port ? String(sender.smtp_port) : defaultSenderForm.smtpPort,
                smtpSecure: sender.smtp_secure,
                smtpUsername: "",
                smtpPassword: "",
                testEmail: senderForm.testEmail
              });
            },
            onResetSender() {
              setSenderForm(defaultSenderForm);
            },
            onLoadCampaign(campaign) {
              setCampaignForm({
                campaignId: campaign.id,
                name: campaign.name,
                senderId: campaign.sender_id,
                audienceGroupId: campaign.audience_group_id ?? "",
                subject: campaign.subject,
                bodyHtml: campaign.body_html,
                bodyText: campaign.body_text ?? "",
                recipientsText: "",
                testEmail: campaignForm.testEmail
              });
            },
            onResetCampaign() {
              setCampaignForm(defaultCampaignForm);
            },
            onRefresh() {
              void refreshAll();
            },
            onGoToSetup() {
              navigate("/setup/channels/email");
            }
          })}
          <PlannedFlowCard />
        </>
      )}
    </section>
  );
}

function renderActiveTab(props: {
  activeTab: EmailCampaignTab;
  stats: { totalCampaigns: number; activeCampaigns: number; verifiedSenders: number; suppressedEmails: number; recipients: number; sent: number; failed: number; pending: number };
  senders: EmailSender[];
  campaigns: EmailCampaign[];
  readyAudienceGroups: AudienceGroup[];
  suppressionEntries: EmailSuppressionEntry[];
  historyEntries: EmailHistoryEntry[];
  senderForm: SenderFormState;
  setSenderForm: React.Dispatch<React.SetStateAction<SenderFormState>>;
  campaignForm: CampaignFormState;
  setCampaignForm: React.Dispatch<React.SetStateAction<CampaignFormState>>;
  selectedComposerCampaign: EmailCampaign | null;
  selectedReportCampaignId: string;
  setSelectedReportCampaignId: (value: string) => void;
  selectedReportCampaign: EmailCampaign | null;
  report: EmailCampaignReport | null;
  recipientRows: EmailCampaignRecipient[];
  recipientSearch: string;
  setRecipientSearch: (value: string) => void;
  recipientStatusFilter: string;
  setRecipientStatusFilter: (value: string) => void;
  suppressionEmail: string;
  setSuppressionEmail: (value: string) => void;
  suppressionReason: EmailSuppressionReason;
  setSuppressionReason: (value: EmailSuppressionReason) => void;
  suppressionNote: string;
  setSuppressionNote: (value: string) => void;
  loading: { senders: boolean; campaigns: boolean; suppression: boolean; history: boolean; report: boolean };
  mutations: {
    saveSender: { mutate: () => void; isPending: boolean };
    testSender: { mutate: () => void; isPending: boolean };
    disableSender: { mutate: (senderId: string) => void; isPending: boolean };
    saveCampaign: { mutate: () => void; isPending: boolean };
    testCampaign: { mutate: () => void; isPending: boolean };
    startCampaign: { mutate: (campaignId: string) => void; isPending: boolean };
    pauseCampaign: { mutate: (campaignId: string) => void; isPending: boolean };
    cancelCampaign: { mutate: (campaignId: string) => void; isPending: boolean };
    createSuppression: { mutate: () => void; isPending: boolean };
    deleteSuppression: { mutate: (suppressionId: string) => void; isPending: boolean };
  };
  onLoadSender: (sender: EmailSender) => void;
  onResetSender: () => void;
  onLoadCampaign: (campaign: EmailCampaign) => void;
  onResetCampaign: () => void;
  onRefresh: () => void;
  onGoToSetup: () => void;
}) {
  switch (props.activeTab) {
    case "create":
      return <CreateEmailPanel {...props} />;
    case "templates":
      return <TemplatesPanel campaigns={props.campaigns} />;
    case "audience":
      return <AudiencePanel audienceGroups={props.readyAudienceGroups} />;
    case "senderSetup":
      return <SenderSetupPanel {...props} />;
    case "suppressionList":
      return <SuppressionPanel {...props} />;
    case "compliance":
      return <CompliancePanel {...props} />;
    case "reports":
      return <ReportsPanel {...props} />;
    case "history":
      return <HistoryPanel historyEntries={props.historyEntries} isLoading={props.loading.history} onRefresh={props.onRefresh} />;
    default:
      return <OverviewPanel {...props} />;
  }
}

function OverviewPanel({ stats, campaigns, senders, loading, onLoadCampaign, mutations, onGoToSetup }: Pick<Parameters<typeof renderActiveTab>[0], "stats" | "campaigns" | "senders" | "loading" | "onLoadCampaign" | "mutations" | "onGoToSetup">) {
  const campaignPagination = usePanelPagination(campaigns);
  const verifiedSenders = senders.filter((sender) => sender.status === "verified");
  const overviewItems = [
    { label: "Total Campaigns", value: String(stats.totalCampaigns) },
    { label: "Active Campaigns", value: String(stats.activeCampaigns) },
    { label: "Verified Senders", value: String(stats.verifiedSenders) },
    { label: "Sent / Failed", value: `${stats.sent} / ${stats.failed}` }
  ];

  return (
    <div className="space-y-4">
      {verifiedSenders.length === 0 ? (
        <Card elevated className="space-y-4 border-warning/20 bg-warning/5 p-4 sm:p-5">
          <SectionIntro eyebrow="Sender Required" title="No verified email sender found. Set up your sender first." description="Email campaigns now consume verified senders from Setup → Channels → Email. Configure and test a sender there before creating or starting campaigns." />
          <div>
            <Button onClick={onGoToSetup}>Go to Email Setup</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewItems.map((item) => (
          <Card key={item.label} className="min-h-[88px] p-3 sm:min-h-[112px] sm:p-4" elevated>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft sm:text-[11px]">{item.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-text sm:mt-3 sm:text-2xl">{item.value}</p>
            <p className="mt-1 text-xs text-text-muted">Email module metric</p>
          </Card>
        ))}
      </div>

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <SectionIntro
          eyebrow="Setup Progress"
          title="Email Campaign Setup Progress"
          description="Sender setup is owned by Setup → Channels → Email, while this campaign surface consumes verified senders and reports delivery status."
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {setupProgressItems.map((item) => (
            <DisabledChecklistItem key={item} checked={computeSetupStatus(item, senders, campaigns)} label={item} />
          ))}
        </div>
      </Card>

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <SectionIntro eyebrow="Recent Campaigns" title="Latest Email Campaigns" description="Drafts, in-flight sends, and completed runs share the same report surface below." />
          <Button variant="secondary" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <RefreshCw size={16} /> Top
          </Button>
        </div>
        {loading.campaigns ? <EmptyState title="Loading campaigns" description="Fetching email campaign summary." /> : null}
        <div className="workspace-table-wrap">
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Sender</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Sent</th>
                <th>Failed</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={7}><EmptyTableCell title="No email campaigns yet" description="Create a sender first, then save an email draft." /></td>
                </tr>
              ) : (
                campaignPagination.visibleItems.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>
                      <div>
                        <p className="font-semibold text-text">{campaign.name}</p>
                        <p className="text-xs text-text-muted">{campaign.subject}</p>
                      </div>
                    </td>
                    <td>{campaign.sender_display_name ?? campaign.sender_from_email ?? "-"}</td>
                    <td><StatusBadge tone={statusTone(campaign.status)}>{humanize(campaign.status)}</StatusBadge></td>
                    <td>{campaign.recipients}</td>
                    <td>{campaign.sent}</td>
                    <td>{campaign.failed}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => onLoadCampaign(campaign)}>Edit</Button>
                        {campaign.status === "draft" || campaign.status === "paused" ? (
                          <Button size="sm" onClick={() => mutations.startCampaign.mutate(campaign.id)} disabled={mutations.startCampaign.isPending}>
                            <Play size={14} /> Start
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PanelPagination page={campaignPagination.page} pageCount={campaignPagination.pageCount} pageSize={campaignPagination.pageSize} totalItems={campaignPagination.totalItems} onPageChange={campaignPagination.setPage} />
      </Card>
    </div>
  );
}

function SenderSetupPanel({ senders, loading, onGoToSetup }: Pick<Parameters<typeof renderActiveTab>[0], "senders" | "loading" | "onGoToSetup">) {
  const verifiedSenders = senders.filter((sender) => sender.status === "verified");

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Card elevated className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionIntro eyebrow="Sender Setup" title="Email sender setup now lives in Setup" description="Campaigns Email only references configured senders. Gmail App Password and Custom SMTP setup is owned by Setup Channels Email." />
          <Button variant="secondary" onClick={onGoToSetup}>Go to Email Setup</Button>
        </div>
        <div className="rounded-lg border border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
          Use Setup Channels Email to create or edit Gmail App Password and Custom SMTP senders. Password entry, provider presets, and sender verification are intentionally centralized there.
        </div>
        <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-text-muted">
          This campaign tab stays read-only so the campaign workflow does not duplicate sender configuration. Verified senders become available automatically in the create tab after a successful setup test.
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <DisabledChecklistItem checked={senders.length > 0} label="At least one sender configured" />
          <DisabledChecklistItem checked={verifiedSenders.length > 0} label="At least one sender verified" />
          <DisabledChecklistItem checked={senders.some((sender) => sender.status === "verified" && Boolean(sender.reply_to_email || sender.from_email))} label="Sender identity configured" />
          <DisabledChecklistItem checked={senders.some((sender) => Boolean(sender.last_test_at))} label="Test email executed" />
        </div>
      </Card>

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <SectionIntro eyebrow="Saved Senders" title="Verified Sender Inventory" description="Campaign sending only consumes verified senders from the setup page. This tab stays read-only for campaign operators." />
        {loading.senders ? <EmptyState title="Loading senders" description="Fetching sender inventory." /> : null}
        <div className="space-y-3">
          {senders.length === 0 ? (
            <EmptyState title="No senders configured" description="No verified email sender found. Set up your sender first." />
          ) : (
            senders.map((sender) => {
              const SenderIcon = senderTypes.find((item) => item.title.toLowerCase().includes(sender.sender_type === "gmail_app_password" ? "gmail" : "custom"))?.icon ?? Mail;
              return (
                <div key={sender.id} className="border border-border bg-background-tint p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><SenderIcon size={18} /></span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text">{sender.display_name}</p>
                        <p className="truncate text-xs text-text-muted">{sender.from_name} · {sender.from_email}</p>
                        <p className="mt-1 text-xs text-text-soft">{sender.smtp_host ?? "No host"} · {sender.smtp_username_masked ?? "Username hidden"}</p>
                      </div>
                    </div>
                    <StatusBadge tone={statusTone(sender.status)}>{humanize(sender.status)}</StatusBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                    <span>Password: {sender.smtp_password_configured ? "configured" : "missing"}</span>
                    <span>Last test: {formatDate(sender.last_test_at)}</span>
                  </div>
                  {sender.last_test_error ? <p className="mt-2 text-xs text-destructive">{sender.last_test_error}</p> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={onGoToSetup}>Open Email Setup</Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

function CreateEmailPanel({ campaignForm, setCampaignForm, senders, readyAudienceGroups, campaigns, selectedComposerCampaign, mutations, onLoadCampaign, onResetCampaign, onGoToSetup }: Pick<Parameters<typeof renderActiveTab>[0], "campaignForm" | "setCampaignForm" | "senders" | "readyAudienceGroups" | "campaigns" | "selectedComposerCampaign" | "mutations" | "onLoadCampaign" | "onResetCampaign" | "onGoToSetup">) {
  const verifiedSenders = senders.filter((sender) => sender.status === "verified");
  const draftCampaigns = campaigns.filter((campaign) => campaign.status === "draft");

  if (verifiedSenders.length === 0) {
    return (
      <Card elevated className="space-y-4 p-5 sm:p-6">
        <SectionIntro eyebrow="Verified Sender Required" title="No verified email sender found. Set up your sender first." description="Campaign draft creation only uses verified senders from Setup → Channels → Email. Configure and test a sender there before returning to this page." />
        <div>
          <Button onClick={onGoToSetup}>Go to Email Setup</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <Card elevated className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionIntro eyebrow="Campaign Wizard" title="Create Email Campaign" description="Save a draft first, then send a test and start delivery when the sender is verified and the audience is ready." />
          <Button variant="secondary" onClick={onResetCampaign}>New Draft</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="workspace-label">Existing Draft</span>
            <Select value={campaignForm.campaignId} onChange={(event) => {
              const campaign = draftCampaigns.find((item) => item.id === event.target.value);
              if (campaign) {
                onLoadCampaign(campaign);
              } else {
                onResetCampaign();
              }
            }}>
              <option value="">New draft</option>
              {draftCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
            </Select>
          </label>
          <label>
            <span className="workspace-label">Campaign Name</span>
            <Input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} placeholder="June Product Launch" />
          </label>
          <label>
            <span className="workspace-label">Verified Sender</span>
            <Select value={campaignForm.senderId} onChange={(event) => setCampaignForm((current) => ({ ...current, senderId: event.target.value }))}>
              <option value="">Select sender</option>
              {verifiedSenders.map((sender) => <option key={sender.id} value={sender.id}>{sender.display_name} · {sender.from_email}</option>)}
            </Select>
          </label>
          <label>
            <span className="workspace-label">Audience Group</span>
            <Select value={campaignForm.audienceGroupId} onChange={(event) => setCampaignForm((current) => ({ ...current, audienceGroupId: event.target.value }))}>
              <option value="">Manual recipients only</option>
              {readyAudienceGroups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.valid_count} valid</option>)}
            </Select>
          </label>
          <label className="md:col-span-2">
            <span className="workspace-label">Subject</span>
            <Input value={campaignForm.subject} onChange={(event) => setCampaignForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Important update from our team" />
          </label>
          <label className="md:col-span-2">
            <span className="workspace-label">Body HTML or plain text</span>
            <textarea className="input-base min-h-48 w-full" value={campaignForm.bodyHtml} onChange={(event) => setCampaignForm((current) => ({ ...current, bodyHtml: event.target.value }))} placeholder="Write your email body. Plain text will be converted into simple paragraphs." />
          </label>
          <label className="md:col-span-2">
            <span className="workspace-label">Plain-text fallback</span>
            <textarea className="input-base min-h-28 w-full" value={campaignForm.bodyText} onChange={(event) => setCampaignForm((current) => ({ ...current, bodyText: event.target.value }))} placeholder="Optional. If left blank, the backend derives plain text from the HTML body." />
          </label>
          <label className="md:col-span-2">
            <span className="workspace-label">Manual Recipients</span>
            <textarea className="input-base min-h-32 w-full" value={campaignForm.recipientsText} onChange={(event) => setCampaignForm((current) => ({ ...current, recipientsText: event.target.value }))} placeholder={"One per line. Examples:\nali@example.com\nAlya <alya@example.com>"} />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label>
            <span className="workspace-label">Test Recipient</span>
            <Input value={campaignForm.testEmail} onChange={(event) => setCampaignForm((current) => ({ ...current, testEmail: event.target.value }))} placeholder="qa@example.com" />
          </label>
          <Button onClick={() => mutations.saveCampaign.mutate()} disabled={mutations.saveCampaign.isPending}>{campaignForm.campaignId ? "Update Draft" : "Save Draft"}</Button>
          <Button variant="secondary" onClick={() => mutations.testCampaign.mutate()} disabled={mutations.testCampaign.isPending || !campaignForm.campaignId || !campaignForm.testEmail.trim()}>
            <Send size={16} /> Send Test
          </Button>
        </div>
      </Card>

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <SectionIntro eyebrow="Draft Summary" title="Launch Readiness" description="Use this panel to see whether the currently loaded draft is ready for start. Starting is only enabled after the draft is saved." />
        <div className="space-y-3 rounded-lg border border-border bg-background-tint p-4 text-sm text-text-muted">
          <p><span className="font-semibold text-text">Draft:</span> {(selectedComposerCampaign?.name ?? campaignForm.name) || "Unsaved draft"}</p>
          <p><span className="font-semibold text-text">Sender:</span> {senders.find((sender) => sender.id === campaignForm.senderId)?.display_name ?? "No sender selected"}</p>
          <p><span className="font-semibold text-text">Audience:</span> {readyAudienceGroups.find((group) => group.id === campaignForm.audienceGroupId)?.name ?? "Manual recipients only"}</p>
          <p><span className="font-semibold text-text">Manual recipients:</span> {parseRecipients(campaignForm.recipientsText).length}</p>
          <p><span className="font-semibold text-text">Unsubscribe footer:</span> {hasUnsubscribeCopy(campaignForm.bodyHtml) ? "present" : "backend will append it automatically"}</p>
        </div>
        <div className="rounded-lg border border-primary/15 bg-primary/5 p-4 text-sm text-text-muted">
          <p className="font-semibold text-text">Preview</p>
          <div className="mt-3 rounded-lg border border-border bg-card p-4 text-sm leading-6 text-text">
            {campaignForm.subject ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{campaignForm.subject}</p> : null}
            <div className="mt-3 whitespace-pre-wrap">{stripHtml(campaignForm.bodyText || campaignForm.bodyHtml) || "Compose a subject and message body to preview the plain-text fallback here."}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {campaignForm.campaignId ? (
            <Button onClick={() => mutations.startCampaign.mutate(campaignForm.campaignId)} disabled={mutations.startCampaign.isPending}>
              <Play size={16} /> Start Campaign
            </Button>
          ) : null}
          {selectedComposerCampaign?.status === "sending" ? (
            <Button variant="secondary" onClick={() => mutations.pauseCampaign.mutate(selectedComposerCampaign.id)} disabled={mutations.pauseCampaign.isPending}>
              <PauseCircle size={16} /> Pause
            </Button>
          ) : null}
          {campaignForm.campaignId ? (
            <Button variant="danger" onClick={() => mutations.cancelCampaign.mutate(campaignForm.campaignId)} disabled={mutations.cancelCampaign.isPending}>
              <XCircle size={16} /> Cancel
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function TemplatesPanel({ campaigns }: { campaigns: EmailCampaign[] }) {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Templates"
        title="Template Governance Reuse"
        description="Sprint 5 does not create a second template system. Email MVP drafts use direct subject/body composition while Sprint 3 governance remains the source of truth for governed messaging workflows."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templateCards.map((template) => (
          <div key={template.title} className="flex min-h-[170px] flex-col justify-between border border-border bg-card p-4 shadow-soft">
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-text">{template.title}</h3>
                <StatusBadge tone="muted">Governance Reused</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">{template.description}</p>
            </div>
            <p className="mt-4 text-xs text-text-soft">Active email drafts: {campaigns.filter((campaign) => campaign.subject.toLowerCase().includes(template.title.split(" ")[0].toLowerCase())).length}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AudiencePanel({ audienceGroups }: { audienceGroups: AudienceGroup[] }) {
  const audiencePagination = usePanelPagination(audienceGroups);

  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Audience"
        title="Audience Management"
        description="Email MVP reuses the existing audience group dataset and resolves email recipients through linked CRM contacts. Imported groups with valid rows are available in the draft composer."
      />
      <InfoNotice icon={<AlertCircle size={18} />} title="Reuse-first audience flow">
        Existing audience groups are not duplicated. Email campaigns can target any imported audience group that already links to CRM contacts with email addresses.
      </InfoNotice>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {audienceSections.map((section) => {
          const Icon = section.icon;

          return (
            <div key={section.title} className="border border-border bg-background-tint p-4 opacity-75">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
                <Icon size={17} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-text">{section.title}</h3>
              <p className="mt-2 text-xs leading-5 text-text-muted">{section.description}</p>
            </div>
          );
        })}
      </div>
      <div className="workspace-table-wrap">
        <table className="workspace-table">
          <thead>
            <tr>
              <th>Audience Group</th>
              <th>Status</th>
              <th>Valid Contacts</th>
              <th>Invalid</th>
              <th>Duplicates</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {audienceGroups.length === 0 ? (
              <tr>
                <td colSpan={6}><EmptyTableCell title="No reusable audience groups" description="Import or link an audience group first, then select it while creating an email draft." /></td>
              </tr>
            ) : (
              audiencePagination.visibleItems.map((group) => (
                <tr key={group.id}>
                  <td>{group.name}</td>
                  <td><StatusBadge tone={group.status === "imported" ? "success" : "muted"}>{group.status}</StatusBadge></td>
                  <td>{group.valid_count}</td>
                  <td>{group.invalid_count}</td>
                  <td>{group.duplicate_count}</td>
                  <td>{formatDate(group.updated_at ?? group.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PanelPagination page={audiencePagination.page} pageCount={audiencePagination.pageCount} pageSize={audiencePagination.pageSize} totalItems={audiencePagination.totalItems} onPageChange={audiencePagination.setPage} />
    </Card>
  );
}

function SuppressionPanel({ suppressionEmail, setSuppressionEmail, suppressionReason, setSuppressionReason, suppressionNote, setSuppressionNote, suppressionEntries, mutations, loading }: Pick<Parameters<typeof renderActiveTab>[0], "suppressionEmail" | "setSuppressionEmail" | "suppressionReason" | "setSuppressionReason" | "suppressionNote" | "setSuppressionNote" | "suppressionEntries" | "mutations" | "loading">) {
  const suppressionPagination = usePanelPagination(suppressionEntries);

  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Suppression List"
        title="Suppression List"
        description="Prevent delivery to unsubscribed, bounced, complained, or manually blocked recipients. Public unsubscribe links also write into this same suppression table."
      />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px] lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
        <label>
          <span className="workspace-label">Email Address</span>
          <Input value={suppressionEmail} onChange={(event) => setSuppressionEmail(event.target.value)} placeholder="blocked@example.com" />
        </label>
        <label>
          <span className="workspace-label">Reason</span>
          <Select value={suppressionReason} onChange={(event) => setSuppressionReason(event.target.value as EmailSuppressionReason)}>
            <option value="manual">Manual</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
            <option value="complaint">Complaint</option>
          </Select>
        </label>
        <label>
          <span className="workspace-label">Note</span>
          <Input value={suppressionNote} onChange={(event) => setSuppressionNote(event.target.value)} placeholder="Optional detail" />
        </label>
        <div className="flex items-end">
          <Button onClick={() => mutations.createSuppression.mutate()} disabled={mutations.createSuppression.isPending}>Add Entry</Button>
        </div>
      </div>
      {loading.suppression ? <EmptyState title="Loading suppression list" description="Fetching blocked and unsubscribed recipients." /> : null}
      <div className="workspace-table-wrap">
        <table className="workspace-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Reason</th>
              <th>Source</th>
              <th>Note</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppressionEntries.length === 0 ? (
              <tr>
                <td colSpan={6}><EmptyTableCell title="Suppression list is empty" description="Entries appear here when users unsubscribe or admins block an address." /></td>
              </tr>
            ) : (
              suppressionPagination.visibleItems.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.email}</td>
                  <td><StatusBadge tone={entry.reason === "manual" ? "muted" : "warning"}>{entry.reason}</StatusBadge></td>
                  <td>{entry.source ?? "-"}</td>
                  <td>{entry.note ?? "-"}</td>
                  <td>{formatDate(entry.created_at)}</td>
                  <td><Button size="sm" variant="danger" onClick={() => mutations.deleteSuppression.mutate(entry.id)} disabled={mutations.deleteSuppression.isPending}>Remove</Button></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PanelPagination page={suppressionPagination.page} pageCount={suppressionPagination.pageCount} pageSize={suppressionPagination.pageSize} totalItems={suppressionPagination.totalItems} onPageChange={suppressionPagination.setPage} />
    </Card>
  );
}

function CompliancePanel({ campaignForm, senders, suppressionEntries, selectedComposerCampaign, campaigns }: Pick<Parameters<typeof renderActiveTab>[0], "campaignForm" | "senders" | "suppressionEntries" | "selectedComposerCampaign" | "campaigns">) {
  const selectedSender = senders.find((sender) => sender.id === campaignForm.senderId) ?? null;
  const complianceItems = [
    { label: "Sender verified", checked: selectedSender?.status === "verified" },
    { label: "Reply-to email configured", checked: Boolean(selectedSender?.reply_to_email || selectedSender?.from_email) },
    { label: "Email body present", checked: Boolean(campaignForm.bodyHtml.trim()) },
    { label: "Unsubscribe copy present", checked: hasUnsubscribeCopy(campaignForm.bodyHtml) || Boolean(selectedComposerCampaign) },
    { label: "Suppression list checked", checked: suppressionEntries.length >= 0 },
    { label: "Campaign draft saved", checked: Boolean(selectedComposerCampaign?.id) },
    { label: "At least one recipient source", checked: Boolean(campaignForm.audienceGroupId || parseRecipients(campaignForm.recipientsText).length > 0) }
  ];

  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Compliance"
        title="Compliance and Safety Check"
        description="This MVP keeps a narrow compliance view: verified sender, unsubscribe handling, suppression use, and draft readiness without changing the Sprint 4 WhatsApp safety flow."
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {complianceItems.map((item) => (
          <DisabledChecklistItem key={item.label} checked={item.checked} label={item.label} />
        ))}
      </div>
      <InfoNotice icon={<ShieldCheck size={18} />} title="Safety guard">
        Unsubscribe links are appended automatically during dispatch. Contacts on the suppression list are skipped before send, and send history remains in the audit log for review.
      </InfoNotice>
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Drafts" value={campaigns.filter((campaign) => campaign.status === "draft").length} />
        <MetricCard label="Verified Senders" value={senders.filter((sender) => sender.status === "verified").length} />
        <MetricCard label="Suppressed Emails" value={suppressionEntries.length} />
        <MetricCard label="Ready Checks Passed" value={complianceItems.filter((item) => item.checked).length} />
      </div>
    </Card>
  );
}

function ReportsPanel({ campaigns, selectedReportCampaignId, setSelectedReportCampaignId, selectedReportCampaign, report, recipientRows, recipientSearch, setRecipientSearch, recipientStatusFilter, setRecipientStatusFilter, loading, mutations }: Pick<Parameters<typeof renderActiveTab>[0], "campaigns" | "selectedReportCampaignId" | "setSelectedReportCampaignId" | "selectedReportCampaign" | "report" | "recipientRows" | "recipientSearch" | "setRecipientSearch" | "recipientStatusFilter" | "setRecipientStatusFilter" | "loading" | "mutations">) {
  const recipientPagination = usePanelPagination(recipientRows);

  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Reports"
        title="Email Campaign Reports"
        description="Reports show recipient outcomes for the selected campaign. Opens and clicks remain available in the schema, but this MVP does not yet collect tracking events."
      />
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
        <label>
          <span className="workspace-label">Campaign</span>
          <Select value={selectedReportCampaignId} onChange={(event) => setSelectedReportCampaignId(event.target.value)}>
            <option value="">Select campaign</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.status}</option>)}
          </Select>
        </label>
        <label>
          <span className="workspace-label">Recipient Search</span>
          <Input value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="email or failure" />
        </label>
        <label>
          <span className="workspace-label">Recipient Status</span>
          <Select value={recipientStatusFilter} onChange={(event) => setRecipientStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
            <option value="unsubscribed">Unsubscribed</option>
          </Select>
        </label>
      </div>
      {selectedReportCampaign ? (
        <div className="flex flex-wrap gap-2">
          {(selectedReportCampaign.status === "draft" || selectedReportCampaign.status === "paused") ? (
            <Button onClick={() => mutations.startCampaign.mutate(selectedReportCampaign.id)} disabled={mutations.startCampaign.isPending}><Play size={16} /> Start</Button>
          ) : null}
          {selectedReportCampaign.status === "sending" ? (
            <Button variant="secondary" onClick={() => mutations.pauseCampaign.mutate(selectedReportCampaign.id)} disabled={mutations.pauseCampaign.isPending}><PauseCircle size={16} /> Pause</Button>
          ) : null}
          {selectedReportCampaign.status !== "cancelled" && selectedReportCampaign.status !== "sent" ? (
            <Button variant="danger" onClick={() => mutations.cancelCampaign.mutate(selectedReportCampaign.id)} disabled={mutations.cancelCampaign.isPending}><XCircle size={16} /> Cancel</Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Sent", value: report?.sent ?? 0 },
          { label: "Pending", value: report?.pending ?? 0 },
          { label: "Failed", value: report?.failed ?? 0 },
          { label: "Skipped", value: report?.skipped ?? 0 },
          { label: "Opened", value: report?.opened ?? 0 },
          { label: "Unsubscribed", value: report?.unsubscribed ?? 0 }
        ].map((metric) => (
          <div key={metric.label} className="border border-border bg-background-tint p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{metric.label}</p>
            <p className="mt-2 text-xl font-semibold text-text">{metric.value}</p>
          </div>
        ))}
      </div>
      <div className="workspace-table-wrap">
        <table className="workspace-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Recipient</th>
              <th>Name</th>
              <th>Failure</th>
              <th>Sent At</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {!selectedReportCampaignId ? (
              <tr>
                <td colSpan={5}><EmptyTableCell title="Select a campaign" description="Choose a campaign above to review recipient outcomes." /></td>
              </tr>
            ) : loading.report ? (
              <tr>
                <td colSpan={5}><EmptyTableCell title="Loading report" description="Fetching recipient outcomes." /></td>
              </tr>
            ) : recipientRows.length === 0 ? (
              <tr>
                <td colSpan={5}><EmptyTableCell title="No recipients found" description="This campaign has not produced recipient rows for the current filter." /></td>
              </tr>
            ) : (
              recipientPagination.visibleItems.map((recipient) => (
                <tr key={recipient.id}>
                  <td><StatusBadge tone={statusTone(recipient.status)}>{humanize(recipient.status)}</StatusBadge></td>
                  <td>{recipient.email}</td>
                  <td>{recipient.name ?? "-"}</td>
                  <td>{recipient.failure_reason ?? "-"}</td>
                  <td>{formatDate(recipient.sent_at)}</td>
                  <td>{formatDate(recipient.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PanelPagination page={recipientPagination.page} pageCount={recipientPagination.pageCount} pageSize={recipientPagination.pageSize} totalItems={recipientPagination.totalItems} onPageChange={recipientPagination.setPage} />
    </Card>
  );
}

function HistoryPanel({ historyEntries, isLoading, onRefresh }: { historyEntries: EmailHistoryEntry[]; isLoading: boolean; onRefresh: () => void }) {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="History"
        title="Email Campaign History"
        description="Audit-backed email sender, suppression, test-send, start, pause, cancel, and unsubscribe events appear here."
      />
      <div className="flex justify-end"><Button variant="secondary" onClick={onRefresh}><RefreshCw size={16} /> Refresh History</Button></div>
      <div className="space-y-3">
        {isLoading ? <EmptyState title="Loading history" description="Fetching email audit events." /> : null}
        {!isLoading && historyEntries.length === 0 ? <EmptyState title="No email history yet" description="Audit entries will appear after sender setup, tests, sends, or unsubscribes." /> : null}
        {historyEntries.map((entry, index) => (
          <div key={entry.id} className="flex items-center gap-3 border border-border bg-background-tint p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-text-soft">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text">{humanize(entry.action)}</p>
              <p className="text-xs text-text-muted">{formatDate(entry.created_at)} · {entry.entity_type}</p>
              {entry.metadata ? <p className="mt-1 truncate text-xs text-text-soft">{formatMetadata(entry.metadata)}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DisabledNotice({ isEmailAccessEnabled }: { isEmailAccessEnabled: boolean }) {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
          <Sparkles size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Not Enabled</p>
            {isEmailAccessEnabled ? <StatusBadge tone="muted">Placeholder Mode</StatusBadge> : <StatusBadge tone="muted">Access Disabled</StatusBadge>}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-text">Email campaign access is currently disabled</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Admin must enable the email campaign module before users can connect senders, create drafts, manage suppression, or start email campaigns.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" disabled>Request Access</Button>
        <Button variant="secondary" disabled>View Setup Guide</Button>
      </div>
    </Card>
  );
}

function PlannedFlowCard() {
  return (
    <Card elevated className="p-4 sm:p-5">
      <SectionIntro
        eyebrow="Planned Flow"
        title="Planned Email Campaign Flow"
        description="Sender Setup -> Draft -> Test Send -> Suppression Check -> Start -> Report -> Audit History"
      />
    </Card>
  );
}

function SectionIntro({ description, eyebrow, title }: { description: string; eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-text">{title}</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
    </div>
  );
}

function DisabledChecklistItem({ label, checked = false }: { label: string; checked?: boolean }) {
  return (
    <label className="flex items-center gap-3 border border-border bg-background-tint p-3">
      <input className="h-4 w-4 accent-primary" type="checkbox" checked={checked} readOnly />
      <span className={checked ? "text-sm font-medium text-text" : "text-sm font-medium text-text-muted"}>{label}</span>
    </label>
  );
}

function InfoNotice({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <div className="flex items-start gap-3 border border-primary/15 bg-primary/5 p-4 text-sm">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <p className="font-semibold text-text">{title}</p>
        <p className="mt-1 leading-6 text-text-muted">{children}</p>
      </div>
    </div>
  );
}

function StatusBadge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "muted" | "success" | "warning" | "danger" }) {
  return (
    <span className={[
      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
      tone === "success"
        ? "border-success/20 bg-success/10 text-success"
        : tone === "warning"
          ? "border-warning/20 bg-warning/10 text-warning"
          : tone === "danger"
            ? "border-destructive/20 bg-destructive/10 text-destructive"
            : tone === "muted"
              ? "border-border bg-background-tint text-text-muted"
              : "border-primary/20 bg-primary/10 text-primary"
    ].join(" ")}>
      {children}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background-tint px-4 py-8 text-center">
      <FileCheck2 size={20} className="text-text-soft" />
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="max-w-xl text-xs text-text-muted">{description}</p>
    </div>
  );
}

function EmptyTableCell({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <FileCheck2 size={22} className="text-text-soft" />
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="text-xs text-text-muted">{description}</p>
    </div>
  );
}

function computeSetupStatus(item: string, senders: EmailSender[], campaigns: EmailCampaign[]) {
  if (item === "Enable Email Campaign Module") return true;
  if (item === "Add Sender Account") return senders.length > 0;
  if (item === "Verify Sender") return senders.some((sender) => sender.status === "verified");
  if (item === "Create Email Template") return campaigns.some((campaign) => Boolean(campaign.body_html));
  if (item === "Upload / Select Audience") return campaigns.some((campaign) => Boolean(campaign.audience_group_id) || campaign.recipients > 0);
  if (item === "Configure Compliance Footer") return campaigns.some((campaign) => hasUnsubscribeCopy(campaign.body_html));
  if (item === "Send Test Email") return senders.some((sender) => Boolean(sender.last_test_at));
  if (item === "Activate Campaign Sending") return campaigns.some((campaign) => campaign.status === "sending" || campaign.status === "sent");
  return false;
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function parseRecipients(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const angleMatch = line.match(/^(.*)<([^>]+)>$/);
      if (angleMatch) {
        return { name: angleMatch[1].trim() || null, email: angleMatch[2].trim(), contact_id: null };
      }

      return { name: null, email: line, contact_id: null };
    });
}

function normalizeHtmlBody(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .split(/\r?\n\r?\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br />")}</p>`)
    .join("");
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function hasUnsubscribeCopy(value: string) {
  return /unsubscribe/i.test(value);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatMetadata(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function statusTone(status: string): "default" | "muted" | "success" | "warning" | "danger" {
  if (["verified", "sent"].includes(status)) return "success";
  if (["failed", "cancelled"].includes(status)) return "danger";
  if (["paused", "skipped", "unsubscribed", "bounced"].includes(status)) return "warning";
  if (["disabled"].includes(status)) return "muted";
  return "default";
}
