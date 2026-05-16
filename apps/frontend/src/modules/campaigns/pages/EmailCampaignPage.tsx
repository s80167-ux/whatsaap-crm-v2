import {
  AlertCircle,
  Ban,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Mail,
  MailCheck,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  UserX,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { useCampaignEmailModuleStatus } from "../../../hooks/useAdmin";
import type { DashboardOutletContext } from "../../../layouts/DashboardLayout";
import { CampaignModuleTabs } from "../components/CampaignModuleTabs";

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

const overviewItems = [
  { label: "Total Campaigns", value: "0" },
  { label: "Scheduled", value: "0" },
  { label: "Sent", value: "0" },
  { label: "Opened / Clicked", value: "0 / 0" }
];

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
    title: "Microsoft / Outlook",
    lines: ["Corporate Microsoft 365", "Outlook / Hotmail personal"],
    icon: MailCheck
  },
  {
    title: "Google / Gmail",
    lines: ["Google Workspace", "Gmail personal"],
    icon: Mail
  },
  {
    title: "Yahoo Mail",
    lines: ["For personal or legacy email accounts"],
    icon: Mail
  },
  {
    title: "iCloud Mail",
    lines: ["For Apple iCloud email users"],
    icon: Mail
  },
  {
    title: "Zoho Mail",
    lines: ["For SME business email"],
    icon: WalletCards
  },
  {
    title: "Custom Domain Email",
    lines: ["For cPanel, hosting email, Exabytes, GB Network, Hostinger or other SMTP email"],
    icon: ShieldCheck
  }
];

const createSteps = ["Sender", "Audience", "Message", "Safety Check", "Preview", "Schedule", "Report"];

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

const suppressionCategories = ["Unsubscribed", "Bounced", "Blocked", "Complaints", "Manual Exclusion"];

const complianceItems = [
  "Sender verified",
  "Reply-to email configured",
  "Company footer added",
  "Unsubscribe instruction added",
  "Suppression list checked",
  "Test email sent",
  "Campaign approved"
];

const reportMetrics = ["Sent", "Delivered", "Failed", "Opened", "Clicked", "Unsubscribed"];

const historyItems = ["Sender connected", "Template created", "Campaign scheduled", "Campaign sent", "Report generated"];

export function EmailCampaignPage({ activeTab = "overview" }: { activeTab?: EmailCampaignTab }) {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : null;
  const emailModuleStatus = useCampaignEmailModuleStatus(null, !outletContext.isSuperAdmin);
  const isEmailAccessEnabled = outletContext.isSuperAdmin ? true : emailModuleStatus.data?.isEnabled === true;

  return (
    <section className="space-y-5">
      <Card elevated className="workspace-page-header p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Campaigns</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <h2 className="section-title">Email Campaign</h2>
              <StatusBadge>Coming Soon</StatusBadge>
              <StatusBadge tone="muted">Not Enabled</StatusBadge>
            </div>
            <p className="mt-2 max-w-3xl section-copy">
              Email blast, email templates, audience segmentation, sender setup, compliance checks, reports, and email campaign history will be available in a future release.
            </p>
          </div>
          <Button className="w-full shrink-0 px-3 sm:w-auto sm:px-5" disabled>
            Create Email Campaign
          </Button>
        </div>
      </Card>

      <CampaignModuleTabs channel="email" />

      {outletContext.isSuperAdmin && !organizationId ? (
        <Card elevated className="p-5 text-sm text-text-muted">
          Choose an organization from the sidebar before reviewing Email campaign access.
        </Card>
      ) : (
        <>
          <DisabledNotice isEmailAccessEnabled={isEmailAccessEnabled} />
          {renderActiveTab(activeTab)}
          <PlannedFlowCard />
        </>
      )}
    </section>
  );
}

function renderActiveTab(activeTab: EmailCampaignTab) {
  switch (activeTab) {
    case "create":
      return <CreateEmailPlaceholder />;
    case "templates":
      return <TemplatesPlaceholder />;
    case "audience":
      return <AudiencePlaceholder />;
    case "senderSetup":
      return <SenderSetupPlaceholder />;
    case "suppressionList":
      return <SuppressionListPlaceholder />;
    case "compliance":
      return <CompliancePlaceholder />;
    case "reports":
      return <ReportsPlaceholder />;
    case "history":
      return <HistoryPlaceholder />;
    default:
      return <OverviewPlaceholder />;
  }
}

function OverviewPlaceholder() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewItems.map((item) => (
          <Card key={item.label} className="min-h-[88px] p-3 sm:min-h-[112px] sm:p-4" elevated>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-soft sm:text-[11px]">{item.label}</p>
            <p className="mt-2 text-xl font-semibold tracking-tight text-text sm:mt-3 sm:text-2xl">{item.value}</p>
            <p className="mt-1 text-xs text-text-muted">Coming Soon</p>
          </Card>
        ))}
      </div>

      <Card elevated className="space-y-4 p-4 sm:p-5">
        <SectionIntro
          eyebrow="Setup Progress"
          title="Email Campaign Setup Progress"
          description="These steps preview the future setup path. Every item is inactive while the module remains in placeholder mode."
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {setupProgressItems.map((item) => (
            <DisabledChecklistItem key={item} label={item} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function SenderSetupPlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Sender Setup"
        title="Email Sender Setup"
        description="Connect and verify sender accounts before creating email campaigns."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {senderTypes.map((sender) => {
          const Icon = sender.icon;

          return (
            <div key={sender.title} className="flex min-h-[190px] flex-col justify-between border border-border bg-card p-4 shadow-soft">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
                    <Icon size={18} />
                  </span>
                  <StatusBadge>Coming Soon</StatusBadge>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-text">{sender.title}</h3>
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted">
                    {sender.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <Button className="mt-4 w-full" variant="secondary" size="sm" disabled>
                Setup Later
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CreateEmailPlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Campaign Wizard"
        title="Create Email Campaign"
        description="Email campaign creation will be available once sender setup, audience management and compliance checks are enabled."
      />
      <div className="grid gap-3 lg:grid-cols-7">
        {createSteps.map((step, index) => (
          <div key={step} className="border border-border bg-background-tint p-4 opacity-75">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">Step {index + 1}</p>
            <p className="mt-2 text-sm font-semibold text-text">{step}</p>
            <p className="mt-2 text-xs text-text-muted">Disabled</p>
          </div>
        ))}
      </div>
      <Button disabled>Start Email Campaign</Button>
    </Card>
  );
}

function TemplatesPlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Templates"
        title="Email Templates"
        description="Reusable email layouts will be available after the email module is enabled."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templateCards.map((template) => (
          <div key={template.title} className="flex min-h-[170px] flex-col justify-between border border-border bg-card p-4 shadow-soft">
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-text">{template.title}</h3>
                <StatusBadge>Coming Soon</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">{template.description}</p>
            </div>
            <Button className="mt-4 w-full" variant="secondary" size="sm" disabled>
              Use Template
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AudiencePlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Audience"
        title="Audience Management"
        description="Prepare recipient lists and segments without enabling email delivery yet."
      />
      <InfoNotice icon={<AlertCircle size={18} />} title="Audience tools disabled">
        Audience upload and segmentation are currently disabled until Email Campaign module is enabled.
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
    </Card>
  );
}

function SuppressionListPlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Suppression List"
        title="Suppression List"
        description="Prevent sending to unsubscribed, bounced, blocked or opted-out contacts."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {suppressionCategories.map((category) => (
          <div key={category} className="border border-border bg-background-tint p-4 opacity-75">
            <Ban size={18} className="text-text-soft" />
            <p className="mt-3 text-sm font-semibold text-text">{category}</p>
            <p className="mt-1 text-xs text-text-muted">Coming Soon</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" disabled>Import Suppression List</Button>
        <Button variant="secondary" disabled>Add Email Manually</Button>
      </div>
    </Card>
  );
}

function CompliancePlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Compliance"
        title="Compliance and Safety Check"
        description="This check will help reduce spam risk and protect sender reputation."
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {complianceItems.map((item) => (
          <DisabledChecklistItem key={item} label={item} />
        ))}
      </div>
      <InfoNotice icon={<ShieldCheck size={18} />} title="Safety guard">
        Campaign approval, unsubscribe handling, and sender reputation checks are planned before real email sending is introduced.
      </InfoNotice>
    </Card>
  );
}

function ReportsPlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="Reports"
        title="Email Campaign Reports"
        description="Delivery and engagement reporting will appear here after email campaigns are enabled."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {reportMetrics.map((metric) => (
          <div key={metric} className="border border-border bg-background-tint p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">{metric}</p>
            <p className="mt-2 text-xl font-semibold text-text">0</p>
          </div>
        ))}
      </div>
      <div className="workspace-table-wrap">
        <table className="workspace-table">
          <thead>
            <tr>
              <th>Campaign Name</th>
              <th>Sender</th>
              <th>Audience</th>
              <th>Sent</th>
              <th>Failed</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7}>
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <FileCheck2 size={22} className="text-text-soft" />
                  <p className="text-sm font-semibold text-text">No email campaign reports yet.</p>
                  <p className="text-xs text-text-muted">Reports will remain empty until future email sending is enabled.</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function HistoryPlaceholder() {
  return (
    <Card elevated className="space-y-4 p-4 sm:p-5">
      <SectionIntro
        eyebrow="History"
        title="Email Campaign History"
        description="Future sender, template, scheduling, sending, and report events will appear in this timeline."
      />
      <div className="space-y-3">
        {historyItems.map((item, index) => (
          <div key={item} className="flex items-center gap-3 border border-border bg-background-tint p-3 opacity-65">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-text-soft">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{item}</p>
              <p className="text-xs text-text-muted">Coming Soon</p>
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
            This module is currently in placeholder mode. Admin will need to enable Email Campaign access before users can connect senders, create email templates, upload audiences or send campaigns.
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
        description="Sender Setup -> Audience -> Message -> Safety Check -> Preview -> Send -> Report"
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

function DisabledChecklistItem({ label }: { label: string }) {
  return (
    <label className="flex items-center gap-3 border border-border bg-background-tint p-3 opacity-70">
      <input className="h-4 w-4 accent-primary" type="checkbox" disabled />
      <span className="text-sm font-medium text-text-muted">{label}</span>
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

function StatusBadge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "muted" }) {
  const toneClass =
    tone === "primary"
      ? "border-primary/15 bg-primary/10 text-primary"
      : "border-border bg-background-tint text-text-muted";

  return (
    <span className={`inline-flex min-h-[1.65rem] items-center border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneClass}`}>
      {children}
    </span>
  );
}
