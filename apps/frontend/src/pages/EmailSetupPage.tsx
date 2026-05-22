import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Mail, RefreshCw, Search, Send, ShieldCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input, Select } from "../components/Input";
import { PanelPagination, usePanelPagination } from "../components/PanelPagination";
import { useCampaignEmailModuleStatus } from "../hooks/useAdmin";
import type { DashboardOutletContext } from "../layouts/DashboardLayout";
import { getStoredUser } from "../lib/auth";
import {
  detectSmtpSettings,
  disableEmailSender,
  fetchEmailSenders,
  fetchEmailSuppressionList,
  saveEmailSender,
  testEmailSender,
  testSmtpConfig,
  type EmailSender,
  type EmailSenderStatus,
  type EmailSenderType,
  type SmtpConfigSuggestion,
  type SmtpDetectionResult,
  type SmtpSecurity
} from "../modules/campaigns/services/emailCampaignService";

type SetupMode = "smart" | "advanced";

type SenderSetupForm = {
  senderId: string;
  provider: EmailSenderType;
  displayName: string;
  senderName: string;
  fromEmail: string;
  replyToEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  security: SmtpSecurity;
  testEmail: string;
};

type Notice = {
  tone: "success" | "error";
  message: string;
};

type RowFeedback = {
  tone: "success" | "error" | "info";
  message: string;
};

type SenderSetupField = keyof SenderSetupForm | "form";
type SenderSetupErrors = Partial<Record<SenderSetupField, string>>;

const compactInputClassName = "h-9 !px-3 !py-1.5 text-sm";
const compactLabelClassName = "workspace-label !mb-1 text-xs";
const errorInputClassName = "border-destructive/40 bg-destructive/5";

const emptyForm: SenderSetupForm = {
  senderId: "",
  provider: "custom_smtp",
  displayName: "Custom SMTP Sender",
  senderName: "",
  fromEmail: "",
  replyToEmail: "",
  smtpHost: "",
  smtpPort: "587",
  smtpUsername: "",
  smtpPassword: "",
  security: "STARTTLS",
  testEmail: ""
};

function providerLabel(provider: EmailSenderType) {
  return provider === "gmail_app_password" ? "Gmail App Password" : "Custom SMTP";
}

function providerFromDetection(result: SmtpDetectionResult | null): EmailSenderType {
  if (!result) return "custom_smtp";
  return result.detectedProvider === "google_workspace" ? "gmail_app_password" : "custom_smtp";
}

function statusTone(status: EmailSenderStatus): "default" | "muted" | "success" | "warning" | "danger" {
  if (status === "verified") return "success";
  if (status === "failed" || status === "expired" || status === "reconnect_required") return "danger";
  if (status === "disabled") return "warning";
  if (status === "draft") return "muted";
  return "default";
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs leading-4 text-destructive">{message}</p>;
}

function fieldClassName(error?: string) {
  return error ? `${compactInputClassName} ${errorInputClassName}` : compactInputClassName;
}

function securityFromSender(sender: EmailSender): SmtpSecurity {
  if (sender.smtp_secure) return "SSL";
  if (sender.smtp_port === 25) return "NONE";
  return "STARTTLS";
}

function hydrateForm(sender: EmailSender): SenderSetupForm {
  return {
    senderId: sender.id,
    provider: sender.sender_type,
    displayName: sender.display_name,
    senderName: sender.from_name,
    fromEmail: sender.from_email,
    replyToEmail: sender.reply_to_email ?? "",
    smtpHost: sender.smtp_host ?? "",
    smtpPort: sender.smtp_port ? String(sender.smtp_port) : "",
    smtpUsername: "",
    smtpPassword: "",
    security: securityFromSender(sender),
    testEmail: ""
  };
}

function applySuggestionToForm(form: SenderSetupForm, suggestion: SmtpConfigSuggestion, detection: SmtpDetectionResult | null): SenderSetupForm {
  return {
    ...form,
    provider: providerFromDetection(detection),
    displayName: detection?.detectedProvider === "google_workspace" ? "Gmail App Password Sender" : form.displayName || "Custom SMTP Sender",
    fromEmail: suggestion.smtpUsername,
    smtpHost: suggestion.smtpHost,
    smtpPort: String(suggestion.smtpPort),
    smtpUsername: suggestion.smtpUsername,
    security: suggestion.security
  };
}

function toSavePayload(form: SenderSetupForm, organizationId: string | null) {
  const isGmail = form.provider === "gmail_app_password";
  const username = isGmail ? form.fromEmail.trim() : form.smtpUsername.trim();

  return {
    senderId: form.senderId || undefined,
    organizationId,
    sender_type: form.provider,
    display_name: form.displayName,
    from_name: form.senderName,
    from_email: form.fromEmail,
    reply_to_email: form.replyToEmail || null,
    smtp_host: isGmail ? "smtp.gmail.com" : form.smtpHost || null,
    smtp_port: isGmail ? 587 : form.smtpPort ? Number(form.smtpPort) : null,
    smtp_secure: isGmail ? false : form.security === "SSL",
    smtp_username: form.senderId ? username || undefined : username || null,
    smtp_password: form.senderId ? form.smtpPassword.trim() || undefined : form.smtpPassword || null
  };
}

function toTestConfigPayload(form: SenderSetupForm) {
  return {
    smtpHost: form.provider === "gmail_app_password" ? "smtp.gmail.com" : form.smtpHost,
    smtpPort: form.provider === "gmail_app_password" ? 587 : Number(form.smtpPort || 0),
    security: form.provider === "gmail_app_password" ? "STARTTLS" as const : form.security,
    smtpUsername: form.provider === "gmail_app_password" ? form.fromEmail : form.smtpUsername,
    smtpPassword: form.smtpPassword,
    fromEmail: form.fromEmail,
    fromName: form.senderName,
    replyTo: form.replyToEmail || null,
    toEmail: form.testEmail,
    sendEmail: true
  };
}

function validateSenderForm(form: SenderSetupForm, organizationId: string | null, action: "save" | "test"): SenderSetupErrors {
  const errors: SenderSetupErrors = {};
  const port = Number(form.smtpPort);
  const isGmail = form.provider === "gmail_app_password";

  if (!organizationId) errors.form = "Choose an organization before saving an email sender.";
  if (!form.displayName.trim()) errors.displayName = "Display name is required.";
  if (!form.senderName.trim()) errors.senderName = "Sender name is required.";
  if (!form.fromEmail.trim()) {
    errors.fromEmail = isGmail ? "Gmail address is required." : "From email is required.";
  } else if (!isValidEmail(form.fromEmail)) {
    errors.fromEmail = isGmail ? "Enter a valid Gmail address." : "Enter a valid from email.";
  }

  if (form.replyToEmail.trim() && !isValidEmail(form.replyToEmail)) {
    errors.replyToEmail = "Enter a valid reply-to email.";
  }

  if (!isGmail) {
    if (!form.smtpHost.trim()) errors.smtpHost = "SMTP host is required.";
    if (!form.smtpPort.trim()) {
      errors.smtpPort = "SMTP port is required.";
    } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.smtpPort = "Enter a valid SMTP port.";
    }
    if (!form.smtpUsername.trim()) errors.smtpUsername = "SMTP username is required.";
  }

  if (!form.senderId && !form.smtpPassword.trim()) {
    errors.smtpPassword = "SMTP password or app password is required.";
  }

  if (action === "test") {
    if (!form.testEmail.trim()) {
      errors.testEmail = "Enter a recipient email for the test.";
    } else if (!isValidEmail(form.testEmail)) {
      errors.testEmail = "Enter a valid test recipient email.";
    }

    if (!form.smtpPassword.trim()) {
      errors.smtpPassword = "Enter the SMTP password or app password before sending a test.";
    }
  }

  return errors;
}

function fieldErrorsFromBackend(message: string): SenderSetupErrors {
  const lower = message.toLowerCase();

  if (lower.includes("display_name")) return { displayName: "Display name is required." };
  if (lower.includes("from_name")) return { senderName: "Sender name is required." };
  if (lower.includes("from_email")) return { fromEmail: "Enter a valid from email." };
  if (lower.includes("reply_to_email")) return { replyToEmail: "Enter a valid reply-to email." };
  if (lower.includes("smtp_host")) return { smtpHost: "SMTP host is required." };
  if (lower.includes("smtp_port")) return { smtpPort: "Enter a valid SMTP port." };
  if (lower.includes("smtp_username")) return { smtpUsername: "SMTP username is required." };
  if (lower.includes("smtp_password")) return { smtpPassword: "SMTP password or app password is required." };
  if (lower.includes("to_email") || lower.includes("test recipient")) return { testEmail: "Enter a valid test recipient email." };

  return {};
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

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-text-muted">{description}</p>
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

function ChecklistItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 border px-2.5 py-2 text-sm ${checked ? "border-success/20 bg-success/5 text-text" : "border-border bg-background-tint text-text-muted"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${checked ? "border-success/30 bg-success/10 text-success" : "border-border bg-card text-text-muted"}`}>
        <CheckCircle2 size={14} />
      </span>
      <span>{label}</span>
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: SetupMode; onChange: (mode: SetupMode) => void }) {
  return (
    <div className="inline-flex border border-border bg-background-tint p-0.5">
      <button
        type="button"
        className={`px-3 py-1.5 text-xs font-semibold ${mode === "smart" ? "bg-card text-primary shadow-soft" : "text-text-muted"}`}
        onClick={() => onChange("smart")}
      >
        Smart Setup
      </button>
      <button
        type="button"
        className={`px-3 py-1.5 text-xs font-semibold ${mode === "advanced" ? "bg-card text-primary shadow-soft" : "text-text-muted"}`}
        onClick={() => onChange("advanced")}
      >
        Advanced Manual Setup
      </button>
    </div>
  );
}

function SuggestionCard({ suggestion, onUse }: { suggestion: SmtpConfigSuggestion; onUse: () => void }) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-background-tint p-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        <p className="font-semibold text-text">{suggestion.smtpHost}</p>
        <p className="text-xs text-text-muted">Port {suggestion.smtpPort} - {suggestion.security} - Username {suggestion.smtpUsername}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onUse}>Use This Setting</Button>
    </div>
  );
}

function SmtpFields({ form, onChange, errors, compact = false }: { form: SenderSetupForm; onChange: (next: SenderSetupForm) => void; errors?: SenderSetupErrors; compact?: boolean }) {
  const isGmail = form.provider === "gmail_app_password";

  return (
    <div className="grid gap-2.5 md:grid-cols-2">
      <label>
        <span className={compactLabelClassName}>Sender Name</span>
        <Input className={fieldClassName(errors?.senderName)} aria-invalid={Boolean(errors?.senderName)} value={form.senderName} onChange={(event) => onChange({ ...form, senderName: event.target.value })} placeholder="CRM Team" />
        <FieldError message={errors?.senderName} />
      </label>
      <label>
        <span className={compactLabelClassName}>{isGmail ? "Gmail Address" : "From Email"}</span>
        <Input className={fieldClassName(errors?.fromEmail)} aria-invalid={Boolean(errors?.fromEmail)} value={form.fromEmail} onChange={(event) => onChange({ ...form, fromEmail: event.target.value, smtpUsername: isGmail ? event.target.value : form.smtpUsername })} placeholder="sales@example.com" />
        <FieldError message={errors?.fromEmail} />
      </label>
      <label>
        <span className={compactLabelClassName}>Reply-To Email</span>
        <Input className={fieldClassName(errors?.replyToEmail)} aria-invalid={Boolean(errors?.replyToEmail)} value={form.replyToEmail} onChange={(event) => onChange({ ...form, replyToEmail: event.target.value })} placeholder="Optional" />
        <FieldError message={errors?.replyToEmail} />
      </label>
      <label>
        <span className={compactLabelClassName}>SMTP Password / App Password</span>
        <Input className={fieldClassName(errors?.smtpPassword)} aria-invalid={Boolean(errors?.smtpPassword)} type="password" value={form.smtpPassword} onChange={(event) => onChange({ ...form, smtpPassword: event.target.value })} placeholder={form.senderId ? "Leave blank to keep saved password" : "Password or app password"} />
        <FieldError message={errors?.smtpPassword} />
      </label>
      {compact && isGmail ? null : (
        <>
          <label>
            <span className={compactLabelClassName}>SMTP Host</span>
            <Input className={fieldClassName(errors?.smtpHost)} aria-invalid={Boolean(errors?.smtpHost)} value={form.smtpHost} onChange={(event) => onChange({ ...form, smtpHost: event.target.value })} placeholder="smtp.example.com" />
            <FieldError message={errors?.smtpHost} />
          </label>
          <label>
            <span className={compactLabelClassName}>SMTP Port</span>
            <Input className={fieldClassName(errors?.smtpPort)} aria-invalid={Boolean(errors?.smtpPort)} value={form.smtpPort} onChange={(event) => onChange({ ...form, smtpPort: event.target.value })} inputMode="numeric" placeholder="587" />
            <FieldError message={errors?.smtpPort} />
          </label>
          <label>
            <span className={compactLabelClassName}>SMTP Username</span>
            <Input className={fieldClassName(errors?.smtpUsername)} aria-invalid={Boolean(errors?.smtpUsername)} value={form.smtpUsername} onChange={(event) => onChange({ ...form, smtpUsername: event.target.value })} placeholder="sender@example.com" />
            <FieldError message={errors?.smtpUsername} />
          </label>
          <label>
            <span className={compactLabelClassName}>Security</span>
            <Select className={compactInputClassName} value={form.security} onChange={(event) => onChange({ ...form, security: event.target.value as SmtpSecurity })}>
              <option value="STARTTLS">TLS / STARTTLS</option>
              <option value="SSL">SSL</option>
              <option value="NONE">None</option>
            </Select>
          </label>
        </>
      )}
    </div>
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
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const [mode, setMode] = useState<SetupMode>("smart");
  const [form, setForm] = useState<SenderSetupForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<SenderSetupErrors>({});
  const [detectEmail, setDetectEmail] = useState("");
  const [detection, setDetection] = useState<SmtpDetectionResult | null>(null);
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
  const verifiedSenders = senders.filter((sender) => sender.status === "verified");
  const activeSender = form.senderId ? senders.find((sender) => sender.id === form.senderId) ?? null : null;

  const detectMutation = useMutation({
    mutationFn: () => detectSmtpSettings({ email: detectEmail.trim() }),
    onSuccess: (result) => {
      setDetection(result);
      if (result.unsupported) {
        setNotice({ tone: "error", message: result.notes[0] || "This provider is not supported in the Email Campaign MVP." });
        return;
      }

      setNotice({ tone: "success", message: `${result.providerLabel} detected with ${Math.round(result.confidence * 100)}% confidence.` });
    },
    onError: (error) => {
      setDetection(null);
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Unable to detect SMTP settings." });
    }
  });

  const saveSenderMutation = useMutation({
    mutationFn: () => saveEmailSender(toSavePayload(form, organizationId)),
    onSuccess: (sender) => {
      setFieldErrors({});
      setNotice({ tone: "success", message: `${sender.display_name} saved successfully.` });
      setForm((current) => ({ ...hydrateForm(sender), testEmail: current.testEmail }));
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to save sender.";
      const backendErrors = fieldErrorsFromBackend(message);
      if (Object.keys(backendErrors).length > 0) setFieldErrors(backendErrors);
      setNotice({ tone: "error", message });
    }
  });

  const testConfigMutation = useMutation({
    mutationFn: () => testSmtpConfig(toTestConfigPayload(form)),
    onSuccess: (result) => {
      setFieldErrors({});
      setNotice({ tone: "success", message: result.message || "SMTP settings verified." });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to test SMTP settings.";
      const backendErrors = fieldErrorsFromBackend(message);
      if (Object.keys(backendErrors).length > 0) setFieldErrors(backendErrors);
      setNotice({ tone: "error", message });
    }
  });

  const testSavedSenderMutation = useMutation({
    mutationFn: (input: { senderId: string; toEmail: string }) =>
      testEmailSender({ senderId: input.senderId, organizationId, to_email: input.toEmail }),
    onSuccess: (result, variables) => {
      setNotice({ tone: "success", message: result.result.message || "Test email sent successfully." });
      setRowFeedback((current) => ({ ...current, [variables.senderId]: { tone: "success", message: "Test sent. Sender is verified and ready to use." } }));
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error, variables) => {
      const message = error instanceof Error ? error.message : "Unable to test sender.";
      setNotice({ tone: "error", message });
      setRowFeedback((current) => ({ ...current, [variables.senderId]: { tone: "error", message } }));
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

  function useSuggestion(suggestion: SmtpConfigSuggestion, result = detection) {
    setForm((current) => applySuggestionToForm(current, suggestion, result));
    setFieldErrors({});
    setNotice({ tone: "success", message: "SMTP settings applied. Enter sender name and app password, then send a test email." });
  }

  function loadSender(sender: EmailSender) {
    setMode("advanced");
    setDetection(null);
    setFieldErrors({});
    setForm((current) => ({ ...hydrateForm(sender), testEmail: current.testEmail || quickTestEmails[sender.id] || "" }));
  }

  function resetForm() {
    setForm({ ...emptyForm, testEmail: form.testEmail });
    setFieldErrors({});
    setDetection(null);
    setDetectEmail("");
  }

  function updateForm(next: SenderSetupForm) {
    setForm(next);
    if (Object.keys(fieldErrors).length > 0) {
      setFieldErrors({});
    }
  }

  function handleSaveSender() {
    const errors = validateSenderForm(form, organizationId, "save");

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotice({ tone: "error", message: errors.form || "Some required sender fields need attention." });
      return;
    }

    setFieldErrors({});
    saveSenderMutation.mutate();
  }

  function handleTestConfig() {
    const errors = validateSenderForm(form, organizationId, "test");

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotice({ tone: "error", message: errors.form || "Some required test email fields need attention." });
      return;
    }

    setFieldErrors({});
    testConfigMutation.mutate();
  }

  function handleRowTest(sender: EmailSender) {
    const toEmail = quickTestEmails[sender.id]?.trim() || form.testEmail.trim();

    if (!toEmail) {
      const message = "Enter a recipient email in Quick Test first.";
      setNotice({ tone: "error", message });
      setRowFeedback((current) => ({ ...current, [sender.id]: { tone: "error", message } }));
      return;
    }

    setRowFeedback((current) => ({ ...current, [sender.id]: { tone: "info", message: "Sending test email..." } }));
    testSavedSenderMutation.mutate({ senderId: sender.id, toEmail });
  }

  const complianceItems = [
    { label: "At least one sender verified", checked: verifiedSenders.length > 0 },
    { label: "Suppression list active", checked: suppressionQuery.isSuccess },
    { label: "Sender identity configured", checked: senders.some((sender) => Boolean(sender.from_name && sender.from_email)) },
    { label: "Test email passed", checked: senders.some((sender) => sender.status === "verified" || Boolean(sender.last_test_at && !sender.last_test_error)) }
  ];

  const pending = saveSenderMutation.isPending || testConfigMutation.isPending || detectMutation.isPending;

  if (!organizationId) {
    return <EmptyState title="Organization context required" description="Choose an organization before managing email senders." />;
  }

  if (!isEmailAccessEnabled) {
    return <EmptyState title="Email module is disabled" description="Enable the campaign email module before configuring organization senders." />;
  }

  return (
    <section className="space-y-4">
      <div className="workspace-page-header p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr),18rem] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Omni-Channel Setup</p>
            <h1 className="mt-2 section-title">Email Setup</h1>
            <p className="section-copy mt-1 max-w-3xl">Detect SMTP settings from an email address, then verify and save a sender for mail merge email campaigns.</p>
          </div>
          <div className="workspace-subtle p-3">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck size={16} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">SMTP sender setup</p>
            </div>
            <p className="mt-1 text-sm leading-5 text-text-muted">SMTP passwords stay encrypted at rest and are never returned to the frontend.</p>
          </div>
        </div>
      </div>

      {notice ? (
        <Card elevated className={`p-3 ${notice.tone === "error" ? "border-destructive/20 bg-destructive/5" : "border-success/20 bg-success/5"}`}>
          <p className={`text-sm ${notice.tone === "error" ? "text-destructive" : "text-success"}`}>{notice.message}</p>
        </Card>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <Card elevated className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <SectionIntro eyebrow="Setup Assistant" title="SMTP Setup" description="Start with Smart Setup for known providers, or switch to Advanced Manual Setup when your provider gives exact SMTP settings." />
            <ModeTabs mode={mode} onChange={setMode} />
          </div>

          {mode === "smart" ? (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <label>
                  <span className={compactLabelClassName}>Email Address</span>
                  <Input className={compactInputClassName} value={detectEmail} onChange={(event) => setDetectEmail(event.target.value)} placeholder="name@example.com" />
                </label>
                <Button size="sm" className="h-9 self-end" onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending || !detectEmail.trim()}>
                  <Search size={16} /> {detectMutation.isPending ? "Detecting..." : "Detect SMTP Settings"}
                </Button>
              </div>

              {detection ? (
                <div className={`space-y-2 border p-3 ${detection.unsupported ? "border-destructive/20 bg-destructive/5" : "border-primary/15 bg-primary/5"}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-text">{detection.providerLabel}</p>
                      <p className="text-xs text-text-muted">Domain {detection.domain} - confidence {Math.round(detection.confidence * 100)}%</p>
                    </div>
                    {detection.unsupported ? <SenderStatusBadge status="failed" /> : null}
                  </div>
                  {detection.notes.map((note) => (
                    <p key={note} className={detection.unsupported ? "text-sm text-destructive" : "text-sm text-text-muted"}>{note}</p>
                  ))}
                  {detection.suggestedConfig ? (
                    <SuggestionCard suggestion={detection.suggestedConfig} onUse={() => useSuggestion(detection.suggestedConfig!, detection)} />
                  ) : null}
                  {detection.alternativeConfigs.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Alternative settings</p>
                      {detection.alternativeConfigs.map((suggestion) => (
                        <SuggestionCard key={`${suggestion.smtpHost}-${suggestion.smtpPort}-${suggestion.security}`} suggestion={suggestion} onUse={() => useSuggestion(suggestion, detection)} />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <SmtpFields form={form} onChange={updateForm} errors={fieldErrors} compact />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2.5 md:grid-cols-2">
                <label>
                  <span className={compactLabelClassName}>Provider</span>
                  <Select className={compactInputClassName} value={form.provider} onChange={(event) => updateForm({ ...form, provider: event.target.value as EmailSenderType })}>
                    <option value="custom_smtp">Custom SMTP</option>
                    <option value="gmail_app_password">Gmail App Password</option>
                  </Select>
                </label>
                <label>
                  <span className={compactLabelClassName}>Display Name</span>
                  <Input className={fieldClassName(fieldErrors.displayName)} aria-invalid={Boolean(fieldErrors.displayName)} value={form.displayName} onChange={(event) => updateForm({ ...form, displayName: event.target.value })} placeholder="Sales Sender" />
                  <FieldError message={fieldErrors.displayName} />
                </label>
              </div>
              <SmtpFields form={form} onChange={updateForm} errors={fieldErrors} compact />
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <label>
              <span className={compactLabelClassName}>Send Test Email To</span>
              <Input className={fieldClassName(fieldErrors.testEmail)} aria-invalid={Boolean(fieldErrors.testEmail)} value={form.testEmail} onChange={(event) => updateForm({ ...form, testEmail: event.target.value })} placeholder="qa@example.com" />
              <FieldError message={fieldErrors.testEmail} />
            </label>
            <Button size="sm" className="h-9 self-end" variant="secondary" onClick={handleTestConfig} disabled={pending}>
              <Send size={16} /> {testConfigMutation.isPending ? "Testing..." : "Send Test Email"}
            </Button>
            <Button size="sm" className="h-9 self-end" onClick={handleSaveSender} disabled={pending}>
              {form.senderId ? "Update Sender" : "Save Sender"}
            </Button>
            <Button size="sm" className="h-9 self-end" variant="ghost" onClick={resetForm} disabled={pending}>
              <RefreshCw size={16} /> Reset
            </Button>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
            <span>Provider: {providerLabel(form.provider)}</span>
            <span>Saved password: {activeSender?.smtp_password_configured ? "********" : "Not configured"}</span>
            <span>Last test: {formatDate(activeSender?.last_test_at)}</span>
          </div>
        </Card>

        <Card elevated className="space-y-3 p-3 sm:p-4">
          <SectionIntro eyebrow="Readiness" title="Delivery Readiness" description="These checks confirm whether this organization can use saved senders in the campaign module." />
          <div className="grid gap-2">
            {complianceItems.map((item) => <ChecklistItem key={item.label} checked={item.checked} label={item.label} />)}
          </div>
          <div className="rounded-lg border border-border bg-background-tint p-3 text-sm leading-5 text-text-muted">
            Verified senders are consumed from Campaigns Email. Suppression and unsubscribe handling stay enforced on the backend for every campaign send.
          </div>
        </Card>
      </div>

      <Card elevated className="space-y-3 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <SectionIntro eyebrow="Sender Inventory" title="Configured Senders" description="Each row stays organization-scoped, shows only masked configuration, and supports edit, test, and disable actions." />
            <div className="inline-flex items-center gap-1.5 border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              <Mail size={14} />
              {verifiedSenders.length} Verified
            </div>
          </div>

          {sendersQuery.isLoading ? <EmptyState title="Loading senders" description="Fetching configured email senders for this organization." /> : null}
          {!sendersQuery.isLoading && senders.length === 0 ? (
            <EmptyState title="No senders configured" description="Detect or manually enter SMTP settings, send a test email, then save the sender." />
          ) : null}
          {senders.length > 0 ? (
            <>
              <div className="workspace-table-wrap overflow-x-auto">
                <table className="workspace-table min-w-[1120px]">
                  <thead>
                    <tr>
                      <th>Display Name</th>
                      <th>Provider</th>
                      <th>From Email</th>
                      <th>Status</th>
                      <th>Last Test</th>
                      <th>Quick Test</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sendersPagination.visibleItems.map((sender) => {
                      const feedback = rowFeedback[sender.id];
                      const isTestingThisSender = testSavedSenderMutation.isPending && testSavedSenderMutation.variables?.senderId === sender.id;
                      const quickTestEmail = quickTestEmails[sender.id] ?? "";
                      const feedbackClass =
                        feedback?.tone === "success"
                          ? "text-success"
                          : feedback?.tone === "error"
                            ? "text-destructive"
                            : "text-text-muted";

                      return (
                        <tr key={sender.id}>
                          <td>
                            <div>
                              <p className="font-semibold text-text">{sender.display_name}</p>
                              {sender.status === "disabled" ? <p className="mt-1 text-xs text-warning">Run a successful test to enable this sender again.</p> : null}
                              <p className="text-xs text-text-muted">{sender.from_name} - {sender.smtp_username_masked ?? "Username hidden"}</p>
                            </div>
                          </td>
                          <td>{providerLabel(sender.sender_type)}</td>
                          <td>{sender.from_email}</td>
                          <td><SenderStatusBadge status={sender.status} /></td>
                          <td>
                            <div className="text-sm text-text-muted">
                              <p>{sender.last_test_status ?? "Not tested"}</p>
                              <p className="text-xs">{formatDate(sender.last_test_at)}</p>
                            </div>
                          </td>
                          <td>
                            <div className="space-y-2">
                              <Input
                                className={compactInputClassName}
                                value={quickTestEmail}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setQuickTestEmails((current) => ({ ...current, [sender.id]: value }));
                                  setRowFeedback((current) => {
                                    const next = { ...current };
                                    delete next[sender.id];
                                    return next;
                                  });
                                }}
                                placeholder="qa@example.com"
                              />
                              {feedback ? <p className={`text-xs leading-5 ${feedbackClass}`}>{feedback.message}</p> : null}
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="secondary" onClick={() => loadSender(sender)}>Edit</Button>
                              <Button size="sm" variant="secondary" onClick={() => handleRowTest(sender)} disabled={testSavedSenderMutation.isPending}>
                                {isTestingThisSender ? "Testing..." : sender.status === "disabled" ? "Test & Enable" : "Test"}
                              </Button>
                              <Button size="sm" variant="danger" onClick={() => disableSenderMutation.mutate(sender.id)} disabled={disableSenderMutation.isPending || sender.status === "disabled"}>
                                <Ban size={14} /> Disable
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
