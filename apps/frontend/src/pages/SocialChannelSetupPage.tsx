import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, ExternalLink, Pencil, PlugZap, RefreshCw, Save, Trash2, Unplug, X } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { config } from "../lib/config";
import {
  createSocialChannelAccount,
  deleteSocialChannelAccount,
  disconnectSocialChannelAccount,
  getMetaConnectUrl,
  getSocialChannelAccountStatus,
  listSocialChannelAccounts,
  updateSocialChannelAccount,
  type MetaConnectUrlResponse,
  type SocialChannelAccount,
  type SocialChannelPlatform
} from "../lib/socialChannelsApi";

type SocialChannelSetupPageProps = {
  platform: SocialChannelPlatform;
};

type FormState = {
  label: string;
  externalAccountName: string;
  externalAccountId: string;
  username: string;
};

const PLATFORM_CONTENT: Record<SocialChannelPlatform, {
  title: string;
  eyebrow: string;
  description: string;
  checklist: string[];
  defaultLabel: string;
}> = {
  facebook: {
    title: "Facebook Messenger Setup",
    eyebrow: "Facebook Messenger",
    description: "Save setup placeholders for future Meta connection. No OAuth, token exchange, webhook ingestion or inbox sync is enabled in Phase 1.",
    checklist: [
      "Meta App required",
      "Facebook Page required",
      "Page access permission required",
      "Webhook callback URL required",
      "Messaging permission required"
    ],
    defaultLabel: "Facebook Page"
  },
  instagram: {
    title: "Instagram DM Setup",
    eyebrow: "Instagram DM",
    description: "Save setup placeholders for future Instagram messaging connection. No OAuth, token exchange, webhook ingestion or inbox sync is enabled in Phase 1.",
    checklist: [
      "Instagram Professional Account required",
      "Instagram account linked to Facebook Page",
      "Meta App required",
      "Instagram messaging permission required",
      "Webhook callback URL required"
    ],
    defaultLabel: "Instagram Account"
  }
};

const connectionStatusLabel: Record<SocialChannelAccount["connection_status"], string> = {
  new: "New",
  setup_pending: "Setup Pending",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
  token_expired: "Token Expired"
};

const webhookStatusLabel: Record<SocialChannelAccount["webhook_status"], string> = {
  pending: "Pending",
  verified: "Verified",
  active: "Active",
  failed: "Failed"
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not synced";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function emptyForm(defaultLabel: string): FormState {
  return {
    label: defaultLabel,
    externalAccountName: "",
    externalAccountId: "",
    username: ""
  };
}

export function SocialChannelSetupPage({ platform }: SocialChannelSetupPageProps) {
  const content = PLATFORM_CONTENT[platform];
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<SocialChannelAccount[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(content.defaultLabel));
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingAccountId, setWorkingAccountId] = useState<string | null>(null);
  const [oauthReadiness, setOauthReadiness] = useState<MetaConnectUrlResponse | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const platformAccounts = useMemo(() => accounts.filter((account) => account.platform === platform), [accounts, platform]);
  const primaryAccount = platformAccounts[0] ?? null;
  const webhookCallbackUrl = `${config.apiBaseUrl}/social-webhook/meta`;

  useEffect(() => {
    setForm(emptyForm(content.defaultLabel));
    setEditingAccountId(null);
    setNotice(null);
  }, [content.defaultLabel, platform]);

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    void loadOauthReadiness();
  }, [platform]);

  async function loadAccounts() {
    setLoading(true);

    try {
      const nextAccounts = await listSocialChannelAccounts();
      setAccounts(nextAccounts);
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to load social channel accounts" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      if (editingAccountId) {
        const account = await updateSocialChannelAccount(editingAccountId, {
          label: form.label,
          externalAccountName: form.externalAccountName || null,
          externalAccountId: form.externalAccountId || null,
          username: form.username || null
        });

        setAccounts((current) => current.map((item) => (item.id === account.id ? account : item)));
        setEditingAccountId(null);
        setNotice({ type: "success", message: "Setup placeholder updated." });
      } else {
        const account = await createSocialChannelAccount({
          platform,
          label: form.label,
          externalAccountName: form.externalAccountName || null,
          externalAccountId: form.externalAccountId || null,
          username: form.username || null
        });

        setAccounts((current) => [account, ...current]);
        setNotice({ type: "success", message: "Setup placeholder saved." });
      }

      setForm(emptyForm(content.defaultLabel));
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to save setup placeholder" });
    } finally {
      setSaving(false);
    }
  }

  function startEditingAccount(account: SocialChannelAccount) {
    setEditingAccountId(account.id);
    setForm({
      label: account.label,
      externalAccountName: account.external_account_name ?? "",
      externalAccountId: account.external_account_id ?? "",
      username: account.username ?? ""
    });
    setNotice(null);
  }

  function cancelEditingAccount() {
    setEditingAccountId(null);
    setForm(emptyForm(content.defaultLabel));
    setNotice(null);
  }

  async function refreshStatus(accountId: string) {
    setWorkingAccountId(accountId);
    setNotice(null);

    try {
      const status = await getSocialChannelAccountStatus(accountId);
      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId
            ? {
                ...account,
                connection_status: status.connection_status,
                webhook_status: status.webhook_status,
                last_sync_at: status.last_sync_at,
                updated_at: status.updated_at
              }
            : account
        )
      );
      setNotice({ type: "success", message: "Status refreshed." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to refresh status" });
    } finally {
      setWorkingAccountId(null);
    }
  }

  async function disconnectAccount(accountId: string) {
    setWorkingAccountId(accountId);
    setNotice(null);

    try {
      const account = await disconnectSocialChannelAccount(accountId);
      setAccounts((current) => current.map((item) => (item.id === account.id ? account : item)));
      setNotice({ type: "success", message: "Account placeholder disconnected." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to disconnect account" });
    } finally {
      setWorkingAccountId(null);
    }
  }

  async function deleteAccount(account: SocialChannelAccount) {
    const label = account.external_account_name || account.label;

    if (!window.confirm(`Delete ${content.eyebrow} connection "${label}"?`)) {
      return;
    }

    setWorkingAccountId(account.id);
    setNotice(null);

    try {
      await deleteSocialChannelAccount(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      if (editingAccountId === account.id) {
        setEditingAccountId(null);
        setForm(emptyForm(content.defaultLabel));
      }
      setNotice({ type: "success", message: "Account placeholder deleted." });
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to delete account" });
    } finally {
      setWorkingAccountId(null);
    }
  }

  async function loadOauthReadiness() {
    setOauthLoading(true);

    try {
      const readiness = await getMetaConnectUrl(platform);
      setOauthReadiness(readiness);
    } catch (error) {
      setOauthReadiness(null);
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Unable to load Meta OAuth readiness" });
    } finally {
      setOauthLoading(false);
    }
  }

  function openMetaConnectUrl() {
    if (!oauthReadiness?.url) {
      setNotice({ type: "error", message: oauthReadiness?.message ?? "Meta OAuth URL is not ready yet." });
      return;
    }

    window.open(oauthReadiness.url, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="space-y-6">
      <div className="workspace-page-header p-5 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),19rem] xl:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Omni-Channel Setup</p>
            <h1 className="mt-3 section-title">{content.title}</h1>
            <p className="section-copy mt-2 max-w-3xl">{content.description}</p>
          </div>
          <div className="workspace-subtle p-4">
            <div className="flex items-center gap-2 text-primary">
              <PlugZap size={16} />
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">Setup preview</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">Saved records are placeholders only and do not connect to Meta yet.</p>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`border px-4 py-3 text-sm font-medium ${notice.type === "success" ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive"}`}>
          {notice.message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr),minmax(0,1.15fr)]">
        <div className="space-y-4">
          <Card elevated className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Connection Status</p>
            <div className="mt-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{primaryAccount ? primaryAccount.label : "No placeholder saved"}</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {primaryAccount ? `${connectionStatusLabel[primaryAccount.connection_status]} - Webhook ${webhookStatusLabel[primaryAccount.webhook_status]}` : "Create a setup placeholder to start preparing this channel."}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                <Clock size={12} />
                Phase 1
              </span>
            </div>
          </Card>

          <Card elevated className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Meta Connection</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Webhook callback URL</p>
                <p className="mt-1 break-all border border-border bg-muted/30 px-3 py-2 text-xs text-text-muted">{webhookCallbackUrl}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Verify token</p>
                <p className="mt-1 text-sm leading-6 text-text-muted">Configure this server-side as META_WEBHOOK_VERIFY_TOKEN. It is not shown in the browser.</p>
              </div>
              <div className="border border-border bg-background/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-soft">OAuth readiness</p>
                <div className="mt-2 space-y-1 text-sm text-foreground">
                  <p>
                    {oauthLoading
                      ? "Checking configuration..."
                      : oauthReadiness?.configured
                        ? "OAuth URL ready"
                        : oauthReadiness?.missingConfig.length
                          ? `Env not configured: ${oauthReadiness.missingConfig.join(", ")}`
                          : "Env not configured"}
                  </p>
                  <p>Webhook {primaryAccount?.webhook_status === "verified" || primaryAccount?.webhook_status === "active" ? "verified" : "pending"}</p>
                  <p>Token {primaryAccount?.connection_status === "connected" ? "connected" : "not connected"}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">Real Meta connection requires Meta App approval and correct permissions.</p>
              </div>
              <Button className="w-full" onClick={openMetaConnectUrl} disabled={!oauthReadiness?.url || oauthLoading}>
                <ExternalLink size={16} />
                Connect with Meta
              </Button>
            </div>
          </Card>

          <Card elevated className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Requirement Checklist</p>
            <div className="mt-4 space-y-3">
              {content.checklist.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-foreground">
                  <CheckCircle className="text-primary" size={16} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card elevated className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {editingAccountId ? "Edit Setup Placeholder" : "Setup Placeholder Form"}
            </p>
            {editingAccountId ? (
              <Button variant="ghost" size="sm" onClick={cancelEditingAccount}>
                <X size={14} />
                Cancel Edit
              </Button>
            ) : null}
          </div>
          <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <label className="text-sm font-medium text-foreground">
              Label
              <input
                className="input-base mt-1.5"
                value={form.label}
                minLength={2}
                required
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              External Account Name
              <input
                className="input-base mt-1.5"
                value={form.externalAccountName}
                placeholder={platform === "facebook" ? "Page name" : "Instagram account name"}
                onChange={(event) => setForm((current) => ({ ...current, externalAccountName: event.target.value }))}
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              External Account ID
              <input
                className="input-base mt-1.5"
                value={form.externalAccountId}
                placeholder={platform === "facebook" ? "Page ID" : "Instagram user ID"}
                onChange={(event) => setForm((current) => ({ ...current, externalAccountId: event.target.value }))}
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              Username
              <input
                className="input-base mt-1.5"
                value={form.username}
                placeholder={platform === "instagram" ? "@businessname" : "Optional page handle"}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              />
            </label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={saving}>
                <Save size={16} />
                {saving ? "Saving..." : editingAccountId ? "Update Setup Placeholder" : "Save Setup Placeholder"}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <Card elevated className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{content.eyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">Saved Account List</h2>
          </div>
          <Button variant="secondary" onClick={() => void loadAccounts()} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "Loading..." : "Refresh Status"}
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {platformAccounts.length === 0 ? (
            <div className="border border-border bg-muted/30 p-4 text-sm text-text-muted">No {content.eyebrow} setup placeholders saved yet.</div>
          ) : (
            platformAccounts.map((account) => (
              <div key={account.id} className="grid gap-4 border border-border bg-background/70 p-4 lg:grid-cols-[minmax(0,1fr),auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">{account.label}</h3>
                    <span className="border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                      {connectionStatusLabel[account.connection_status]}
                    </span>
                    <span className="border border-border bg-muted/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      Webhook {webhookStatusLabel[account.webhook_status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-muted">
                    {[account.external_account_name, account.external_account_id, account.username].filter(Boolean).join(" - ") || "No external account details added yet"}
                  </p>
                  <p className="mt-1 text-xs text-text-soft">Last sync: {formatDate(account.last_sync_at)}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" size="sm" onClick={() => startEditingAccount(account)} disabled={workingAccountId === account.id}>
                    <Pencil size={14} />
                    Edit
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void refreshStatus(account.id)} disabled={workingAccountId === account.id}>
                    <RefreshCw size={14} />
                    Refresh Status
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void disconnectAccount(account.id)} disabled={workingAccountId === account.id}>
                    <Unplug size={14} />
                    Disconnect
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void deleteAccount(account)} disabled={workingAccountId === account.id}>
                    <Trash2 size={14} />
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Button variant="secondary" onClick={() => navigate("/setup/channels")}>
        <ArrowLeft size={16} />
        Back to Channels
      </Button>
    </section>
  );
}
