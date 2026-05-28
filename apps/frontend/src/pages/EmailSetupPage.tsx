import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, ExternalLink, Lightbulb, Mail, RefreshCw, Search, Send, ShieldCheck, Trash2 } from "lucide-react";
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
  deleteEmailSender,
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

type WizardMethod = "gmail" | "smart" | "advanced";
type WizardStep = 1 | 2 | 3 | 4 | 5;

type SenderSetupForm = {
  senderId: string;
  method: WizardMethod;
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
  sendingLimitAcknowledged: boolean;
};

type Notice = {
  tone: "success" | "error";
  title: string;
  message: string;
};

type RowFeedback = {
  tone: "success" | "error" | "info";
  message: string;
};

type AiHelp = {
  title: string;
  explanation: string;
  nextActions: string[];
};

type SenderSetupField = keyof SenderSetupForm | "form";
type SenderSetupErrors = Partial<Record<SenderSetupField, string>>;

const compactInputClassName = "h-9 !px-3 !py-1.5 text-sm";
const compactLabelClassName = "workspace-label !mb-1 text-xs";
const errorInputClassName = "border-destructive/40 bg-destructive/5";

const microsoftUnsupportedMessage =
  "Microsoft Outlook / Microsoft 365 is not supported in this MVP. Please use Gmail App Password or another SMTP provider.";

const emptyForm: SenderSetupForm = {
  senderId: "",
  method: "gmail",
  provider: "gmail_app_password",
  displayName: "Gmail Sender",
  senderName: "",
  fromEmail: "",
  replyToEmail: "",
  smtpHost: "smtp.gmail.com",
  smtpPort: "587",
  smtpUsername: "",
  smtpPassword: "",
  security: "STARTTLS",
  testEmail: "",
  sendingLimitAcknowledged: false
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isMicrosoftDomain(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return ["outlook.com", "hotmail.com", "live.com", "msn.com", "office365.com", "microsoft.com"].some((item) => domain.endsWith(item));
}

function normalizeGmailAppPassword(value: string) {
  return value.replace(/\s+/g, "");
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function providerLabel(provider: EmailSenderType) {
  return provider === "gmail_app_password" ? "Gmail App Password" : "Custom SMTP";
}

function statusTone(status: EmailSenderStatus): "success" | "warning" | "danger" | "muted" {
  if (status === "verified") return "success";
  if (status === "failed" || status === "expired" || status === "reconnect_required") return "danger";
  if (status === "disabled") return "warning";
  return "muted";
}

function fieldClassName(error?: string) {
  return error ? `${compactInputClassName} ${errorInputClassName}` : compactInputClassName;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs leading-4 text-destructive">{message}</p>;
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

function StatusBadge({ tone, children }: { tone: "success" | "warning" | "danger" | "muted" | "info"; children: string }) {
  const className =
    tone === "success"
      ? "border-success/20 bg-success/10 text-success"
      : tone === "danger"
        ? "border-destructive/20 bg-destructive/10 text-destructive"
        : tone === "warning"
          ? "border-warning/20 bg-warning/10 text-warning"
          : tone === "info"
            ? "border-primary/20 bg-primary/10 text-primary"
            : "border-border bg-background-tint text-text-muted";

  return <span className={`inline-flex items-center border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${className}`}>{children}</span>;
}

function SenderStatusBadge({ status }: { status: EmailSenderStatus }) {
  return <StatusBadge tone={statusTone(status)}>{humanize(status)}</StatusBadge>;
}

function Stepper({ step }: { step: WizardStep }) {
  const steps = ["Choose Method", "Configure", "Test", "Readiness", "Save"];

  return (
    <div className="grid gap-2 md:grid-cols-5">
      {steps.map((label, index) => {
        const number = (index + 1) as WizardStep;
        const active = number === step;
        const complete = number < step;

        return (
          <div key={label} className={`border px-3 py-2 ${active ? "border-primary/30 bg-primary/10 text-primary" : complete ? "border-success/20 bg-success/5 text-success" : "border-border bg-background-tint text-text-muted"}`}>
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${active ? "border-primary bg-card" : complete ? "border-success/30 bg-success/10" : "border-border bg-card"}`}>
                {complete ? <CheckCircle2 size={14} /> : number}
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function methodToDefaults(method: WizardMethod, current: SenderSetupForm): SenderSetupForm {
  if (method === "gmail") {
    return {
      ...current,
      method,
      provider: "gmail_app_password",
      displayName: current.displayName || "Gmail Sender",
      smtpHost: "smtp.gmail.com",
      smtpPort: "587",
      security: "STARTTLS",
      smtpUsername: current.fromEmail
    };
  }

  return {
    ...current,
    method,
    provider: "custom_smtp",
    displayName: current.displayName === "Gmail Sender" ? "Custom SMTP Sender" : current.displayName || "Custom SMTP Sender",
    smtpHost: method === "advanced" ? current.smtpHost : "",
    smtpPort: current.smtpPort || "587",
    security: current.security || "STARTTLS"
  };
}

function securityFromSender(sender: EmailSender): SmtpSecurity {
  if (sender.smtp_secure) return "SSL";
  if (sender.smtp_port === 25) return "NONE";
  return "STARTTLS";
}

function hydrateForm(sender: EmailSender, testEmail: string): SenderSetupForm {
  const method: WizardMethod = sender.sender_type === "gmail_app_password" ? "gmail" : "advanced";

  return {
    senderId: sender.id,
    method,
    provider: sender.sender_type,
    displayName: sender.display_name,
    senderName: sender.from_name,
    fromEmail: sender.from_email,
    replyToEmail: sender.reply_to_email ?? "",
    smtpHost: sender.smtp_host ?? (method === "gmail" ? "smtp.gmail.com" : ""),
    smtpPort: sender.smtp_port ? String(sender.smtp_port) : method === "gmail" ? "587" : "",
    smtpUsername: "",
    smtpPassword: "",
    security: securityFromSender(sender),
    testEmail,
    sendingLimitAcknowledged: false
  };
}

function applySuggestionToForm(form: SenderSetupForm, suggestion: SmtpConfigSuggestion, detection: SmtpDetectionResult): SenderSetupForm {
  const isGoogle = detection.detectedProvider === "google_workspace";

  return {
    ...form,
    method: isGoogle ? "gmail" : "smart",
    provider: isGoogle ? "gmail_app_password" : "custom_smtp",
    displayName: isGoogle ? "Gmail Sender" : form.displayName || `${detection.providerLabel} Sender`,
    fromEmail: suggestion.smtpUsername,
    smtpHost: suggestion.smtpHost,
    smtpPort: String(suggestion.smtpPort),
    smtpUsername: suggestion.smtpUsername,
    security: suggestion.security
  };
}

function smtpConfigComplete(form: SenderSetupForm) {
  if (form.provider === "gmail_app_password") return Boolean(form.fromEmail.trim());
  return Boolean(form.smtpHost.trim() && form.smtpPort.trim() && form.smtpUsername.trim());
}

function readinessItems(input: {
  form: SenderSetupForm;
  testPassed: boolean;
  suppressionReady: boolean;
}) {
  const fromEmailValid = isValidEmail(input.form.fromEmail);
  const replyToValid = !input.form.replyToEmail.trim() || isValidEmail(input.form.replyToEmail);
  const gmail = input.form.provider === "gmail_app_password";

  return [
    { label: "Sender name filled", checked: Boolean(input.form.senderName.trim()) },
    { label: "From email valid", checked: fromEmailValid },
    { label: gmail ? "Gmail connected" : "SMTP config detected or filled", checked: smtpConfigComplete(input.form) },
    { label: "Test email sent", checked: input.testPassed },
    { label: "Reply-to email valid if provided", checked: replyToValid },
    { label: "Unsubscribe link enabled", checked: input.suppressionReady },
    { label: "Start small reminder acknowledged", checked: input.form.sendingLimitAcknowledged, warning: true }
  ];
}

function readinessScore(items: Array<{ checked: boolean }>) {
  if (items.length === 0) return 0;
  return Math.round((items.filter((item) => item.checked).length / items.length) * 100);
}

function validateWizardForm(form: SenderSetupForm, organizationId: string | null, action: "next" | "test" | "save"): SenderSetupErrors {
  const errors: SenderSetupErrors = {};
  const isGmail = form.provider === "gmail_app_password";
  const port = Number(form.smtpPort);

  if (!organizationId) errors.form = "Choose an organization before saving an email sender.";
  if (isMicrosoftDomain(form.fromEmail) || form.provider === ("microsoft" as EmailSenderType)) errors.form = microsoftUnsupportedMessage;
  if (!form.senderName.trim()) errors.senderName = "Sender name is required.";
  if (!form.fromEmail.trim()) errors.fromEmail = isGmail ? "Gmail address is required." : "From email is required.";
  if (form.fromEmail.trim() && !isValidEmail(form.fromEmail)) errors.fromEmail = "Enter a valid email address.";
  if (form.replyToEmail.trim() && !isValidEmail(form.replyToEmail)) errors.replyToEmail = "Enter a valid reply-to email.";

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
      errors.smtpPassword = "Enter the password before sending a test.";
    }
  }

  return errors;
}

function friendlyErrorHelp(message: string): AiHelp {
  const lower = message.toLowerCase();

  if (lower.includes("gmail") || lower.includes("app password") || lower.includes("534-5.7.9")) {
    return {
      title: "Gmail App Password required",
      explanation: "Gmail rejected the login because normal Gmail password cannot be used for SMTP.",
      nextActions: ["Enable 2-Step Verification", "Create a Gmail App Password", "Paste the 16-character password into CRM"]
    };
  }

  if (lower.includes("login") || lower.includes("auth") || lower.includes("535")) {
    return {
      title: "SMTP login failed",
      explanation: "The provider did not accept the username and password.",
      nextActions: ["Check the email address", "Check the SMTP username", "Paste the latest App Password or mailbox password"]
    };
  }

  if (lower.includes("tls") || lower.includes("ssl") || lower.includes("certificate")) {
    return {
      title: "Security setting mismatch",
      explanation: "The selected security mode may not match the SMTP port.",
      nextActions: ["Try STARTTLS on port 587", "Try SSL on port 465", "Check the provider SMTP settings"]
    };
  }

  return {
    title: "SMTP setup needs attention",
    explanation: "CRM could not complete the SMTP check with the current settings.",
    nextActions: ["Check the host and port", "Check the username and password", "Try Smart SMTP detection again"]
  };
}

function buildSavePayload(form: SenderSetupForm, organizationId: string | null) {
  const isGmail = form.provider === "gmail_app_password";
  const fromEmail = form.fromEmail.trim();
  const smtpPassword = isGmail ? normalizeGmailAppPassword(form.smtpPassword) : form.smtpPassword.trim();

  return {
    senderId: form.senderId || undefined,
    organizationId,
    sender_type: form.provider,
    display_name: form.displayName.trim() || (isGmail ? "Gmail Sender" : "Custom SMTP Sender"),
    from_name: form.senderName.trim(),
    from_email: fromEmail,
    reply_to_email: form.replyToEmail.trim() || null,
    smtp_host: isGmail ? "smtp.gmail.com" : form.smtpHost.trim(),
    smtp_port: isGmail ? 587 : Number(form.smtpPort),
    smtp_secure: isGmail ? false : form.security === "SSL",
    smtp_username: isGmail ? fromEmail : form.smtpUsername.trim(),
    smtp_password: form.senderId ? smtpPassword || undefined : smtpPassword
  };
}

function buildTestPayload(form: SenderSetupForm) {
  const isGmail = form.provider === "gmail_app_password";

  return {
    provider: form.provider,
    smtpHost: isGmail ? "smtp.gmail.com" : form.smtpHost.trim(),
    smtpPort: isGmail ? 587 : Number(form.smtpPort),
    security: isGmail ? ("STARTTLS" as const) : form.security,
    smtpUsername: isGmail ? form.fromEmail.trim() : form.smtpUsername.trim(),
    smtpPassword: isGmail ? normalizeGmailAppPassword(form.smtpPassword) : form.smtpPassword.trim(),
    fromEmail: form.fromEmail.trim(),
    fromName: form.senderName.trim(),
    replyTo: form.replyToEmail.trim() || null,
    toEmail: form.testEmail.trim(),
    sendEmail: true
  };
}

function MethodCard({ active, title, description, badge, onClick }: { active: boolean; title: string; description: string; badge?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[150px] border p-4 text-left transition ${active ? "border-primary/40 bg-primary/10 shadow-soft" : "border-border bg-card hover:border-primary/20 hover:bg-primary/5"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 text-primary">
          <Mail size={18} />
        </div>
        {badge ? <StatusBadge tone={active ? "info" : "muted"}>{badge}</StatusBadge> : null}
      </div>
      <p className="mt-4 text-sm font-semibold text-text">{title}</p>
      <p className="mt-2 text-sm leading-5 text-text-muted">{description}</p>
    </button>
  );
}

function ChecklistItem({ checked, label, warning }: { checked: boolean; label: string; warning?: boolean }) {
  const tone = checked ? "border-success/20 bg-success/5 text-text" : warning ? "border-warning/20 bg-warning/5 text-text-muted" : "border-border bg-background-tint text-text-muted";

  return (
    <div className={`flex items-center gap-2 border px-2.5 py-2 text-sm ${tone}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${checked ? "border-success/30 bg-success/10 text-success" : warning ? "border-warning/30 bg-warning/10 text-warning" : "border-border bg-card text-text-muted"}`}>
        {checked ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      </span>
      <span>{label}</span>
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

function GmailAdvancedSettings({ form, onChange }: { form: SenderSetupForm; onChange: (next: SenderSetupForm) => void }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-2">
      <Button size="sm" variant="ghost" onClick={() => setShowAdvanced((value) => !value)}>
        {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
      </Button>
      {showAdvanced ? (
        <div className="grid gap-2.5 border border-border bg-background-tint p-3 md:grid-cols-3">
          <label>
            <span className={compactLabelClassName}>SMTP Host</span>
            <Input className={compactInputClassName} value={form.smtpHost} onChange={(event) => onChange({ ...form, smtpHost: event.target.value })} />
          </label>
          <label>
            <span className={compactLabelClassName}>SMTP Port</span>
            <Input className={compactInputClassName} value={form.smtpPort} onChange={(event) => onChange({ ...form, smtpPort: event.target.value })} inputMode="numeric" />
          </label>
          <label>
            <span className={compactLabelClassName}>Security</span>
            <Select className={compactInputClassName} value={form.security} onChange={(event) => onChange({ ...form, security: event.target.value as SmtpSecurity })}>
              <option value="STARTTLS">STARTTLS</option>
              <option value="SSL">SSL</option>
              <option value="NONE">None</option>
            </Select>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function ErrorHelpCard({ help }: { help: AiHelp }) {
  return (
    <div className="border border-warning/20 bg-warning/5 p-3">
      <div className="flex items-center gap-2 text-warning">
        <Lightbulb size={16} />
        <p className="text-sm font-semibold">{help.title}</p>
      </div>
      <p className="mt-2 text-sm leading-5 text-text-muted">{help.explanation}</p>
      <div className="mt-3 grid gap-2">
        {help.nextActions.map((action) => (
          <ChecklistItem key={action} checked={false} warning label={action} />
        ))}
      </div>
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

  const [step, setStep] = useState<WizardStep>(1);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const [form, setForm] = useState<SenderSetupForm>({ ...emptyForm, testEmail: currentUser?.email ?? "" });
  const [fieldErrors, setFieldErrors] = useState<SenderSetupErrors>({});
  const [detectEmail, setDetectEmail] = useState("");
  const [detection, setDetection] = useState<SmtpDetectionResult | null>(null);
  const [quickTestEmails, setQuickTestEmails] = useState<Record<string, string>>({});
  const [testPassed, setTestPassed] = useState(false);
  const [testFailureHelp, setTestFailureHelp] = useState<AiHelp | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<EmailSender | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<EmailSender | null>(null);

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
  const items = readinessItems({ form, testPassed: testPassed || activeSender?.status === "verified", suppressionReady: suppressionQuery.isSuccess });
  const score = readinessScore(items);
  const pending = false;

  const detectMutation = useMutation({
    mutationFn: () => detectSmtpSettings({ email: detectEmail.trim() }),
    onSuccess: (result) => {
      setDetection(result);
      setTestPassed(false);
      setTestFailureHelp(null);

      if (result.unsupported) {
        setNotice({ tone: "error", title: "Provider unsupported", message: result.notes[0] || microsoftUnsupportedMessage });
        return;
      }

      if (result.suggestedConfig) {
        setForm((current) => applySuggestionToForm(current, result.suggestedConfig!, result));
      }

      setNotice({ tone: "success", title: "SMTP settings detected", message: `${result.providerLabel} detected with ${Math.round(result.confidence * 100)}% confidence.` });
    },
    onError: (error) => {
      setDetection(null);
      setNotice({ tone: "error", title: "Detection failed", message: error instanceof Error ? error.message : "Unable to detect SMTP settings." });
    }
  });

  const testConfigMutation = useMutation({
    mutationFn: () => testSmtpConfig(buildTestPayload(form)),
    onSuccess: (result) => {
      setFieldErrors({});
      setTestPassed(true);
      setTestFailureHelp(null);
      setNotice({ tone: "success", title: "Test email sent successfully", message: result.message || "This sender is ready for small email campaigns." });
      setStep(4);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to test SMTP settings.";
      setTestPassed(false);
      setTestFailureHelp(friendlyErrorHelp(message));
      setNotice({ tone: "error", title: "Test failed", message });
    }
  });

  const saveSenderMutation = useMutation({
    mutationFn: () => saveEmailSender(buildSavePayload(form, organizationId)),
    onSuccess: (sender) => {
      setFieldErrors({});
      setSaveSuccess(sender);
      setNotice({ tone: "success", title: "Email sender saved successfully", message: "You can now use this sender in Email Campaign." });
      setForm((current) => ({ ...hydrateForm(sender, current.testEmail || currentUser?.email || ""), sendingLimitAcknowledged: current.sendingLimitAcknowledged }));
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to save sender.";
      setNotice({ tone: "error", title: "Save failed", message });
    }
  });

  const testSavedSenderMutation = useMutation({
    mutationFn: (input: { senderId: string; toEmail: string }) =>
      testEmailSender({ senderId: input.senderId, organizationId, to_email: input.toEmail }),
    onSuccess: (result, variables) => {
      setNotice({ tone: "success", title: "Saved sender tested", message: result.result.message || "Test email sent successfully." });
      setRowFeedback((current) => ({ ...current, [variables.senderId]: { tone: "success", message: "Test passed. Sender is ready to use." } }));
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error, variables) => {
      const message = error instanceof Error ? error.message : "Unable to test sender.";
      setNotice({ tone: "error", title: "Saved sender test failed", message });
      setRowFeedback((current) => ({ ...current, [variables.senderId]: { tone: "error", message } }));
    }
  });

  const disableSenderMutation = useMutation({
    mutationFn: (senderId: string) => disableEmailSender({ senderId, organizationId }),
    onSuccess: (result) => {
      setNotice({ tone: "success", title: "Sender disabled", message: `${result.display_name} disabled.` });
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: (error) => {
      setNotice({ tone: "error", title: "Disable failed", message: error instanceof Error ? error.message : "Unable to disable sender." });
    }
  });

  const deleteSenderMutation = useMutation({
    mutationFn: (senderId: string) => deleteEmailSender({ senderId, organizationId }),
    onSuccess: () => {
      const deletedSenderId = deleteCandidate?.id;
      setNotice({ tone: "success", title: "Email sender deleted successfully", message: "Email sender deleted successfully." });
      if (deletedSenderId) {
        queryClient.setQueryData<EmailSender[]>(["email-campaigns", "senders", organizationId], (current) =>
          current ? current.filter((sender) => sender.id !== deletedSenderId) : current
        );
      }
      setDeleteCandidate(null);
      if (deletedSenderId && form.senderId === deletedSenderId) {
        resetForm();
      }
      void queryClient.invalidateQueries({ queryKey: ["email-campaigns", "senders", organizationId] });
    },
    onError: () => {
      setNotice({ tone: "error", title: "Delete failed", message: "Unable to delete sender. Please try again." });
    }
  });

  const isBusy = saveSenderMutation.isPending || testConfigMutation.isPending || detectMutation.isPending || pending;

  const campaignReadinessLabel = useMemo(() => {
    if (score >= 85) return "Ready for small campaign";
    if (score >= 60) return "Almost ready";
    return "Needs setup";
  }, [score]);

  function updateForm(next: SenderSetupForm) {
    const normalized =
      next.provider === "gmail_app_password"
        ? {
            ...next,
            smtpHost: "smtp.gmail.com",
            smtpPort: "587",
            security: "STARTTLS" as SmtpSecurity,
            smtpUsername: next.fromEmail,
            smtpPassword: normalizeGmailAppPassword(next.smtpPassword)
          }
        : next;

    setForm(normalized);
    setTestPassed(false);
    setSaveSuccess(null);
    if (Object.keys(fieldErrors).length > 0) setFieldErrors({});
  }

  function chooseMethod(method: WizardMethod) {
    setForm((current) => methodToDefaults(method, current));
    setFieldErrors({});
    setDetection(null);
    setTestPassed(false);
    setSaveSuccess(null);
  }

  function goNext() {
    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2 || step === 3 || step === 4) {
      const errors = validateWizardForm(form, organizationId, "next");
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setNotice({ tone: "error", title: "Setup needs attention", message: errors.form || "Some required sender fields need attention." });
        return;
      }
      setStep((current) => Math.min(5, current + 1) as WizardStep);
    }
  }

  function goBack() {
    setStep((current) => Math.max(1, current - 1) as WizardStep);
  }

  function handleTestConfig() {
    const errors = validateWizardForm(form, organizationId, "test");
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotice({ tone: "error", title: "Test needs attention", message: errors.form || "Some required test email fields need attention." });
      return;
    }

    setFieldErrors({});
    testConfigMutation.mutate();
  }

  function handleSaveSender() {
    const errors = validateWizardForm(form, organizationId, "save");
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setNotice({ tone: "error", title: "Save needs attention", message: errors.form || "Some required sender fields need attention." });
      return;
    }

    setFieldErrors({});
    saveSenderMutation.mutate();
  }

  function resetForm() {
    setForm({ ...emptyForm, testEmail: currentUser?.email ?? "" });
    setStep(1);
    setFieldErrors({});
    setDetection(null);
    setDetectEmail("");
    setTestPassed(false);
    setTestFailureHelp(null);
    setSaveSuccess(null);
  }

  function loadSender(sender: EmailSender) {
    setForm(hydrateForm(sender, quickTestEmails[sender.id] || currentUser?.email || ""));
    setStep(2);
    setDetection(null);
    setFieldErrors({});
    setTestPassed(sender.status === "verified");
    setTestFailureHelp(null);
    setSaveSuccess(null);
  }

  function useSuggestion(suggestion: SmtpConfigSuggestion, result = detection) {
    if (!result) return;
    setForm((current) => applySuggestionToForm(current, suggestion, result));
    setFieldErrors({});
    setTestPassed(false);
    setNotice({ tone: "success", title: "SMTP settings applied", message: "Enter sender name and password, then send a test email." });
  }

  function handleRowTest(sender: EmailSender) {
    const toEmail = quickTestEmails[sender.id]?.trim() || currentUser?.email || "";

    if (!toEmail || !isValidEmail(toEmail)) {
      const message = "Enter a valid recipient email in Quick Test first.";
      setNotice({ tone: "error", title: "Quick test needs recipient", message });
      setRowFeedback((current) => ({ ...current, [sender.id]: { tone: "error", message } }));
      return;
    }

    setRowFeedback((current) => ({ ...current, [sender.id]: { tone: "info", message: "Sending test email..." } }));
    testSavedSenderMutation.mutate({ senderId: sender.id, toEmail });
  }

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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Email Setup Wizard</p>
            <h1 className="mt-2 section-title">Email Setup Wizard</h1>
            <p className="section-copy mt-1 max-w-3xl">A guided setup assistant for Gmail App Password and SMTP senders, built for PMKS users who should not need to understand raw SMTP settings first.</p>
          </div>
          <div className="workspace-subtle p-3">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck size={16} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Safe SMTP setup</p>
            </div>
            <p className="mt-1 text-sm leading-5 text-text-muted">Passwords are masked, never returned to the page, and only updated when a new value is entered.</p>
          </div>
        </div>
      </div>

      {notice ? (
        <Card elevated className={`p-3 ${notice.tone === "error" ? "border-destructive/20 bg-destructive/5" : "border-success/20 bg-success/5"}`}>
          <p className={`text-sm font-semibold ${notice.tone === "error" ? "text-destructive" : "text-success"}`}>{notice.title}</p>
          <p className="mt-1 text-sm leading-5 text-text-muted">{notice.message}</p>
        </Card>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
        <Card elevated className="space-y-4 p-3 sm:p-4">
          <Stepper step={step} />

          {fieldErrors.form ? (
            <div className="border border-destructive/20 bg-destructive/5 p-3 text-sm leading-5 text-destructive">{fieldErrors.form}</div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <SectionIntro eyebrow="Step 1" title="Choose Sending Method" description="Pick the easiest option for your email account. Gmail setup is recommended for non-technical users." />
              <div className="grid gap-3 md:grid-cols-3">
                <MethodCard
                  active={form.method === "gmail"}
                  title="Gmail Guided Setup"
                  description="Use Gmail with a secure App Password. We will fill in the SMTP settings for you."
                  badge="Recommended"
                  onClick={() => chooseMethod("gmail")}
                />
                <MethodCard
                  active={form.method === "smart"}
                  title="Smart SMTP Setup"
                  description="Enter your email address and we will try to detect the correct SMTP settings."
                  badge="Detect"
                  onClick={() => chooseMethod("smart")}
                />
                <MethodCard
                  active={form.method === "advanced"}
                  title="Advanced Manual SMTP"
                  description="For users who already know their SMTP host, port and security settings."
                  badge="Manual"
                  onClick={() => chooseMethod("advanced")}
                />
              </div>
            </div>
          ) : null}

          {step === 2 && form.method === "gmail" ? (
            <div className="space-y-4">
              <SectionIntro eyebrow="Step 2A" title="Gmail Guided Setup" description="Do not use your normal Gmail password. Gmail requires a 16-character App Password." />
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="space-y-3">
                  <div className="grid gap-2.5 md:grid-cols-2">
                    <label>
                      <span className={compactLabelClassName}>Sender Name</span>
                      <Input className={fieldClassName(fieldErrors.senderName)} value={form.senderName} onChange={(event) => updateForm({ ...form, senderName: event.target.value })} placeholder="Rezeki Dashboard Team" />
                      <FieldError message={fieldErrors.senderName} />
                    </label>
                    <label>
                      <span className={compactLabelClassName}>Gmail Address</span>
                      <Input className={fieldClassName(fieldErrors.fromEmail)} value={form.fromEmail} onChange={(event) => updateForm({ ...form, fromEmail: event.target.value, smtpUsername: event.target.value })} placeholder="name@gmail.com" />
                      <FieldError message={fieldErrors.fromEmail} />
                    </label>
                    <label>
                      <span className={compactLabelClassName}>Reply-To Email Optional</span>
                      <Input className={fieldClassName(fieldErrors.replyToEmail)} value={form.replyToEmail} onChange={(event) => updateForm({ ...form, replyToEmail: event.target.value })} placeholder="Optional" />
                      <FieldError message={fieldErrors.replyToEmail} />
                    </label>
                    <label>
                      <span className={compactLabelClassName}>Gmail App Password</span>
                      <Input className={fieldClassName(fieldErrors.smtpPassword)} type="password" value={form.smtpPassword} onChange={(event) => updateForm({ ...form, smtpPassword: event.target.value })} placeholder={form.senderId ? "Leave blank to keep saved password" : "16-character App Password"} />
                      <FieldError message={fieldErrors.smtpPassword} />
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                        onClick={() => window.open("https://myaccount.google.com/apppasswords", "_blank", "noopener,noreferrer")}
                      >
                        <ExternalLink size={13} /> Open Google App Passwords
                      </button>
                    </label>
                  </div>
                  <GmailAdvancedSettings form={form} onChange={updateForm} />
                </div>
                <div className="space-y-2">
                  {["Login to the correct Google Account.", "Enable 2-Step Verification.", "Open App Passwords.", "Create App Password for Mail / Rezeki Dashboard.", "Copy the 16-character password.", "Paste it into CRM.", "Send test email."].map((label) => (
                    <ChecklistItem key={label} checked={false} label={label} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 && form.method === "smart" ? (
            <div className="space-y-4">
              <SectionIntro eyebrow="Step 2B" title="Smart SMTP Setup" description="Enter your email address. CRM will inspect the domain MX records and suggest SMTP settings where possible." />
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
                    <StatusBadge tone={detection.unsupported ? "danger" : "info"}>{detection.unsupported ? "Unsupported" : "Detected"}</StatusBadge>
                  </div>
                  {detection.notes.map((note) => (
                    <p key={note} className={detection.unsupported ? "text-sm text-destructive" : "text-sm text-text-muted"}>{note}</p>
                  ))}
                  {detection.suggestedConfig ? <SuggestionCard suggestion={detection.suggestedConfig} onUse={() => useSuggestion(detection.suggestedConfig!, detection)} /> : null}
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

              <div className="grid gap-2.5 md:grid-cols-2">
                <label>
                  <span className={compactLabelClassName}>Sender Name</span>
                  <Input className={fieldClassName(fieldErrors.senderName)} value={form.senderName} onChange={(event) => updateForm({ ...form, senderName: event.target.value })} placeholder="Sales Team" />
                  <FieldError message={fieldErrors.senderName} />
                </label>
                <label>
                  <span className={compactLabelClassName}>From Email</span>
                  <Input className={fieldClassName(fieldErrors.fromEmail)} value={form.fromEmail} onChange={(event) => updateForm({ ...form, fromEmail: event.target.value, smtpUsername: form.provider === "custom_smtp" && !form.smtpUsername ? event.target.value : form.smtpUsername })} placeholder="sales@example.com" />
                  <FieldError message={fieldErrors.fromEmail} />
                </label>
                <label>
                  <span className={compactLabelClassName}>Reply-To Email Optional</span>
                  <Input className={fieldClassName(fieldErrors.replyToEmail)} value={form.replyToEmail} onChange={(event) => updateForm({ ...form, replyToEmail: event.target.value })} placeholder="Optional" />
                  <FieldError message={fieldErrors.replyToEmail} />
                </label>
                <label>
                  <span className={compactLabelClassName}>SMTP Password / App Password</span>
                  <Input className={fieldClassName(fieldErrors.smtpPassword)} type="password" value={form.smtpPassword} onChange={(event) => updateForm({ ...form, smtpPassword: event.target.value })} placeholder={form.senderId ? "Leave blank to keep saved password" : "Password or app password"} />
                  <FieldError message={fieldErrors.smtpPassword} />
                </label>
              </div>
            </div>
          ) : null}

          {step === 2 && form.method === "advanced" ? (
            <div className="space-y-4">
              <SectionIntro eyebrow="Step 2C" title="Advanced Manual SMTP" description="Use this when your email provider has already given you the SMTP host, port, username and security setting." />
              <div className="grid gap-2.5 md:grid-cols-2">
                <label>
                  <span className={compactLabelClassName}>Sender Name</span>
                  <Input className={fieldClassName(fieldErrors.senderName)} value={form.senderName} onChange={(event) => updateForm({ ...form, senderName: event.target.value })} placeholder="Sales Team" />
                  <FieldError message={fieldErrors.senderName} />
                </label>
                <label>
                  <span className={compactLabelClassName}>From Email</span>
                  <Input className={fieldClassName(fieldErrors.fromEmail)} value={form.fromEmail} onChange={(event) => updateForm({ ...form, fromEmail: event.target.value })} placeholder="sales@example.com" />
                  <FieldError message={fieldErrors.fromEmail} />
                </label>
                <label>
                  <span className={compactLabelClassName}>Reply-To Email Optional</span>
                  <Input className={fieldClassName(fieldErrors.replyToEmail)} value={form.replyToEmail} onChange={(event) => updateForm({ ...form, replyToEmail: event.target.value })} placeholder="Optional" />
                  <FieldError message={fieldErrors.replyToEmail} />
                </label>
                <label>
                  <span className={compactLabelClassName}>SMTP Host</span>
                  <Input className={fieldClassName(fieldErrors.smtpHost)} value={form.smtpHost} onChange={(event) => updateForm({ ...form, smtpHost: event.target.value })} placeholder="smtp.example.com" />
                  <FieldError message={fieldErrors.smtpHost} />
                </label>
                <label>
                  <span className={compactLabelClassName}>SMTP Port</span>
                  <Input className={fieldClassName(fieldErrors.smtpPort)} value={form.smtpPort} onChange={(event) => updateForm({ ...form, smtpPort: event.target.value })} inputMode="numeric" placeholder="587" />
                  <FieldError message={fieldErrors.smtpPort} />
                </label>
                <label>
                  <span className={compactLabelClassName}>Security</span>
                  <Select className={compactInputClassName} value={form.security} onChange={(event) => updateForm({ ...form, security: event.target.value as SmtpSecurity })}>
                    <option value="STARTTLS">STARTTLS</option>
                    <option value="SSL">SSL</option>
                    <option value="NONE">None</option>
                  </Select>
                </label>
                <label>
                  <span className={compactLabelClassName}>SMTP Username</span>
                  <Input className={fieldClassName(fieldErrors.smtpUsername)} value={form.smtpUsername} onChange={(event) => updateForm({ ...form, smtpUsername: event.target.value })} placeholder="sender@example.com" />
                  <FieldError message={fieldErrors.smtpUsername} />
                </label>
                <label>
                  <span className={compactLabelClassName}>SMTP Password / App Password</span>
                  <Input className={fieldClassName(fieldErrors.smtpPassword)} type="password" value={form.smtpPassword} onChange={(event) => updateForm({ ...form, smtpPassword: event.target.value })} placeholder={form.senderId ? "Leave blank to keep saved password" : "Password or app password"} />
                  <FieldError message={fieldErrors.smtpPassword} />
                </label>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <SectionIntro eyebrow="Step 3" title="Test Connection" description="Send a real test email before saving. This checks credentials, SMTP access and From Email permission." />
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <label>
                  <span className={compactLabelClassName}>Send Test Email To</span>
                  <Input className={fieldClassName(fieldErrors.testEmail)} value={form.testEmail} onChange={(event) => updateForm({ ...form, testEmail: event.target.value })} placeholder="you@example.com" />
                  <FieldError message={fieldErrors.testEmail} />
                </label>
                <Button size="sm" className="h-9 self-end" onClick={handleTestConfig} disabled={isBusy}>
                  <Send size={16} /> {testConfigMutation.isPending ? "Testing..." : "Send Test Email"}
                </Button>
              </div>
              {testPassed ? (
                <div className="border border-success/20 bg-success/5 p-3">
                  <p className="text-sm font-semibold text-success">Test email sent successfully.</p>
                  <p className="mt-1 text-sm leading-5 text-text-muted">This sender is ready for small email campaigns.</p>
                </div>
              ) : null}
              {testFailureHelp ? <ErrorHelpCard help={testFailureHelp} /> : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <SectionIntro eyebrow="Step 4" title="Campaign Readiness" description="Review the simple readiness score before saving this sender for Email Campaign." />
              <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
                <div className="border border-primary/20 bg-primary/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Score</p>
                  <p className="mt-2 text-3xl font-semibold text-text">{score}/100</p>
                  <p className="mt-1 text-sm font-semibold text-primary">{campaignReadinessLabel}</p>
                  <p className="mt-2 text-sm leading-5 text-text-muted">Test passed, but start with small batches to protect your sender reputation.</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {items.map((item) => <ChecklistItem key={item.label} checked={item.checked} warning={item.warning} label={item.label} />)}
                </div>
              </div>
              <label className="flex items-start gap-2 border border-warning/20 bg-warning/5 p-3 text-sm leading-5 text-text-muted">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.sendingLimitAcknowledged}
                  onChange={(event) => setForm((current) => ({ ...current, sendingLimitAcknowledged: event.target.checked }))}
                />
                <span>Start small: send slowly for the first campaign and increase volume only after replies and delivery look healthy.</span>
              </label>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <SectionIntro eyebrow="Step 5" title="Save Sender" description="Save the sender after reviewing the setup. Saved passwords are not exposed back to the frontend." />
              <div className="grid gap-3 md:grid-cols-2">
                <ChecklistItem checked={Boolean(form.senderName.trim())} label={`Sender: ${form.senderName || "Not filled"}`} />
                <ChecklistItem checked={isValidEmail(form.fromEmail)} label={`From Email: ${form.fromEmail || "Not filled"}`} />
                <ChecklistItem checked={smtpConfigComplete(form)} label={`Provider: ${providerLabel(form.provider)}`} />
                <ChecklistItem checked={testPassed || activeSender?.status === "verified"} label={testPassed || activeSender?.status === "verified" ? "Test Passed" : "Test not passed yet"} />
              </div>
              <Button onClick={handleSaveSender} disabled={isBusy}>
                {saveSenderMutation.isPending ? "Saving..." : "Save Sender"}
              </Button>
              {saveSuccess ? (
                <div className="border border-success/20 bg-success/5 p-3">
                  <p className="text-sm font-semibold text-success">Email sender saved successfully.</p>
                  <p className="mt-1 text-sm leading-5 text-text-muted">You can now use this sender in Email Campaign.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
              <span>Provider: {providerLabel(form.provider)}</span>
              <span>Status: {testPassed ? "Test Passed" : activeSender?.status ? humanize(activeSender.status) : "Draft"}</span>
              <span>Password: {activeSender?.smtp_password_configured ? "masked" : "not saved"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={resetForm} disabled={isBusy}><RefreshCw size={14} /> Reset</Button>
              {step > 1 ? <Button size="sm" variant="secondary" onClick={goBack} disabled={isBusy}>Back</Button> : null}
              {step < 3 ? <Button size="sm" onClick={goNext} disabled={isBusy}>Next</Button> : null}
              {step === 3 && testPassed ? <Button size="sm" onClick={() => setStep(4)} disabled={isBusy}>Next</Button> : null}
              {step === 4 ? <Button size="sm" onClick={() => setStep(5)} disabled={isBusy}>Next</Button> : null}
            </div>
          </div>
        </Card>

        <Card elevated className="space-y-3 p-3 sm:p-4">
          <SectionIntro eyebrow="Live Readiness" title={campaignReadinessLabel} description="This card updates as the wizard fields become campaign-ready." />
          <div className="border border-primary/20 bg-primary/10 p-3">
            <p className="text-2xl font-semibold text-text">{score}/100</p>
            <p className="mt-1 text-sm text-text-muted">Ready for small campaign when the test passes and all required fields are complete.</p>
          </div>
          <div className="grid gap-2">
            {items.slice(0, 5).map((item) => <ChecklistItem key={item.label} checked={item.checked} warning={item.warning} label={item.label} />)}
          </div>
        </Card>
      </div>

      <Card elevated className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <SectionIntro eyebrow="Sender Inventory" title="Configured Senders" description="Saved senders stay organization-scoped. Passwords are masked and never returned to the page." />
          <div className="inline-flex items-center gap-1.5 border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
            <Mail size={14} />
            {verifiedSenders.length} Verified
          </div>
        </div>

        {sendersQuery.isLoading ? <EmptyState title="Loading senders" description="Fetching configured email senders for this organization." /> : null}
        {!sendersQuery.isLoading && senders.length === 0 ? (
          <EmptyState title="No senders configured" description="Use the wizard above to configure Gmail App Password or SMTP, send a test email, then save the sender." />
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
                            <p className="text-xs text-text-muted">{sender.from_name} - {sender.smtp_username_masked ?? "Username hidden"}</p>
                            {sender.last_test_error ? <p className="mt-1 text-xs text-destructive">{sender.last_test_error}</p> : null}
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
                              placeholder={currentUser?.email || "qa@example.com"}
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
                            <Button size="sm" variant="danger" onClick={() => setDeleteCandidate(sender)} disabled={deleteSenderMutation.isPending}>
                              <Trash2 size={14} /> Delete
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

      {deleteCandidate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive">
                <Trash2 size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-text">Delete email sender?</h2>
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  This will permanently remove this sender configuration from your organization. Campaigns that already used this sender will keep their historical records, but this sender can no longer be used for new campaigns.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 border border-border bg-background-tint p-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Display name</span>
                <span className="text-right font-semibold text-text">{deleteCandidate.display_name}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">From email</span>
                <span className="text-right font-semibold text-text">{deleteCandidate.from_email}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Provider</span>
                <span className="text-right font-semibold text-text">{providerLabel(deleteCandidate.sender_type)}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteCandidate(null)} disabled={deleteSenderMutation.isPending}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => deleteSenderMutation.mutate(deleteCandidate.id)} disabled={deleteSenderMutation.isPending}>
                {deleteSenderMutation.isPending ? "Deleting..." : "Delete Sender"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
