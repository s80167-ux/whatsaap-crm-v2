import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Ban, CheckCircle2, Mail, MailCheck, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { useCampaignEmailModuleStatus } from "../hooks/useAdmin";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";
import {
  disableEmailSender,
  fetchEmailSenders,
  fetchEmailSuppressionList,
  saveEmailSender,
  testEmailSender,
  type EmailSender,
  type EmailSenderStatus,
  type EmailSenderType
} from "../modules/campaigns/services/emailCampaignService";

type SenderSetupForm = {
  senderId: string;
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

type Notice = {
  tone: "success" | "error";
  message: string;
};

function buildDefaultForm(senderType: EmailSenderType): SenderSetupForm {
  if (senderType === "gmail") {
    return {
      senderId: "",
      displayName: "Gmail Sender",
      fromName: "",
      fromEmail: "",
      replyToEmail: "",
      smtpHost: "smtp.gmail.com",
      smtpPort: "465",
      smtpSecure: true,
      smtpUsername: "",
      smtpPassword: "",
      testEmail: ""
    };
  }

  if (senderType === "microsoft365") {
    return {
      senderId: "",
      displayName: "Microsoft 365 Sender",
      fromName: "",
      fromEmail: "",
      replyToEmail: "",
      smtpHost: "smtp.office365.com",
      smtpPort: "587",
      smtpSecure: false,
      smtpUsername: "",
      smtpPassword: "",
      testEmail: ""
    };
  }

  return {
    senderId: "",
    displayName: "Custom SMTP Sender",
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
}

function statusTone(status: EmailSenderStatus): "default" | "muted" | "success" | "warning" | "danger" {
  if (status === "verified") return "success";
  if (status === "failed") return "danger";
  if (status === "disabled") return "warning";
  if (status === "draft") return "muted";
  return "default";
}

function humanize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function senderTypeLabel(senderType: EmailSenderType) {
  if (senderType === "gmail") return "Gmail";
  if (senderType === "microsoft365") return "Microsoft 365";
  return "Custom SMTP";
}

function hydrateForm(sender: EmailSender): SenderSetupForm {
  return {
    senderId: sender.id,
    displayName: sender.display_name,
    fromName: sender.from_name,
    fromEmail: sender.from_email,
    replyToEmail: sender.reply_to_email ?? "",
    smtpHost: sender.smtp_host ?? "",
    smtpPort: sender.smtp_port ? String(sender.smtp_port) : "",
    smtpSecure: sender.smtp_secure,
    smtpUsername: "",
    smtpPassword: "",
    testEmail: ""
  };
}

function SenderStatusBadge({ status }: { status: EmailSenderStatus }) {
  const tone = statusTone(status);
  const className =
    tone === "success"
      ? "border-success/20 bg-success/10 text-success"
      : tone === "danger"
        ? "border-destructive/20 bg-destructive/10 text-destructive"
        : tone === "warning"
          ? "border-warning/20 bg-warning/10 text-warning"
          : "border-border bg-background-tint text-text-muted";

  return <span className={`inline-flex items-center border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${className}`}>{humanize(status)}</span>;
}

function ChecklistItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-3 border px-3 py-3 text-sm ${checked ? "border-success/20 bg-success/5 text-text" : "border-border bg-background-tint text-text-muted"}`}>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full border ${checked ? "border-success/30 bg-success/10 text-success" : "border-border bg-card text-text-muted"}`}>
        {checked ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      </span>
      <span>{label}</span>
    </div>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="border border-border bg-background-tint px-4 py-8 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
    </div>
  );
}

function SenderConfigCard(props: {
  title: string;
  description: string;
  helper: string;
  senderType: EmailSenderType;
  form: SenderSetupForm;
  sender: EmailSender | null;
  pending: boolean;
  onChange: (next: SenderSetupForm) => void;
  onSave: () => void;
  onTest: () => void;
  onReset: () => void;
}) {
  return (
    <Card elevated className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <SectionIntro eyebrow="Sender Setup" title={props.title} description={props.description} />
        <SenderStatusBadge status={props.sender?.status ?? "draft"} />
      </div>
      <div className="rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-sm leading-6 text-text-muted">
        {props.helper}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="workspace-label">Display Name</span>
          <Input value={props.form.displayName} onChange={(event) => props.onChange({ ...props.form, displayName: event.target.value })} placeholder={`${props.title} Sender`} />
        </label>
        <label>
          <span className="workspace-label">From Name</span>
          <Input value={props.form.fromName} onChange={(event) => props.onChange({ ...props.form, fromName: event.target.value })} placeholder="CRM Team" />
        </label>
        <label>
          <span className="workspace-label">From Email</span>
          <Input value={props.form.fromEmail} onChange={(event) => props.onChange({ ...props.form, fromEmail: event.target.value })} placeholder="sales@example.com" />
        </label>
        <label>
          <span className="workspace-label">Reply-to Email</span>
          <Input value={props.form.replyToEmail} onChange={(event) => props.onChange({ ...props.form, replyToEmail: event.target.value })} placeholder="support@example.com" />
        </label>
        <label>
          <span className="workspace-label">SMTP Host</span>
          <Input value={props.form.smtpHost} onChange={(event) => props.onChange({ ...props.form, smtpHost: event.target.value })} placeholder="smtp.example.com" />
        </label>
        <label>
          <span className="workspace-label">SMTP Port</span>
          <Input value={props.form.smtpPort} onChange={(event) => props.onChange({ ...props.form, smtpPort: event.target.value })} inputMode="numeric" placeholder="587" />
        </label>
        <label>
          <span className="workspace-label">SMTP Username</span>
          <Input value={props.form.smtpUsername} onChange={(event) => props.onChange({ ...props.form, smtpUsername: event.target.value })} placeholder="sender@example.com" />
        </label>
        <label>
          <span className="workspace-label">SMTP Password</span>
          <Input type="password" value={props.form.smtpPassword} onChange={(event) => props.onChange({ ...props.form, smtpPassword: event.target.value })} placeholder={props.form.senderId ? "Leave blank to keep the current password" : "SMTP password or app password"} />
        </label>
      </div>
      <label className="flex items-center gap-3 rounded-lg border border-border bg-background-tint px-4 py-3 text-sm text-text">
        <input type="checkbox" checked={props.form.smtpSecure} onChange={(event) => props.onChange({ ...props.form, smtpSecure: event.target.checked })} />
        Use secure SMTP/TLS from connection start
      </label>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label>
          <span className="workspace-label">Test Email</span>
          <Input value={props.form.testEmail} onChange={(event) => props.onChange({ ...props.form, testEmail: event.target.value })} placeholder="qa@example.com" />
        </label>
        <Button onClick={props.onSave} disabled={props.pending}>{props.form.senderId ? "Update Sender" : "Save Sender"}</Button>
        <Button variant="secondary" onClick={props.onTest} disabled={props.pending || !props.form.senderId || !props.form.testEmail.trim()}>
          <Send size={16} /> Test Sender
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
        <span>Last test: {formatDate(props.sender?.last_test_at)}</span>
        <Button variant="ghost" size="sm" onClick={props.onReset} disabled={props.pending}>
          <RefreshCw size={14} /> Reset
        </Button>
      </div>
      {props.sender?.last_test_error ? <p className="text-xs text-destructive">{props.sender.last_test_error}</p> : null}
    </Card>
  );
}

export function EmailSetupPage() {
  const outletContext = useOutletContext<DashboardOutletContext>();
  const currentUser = getStoredUser();
  const organizationId = outletContext.isSuperAdmin ? outletContext.selectedOrganizationId || null : currentUser?.organizationId ?? null;
  const emailModuleStatus = useCampaignEmailModuleStatus(null, !outletContext.isSuperAdmin);
  const isEmailAccessEnabled = outletContext.isSuperAdmin ? true : emailModuleStatus.data?.isEnabled === true;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [forms, setForms] = useState<Record<EmailSenderType, SenderSetupForm>>({
    microsoft365: buildDefaultForm("microsoft365"),
    gmail: buildDefaultForm("gmail"),
    smtp: buildDefaultForm("smtp")
  });
  const [quickTestEmails, setQuickTestEmails] = useState<Record<string, string>>({});

  const sendersQuery = useQuery({
    queryKey: ["email-campaigns", "senders", organizationId],
    queryFn: () => fetchEmailSenders(organizationId),
    enabled: Boolean(organizationId) && isEmailAccessEnabled
  });
  const suppressionQuery = useQuery({
    queryKey: ["email-campaigns", "suppression-list", organizationId, "setup-status"],
    queryFn: () => fetchEmailSuppressionList({ organizationId, limit: 1, offset: 0 }),
    enabled: Boolean(organizationId) && isEmailAccessEnabled
  });

  const senders = sendersQuery.data ?? [];
  const sendersPagination = usePanelPagination(senders);
  const latestSenderByType = useMemo(() => {
    return {
      microsoft365: senders.find((sender) => sender.sender_type === "microsoft365") ?? null,
      gmail: senders.find((sender) => sender.sender_type === "gmail") ?? null,
      smtp: senders.find((sender) => sender.sender_type === "smtp") ?? null
    };
  }, [senders]);
  const verifiedSenders = senders.filter((sender) => sender.status === "verified");

  const saveSenderMutation = useMutation({
    mutationFn: (input: { senderType: EmailSenderType; form: SenderSetupForm }) =>
      saveEmailSender({
        senderId: input.form.senderId || undefined,
        organizationId,
        sender_type: input.senderType,
        display_name: input.form.displayName,
        from_name: input.form.fromName,
        from_email: input.form.fromEmail,
        reply_to_email: input.form.replyToEmail || null,
        smtp_host: input.form.smtpHost || null,
        smtp_port: input.form.smtpPort ? Number(input.form.smtpPort) : null,
        smtp_secure: input.form.smtpSecure,
        smtp_username: input.form.senderId
          ? input.form.smtpUsername.trim()
            ? input.form.smtpUsername.trim()
            : undefined
          : input.form.smtpUsername || null,
        smtp_password: input.form.senderId
          ? input.form.smtpPassword.trim()
            ? input.form.smtpPassword.trim()
            : undefined
          : input.form.smtpPassword || null
      }),
    onSuccess: (sender, variables) => {
      setNotice({ tone: "success", message: `${sender.display_name} saved successfully.` });
      setForms((current) => ({
        ...current,
        [variables.senderType]: {
          ...hydrateForm(sender),
          testEmail: current[variables.senderType].testEmail
        }
      }));
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error) => {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to save sender." });
    }
  });

  const testSenderMutation = useMutation({
    mutationFn: (input: { senderType: EmailSenderType; senderId: string; toEmail: string }) =>
      testEmailSender({ senderId: input.senderId, organizationId, to_email: input.toEmail }),
    onSuccess: (result, variables) => {
      setNotice({ tone: "success", message: result.result.message || "Test email sent successfully." });
      setForms((current) => ({
        ...current,
        [variables.senderType]: {
          ...current[variables.senderType],
          senderId: result.sender.id
        }
      }));
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error) => {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to test sender." });
    }
  });

  const disableSenderMutation = useMutation({
    mutationFn: (senderId: string) => disableEmailSender({ senderId, organizationId }),
    onSuccess: (result) => {
      setNotice({ tone: "success", message: `${result.display_name} disabled.` });
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error) => {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to disable sender." });
    }
  });

  function updateForm(senderType: EmailSenderType, next: SenderSetupForm) {
    setForms((current) => ({ ...current, [senderType]: next }));
  }

  function resetForm(senderType: EmailSenderType) {
    setForms((current) => ({
      ...current,
      [senderType]: {
        ...buildDefaultForm(senderType),
        testEmail: current[senderType].testEmail
      }
    }));
  }

  function loadSender(sender: EmailSender) {
    setForms((current) => ({
      ...current,
      [sender.sender_type]: {
        ...hydrateForm(sender),
        testEmail: current[sender.sender_type].testEmail || quickTestEmails[sender.id] || ""
      }
    }));
  }

  function handleRowTest(sender: EmailSender) {
    const toEmail = quickTestEmails[sender.id]?.trim() || forms[sender.sender_type].testEmail.trim();

    if (!toEmail) {
      setNotice({ tone: "error", message: "Enter a test email before running sender test." });
      return;
    }

    loadSender(sender);
    testSenderMutation.mutate({ senderType: sender.sender_type, senderId: sender.id, toEmail });
  }

  const complianceItems = [
    { label: "At least one sender verified", checked: verifiedSenders.length > 0 },
    { label: "Unsubscribe footer enabled", checked: true },
    { label: "Suppression list active", checked: suppressionQuery.isSuccess },
    { label: "Sender identity configured", checked: senders.some((sender) => Boolean(sender.from_name && sender.from_email)) },
    { label: "Test email passed", checked: senders.some((sender) => sender.status === "verified" || Boolean(sender.last_test_at && !sender.last_test_error)) }
  ];

  if (!organizationId) {
    return <EmptyState title="Organization context required" description="Choose an organization before managing email senders." />;
  }

  if (!isEmailAccessEnabled) {
    return <EmptyState title="Email module is disabled" description="Enable the campaign email module before configuring organization senders." />;
  }

  return (
    <section className="space-y-6">
      <div className="workspace-page-header p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),19rem] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Omni-Channel Setup</p>
            <h1 className="mt-3 section-title">Email Setup</h1>
            <p className="section-copy mt-2 max-w-3xl">Configure organization-owned senders for Gmail, Microsoft 365, or custom SMTP. Send a test email first, then use verified senders from the email campaign flow.</p>
          </div>
          <div className="workspace-subtle p-4">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck size={16} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Sender configuration live</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">Passwords remain encrypted at rest and are never returned to the frontend.</p>
          </div>
        </div>
      </div>

      {notice ? (
        <Card elevated className={`p-4 ${notice.tone === "error" ? "border-destructive/20 bg-destructive/5" : "border-success/20 bg-success/5"}`}>
          <p className={`text-sm ${notice.tone === "error" ? "text-destructive" : "text-success"}`}>{notice.message}</p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <SenderConfigCard
          title="Microsoft 365 / Corporate Email"
          description="Use SMTP AUTH for Microsoft 365 or Outlook accounts in this MVP. OAuth and Graph transport are intentionally deferred."
          helper="Corporate tenants may block SMTP AUTH. Your Microsoft 365 admin may need to enable authenticated SMTP for the sender account."
          senderType="microsoft365"
          form={forms.microsoft365}
          sender={latestSenderByType.microsoft365}
          pending={saveSenderMutation.isPending || testSenderMutation.isPending}
          onChange={(next) => updateForm("microsoft365", next)}
          onSave={() => saveSenderMutation.mutate({ senderType: "microsoft365", form: forms.microsoft365 })}
          onTest={() => testSenderMutation.mutate({ senderType: "microsoft365", senderId: forms.microsoft365.senderId, toEmail: forms.microsoft365.testEmail.trim() })}
          onReset={() => resetForm("microsoft365")}
        />
        <SenderConfigCard
          title="Gmail"
          description="Use Gmail SMTP with an app password for MVP. Full Gmail OAuth is intentionally left for a later sprint."
          helper="Use Gmail App Password, not your normal Gmail password. The Gmail preset defaults to smtp.gmail.com over port 465."
          senderType="gmail"
          form={forms.gmail}
          sender={latestSenderByType.gmail}
          pending={saveSenderMutation.isPending || testSenderMutation.isPending}
          onChange={(next) => updateForm("gmail", next)}
          onSave={() => saveSenderMutation.mutate({ senderType: "gmail", form: forms.gmail })}
          onTest={() => testSenderMutation.mutate({ senderType: "gmail", senderId: forms.gmail.senderId, toEmail: forms.gmail.testEmail.trim() })}
          onReset={() => resetForm("gmail")}
        />
        <SenderConfigCard
          title="Custom SMTP"
          description="Configure a domain-owned sender with your hosting provider or mail gateway. This remains the default path for organization-owned email."
          helper="Enter your SMTP host, port, username, and password. STARTTLS and direct TLS can both be represented through the secure toggle."
          senderType="smtp"
          form={forms.smtp}
          sender={latestSenderByType.smtp}
          pending={saveSenderMutation.isPending || testSenderMutation.isPending}
          onChange={(next) => updateForm("smtp", next)}
          onSave={() => saveSenderMutation.mutate({ senderType: "smtp", form: forms.smtp })}
          onTest={() => testSenderMutation.mutate({ senderType: "smtp", senderId: forms.smtp.senderId, toEmail: forms.smtp.testEmail.trim() })}
          onReset={() => resetForm("smtp")}
        />

        <Card elevated className="space-y-4 p-5">
          <SectionIntro eyebrow="Compliance" title="Delivery Readiness" description="These checks confirm whether this organization is ready to use verified senders in the campaign module." />
          <div className="grid gap-3">
            {complianceItems.map((item) => <ChecklistItem key={item.label} checked={item.checked} label={item.label} />)}
          </div>
          <div className="rounded-lg border border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
            Verified senders are consumed from Campaigns → Email. Suppression and unsubscribe handling stay enforced on the backend for every campaign send.
          </div>
        </Card>
      </div>

      <Card elevated className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <SectionIntro eyebrow="Sender Inventory" title="Configured Senders" description="Each row stays organization-scoped, shows only masked configuration, and supports edit, test, and disable actions." />
          <div className="inline-flex items-center gap-2 border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <MailCheck size={14} />
            {verifiedSenders.length} Verified
          </div>
        </div>

        {sendersQuery.isLoading ? <EmptyState title="Loading senders" description="Fetching configured email senders for this organization." /> : null}
        {!sendersQuery.isLoading && senders.length === 0 ? (
          <EmptyState title="No senders configured" description="Save a Microsoft 365, Gmail, or custom SMTP sender above, then run a test email to verify it." />
        ) : null}
        {senders.length > 0 ? (
          <>
            <div className="workspace-table-wrap overflow-x-auto">
              <table className="workspace-table min-w-[1120px]">
                <thead>
                  <tr>
                    <th>Display Name</th>
                    <th>Sender Type</th>
                    <th>From Email</th>
                    <th>Status</th>
                    <th>Last Test</th>
                    <th>Quick Test</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sendersPagination.visibleItems.map((sender) => (
                    <tr key={sender.id}>
                      <td>
                        <div>
                          <p className="font-semibold text-text">{sender.display_name}</p>
                          <p className="text-xs text-text-muted">{sender.from_name} · {sender.smtp_username_masked ?? "Username hidden"}</p>
                        </div>
                      </td>
                      <td>{senderTypeLabel(sender.sender_type)}</td>
                      <td>{sender.from_email}</td>
                      <td><SenderStatusBadge status={sender.status} /></td>
                      <td>
                        <div className="text-sm text-text-muted">
                          <p>{sender.last_test_status ?? "Not tested"}</p>
                          <p className="text-xs">{formatDate(sender.last_test_at)}</p>
                        </div>
                      </td>
                      <td>
                        <Input
                          value={quickTestEmails[sender.id] ?? ""}
                          onChange={(event) => setQuickTestEmails((current) => ({ ...current, [sender.id]: event.target.value }))}
                          placeholder="qa@example.com"
                        />
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => loadSender(sender)}>Edit</Button>
                          <Button size="sm" variant="secondary" onClick={() => handleRowTest(sender)} disabled={testSenderMutation.isPending}>Test</Button>
                          <Button size="sm" variant="danger" onClick={() => disableSenderMutation.mutate(sender.id)} disabled={disableSenderMutation.isPending || sender.status === "disabled"}>
                            <Ban size={14} /> Disable
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PanelPagination
              page={sendersPagination.page}
              pageCount={sendersPagination.pageCount}
              pageSize={sendersPagination.pageSize}
              totalItems={sendersPagination.totalItems}
              onPageChange={sendersPagination.setPage}
            />
          </>
        ) : null}
      </Card>
    </section>
  );
}
