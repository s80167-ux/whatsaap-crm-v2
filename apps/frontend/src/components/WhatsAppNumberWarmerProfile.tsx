import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Input, Select } from "./Input";
import { PopupOverlay } from "./PopupOverlay";
import {
  fetchWhatsAppNumberWarmer,
  fetchWhatsAppNumberWarmerLogs,
  pauseWhatsAppNumberWarmer,
  resumeWhatsAppNumberWarmer,
  saveWhatsAppNumberWarmer,
  startWhatsAppNumberWarmer
} from "../api/admin";
import type { WhatsAppAccountSummary, WhatsAppNumberWarmerProfile as WhatsAppNumberWarmerProfileRecord } from "../types/admin";

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatConnectionStatus(status?: string | null) {
  if (!status) {
    return "Unknown";
  }

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatWarmerStatus(status?: string | null) {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    default:
      return "Not Enabled";
  }
}

function toTimeInputValue(value: string) {
  return value.slice(0, 5);
}

type DraftState = {
  warmupDays: number;
  currentDay: number;
  dailyTarget: number;
  minDelayMinutes: number;
  maxDelayMinutes: number;
  activeFrom: string;
  activeUntil: string;
  weekendEnabled: boolean;
  contactSource: "known_contacts";
  messageSource: "warmup_templates";
  manualRecipientNumbers: string;
  status: "not_started" | "active" | "paused" | "completed";
};

function toDraft(profile: WhatsAppNumberWarmerProfileRecord): DraftState {
  return {
    warmupDays: profile.warmup_days,
    currentDay: profile.current_day,
    dailyTarget: profile.daily_target,
    minDelayMinutes: profile.min_delay_minutes,
    maxDelayMinutes: profile.max_delay_minutes,
    activeFrom: toTimeInputValue(profile.active_from),
    activeUntil: toTimeInputValue(profile.active_until),
    weekendEnabled: profile.weekend_enabled,
    contactSource: profile.contact_source,
    messageSource: profile.message_source,
    manualRecipientNumbers: (profile.manual_recipient_numbers ?? []).join("\n"),
    status: profile.status
  };
}

export function WhatsAppNumberWarmerProfile({
  account,
  open,
  onClose,
  initialProfile
}: {
  account: WhatsAppAccountSummary | null;
  open: boolean;
  onClose: () => void;
  initialProfile?: WhatsAppNumberWarmerProfileRecord | null;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(initialProfile ? toDraft(initialProfile) : null);

  const warmerQuery = useQuery({
    queryKey: ["whatsapp-number-warmer", account?.id],
    queryFn: () => fetchWhatsAppNumberWarmer(account?.id ?? ""),
    enabled: open && Boolean(account?.id),
    initialData: account && initialProfile
      ? {
          account,
          profile: initialProfile
        }
      : undefined
  });

  const logsQuery = useQuery({
    queryKey: ["whatsapp-number-warmer-logs", account?.id],
    queryFn: () => fetchWhatsAppNumberWarmerLogs(account?.id ?? ""),
    enabled: open && Boolean(account?.id)
  });

  const profile = warmerQuery.data?.profile ?? null;
  const resolvedAccount = warmerQuery.data?.account ?? account;

  useEffect(() => {
    if (profile) {
      setDraft(toDraft(profile));
    }
  }, [profile]);

  async function refreshWarmerState() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["whatsapp-number-warmer", account?.id] }),
      queryClient.invalidateQueries({ queryKey: ["whatsapp-number-warmer-logs", account?.id] }),
      queryClient.invalidateQueries({ queryKey: ["whatsapp-accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["campaign-warmup-advisory"] })
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id || !draft) {
        throw new Error("Warmer profile is not ready yet.");
      }

      return saveWhatsAppNumberWarmer(account.id, {
        warmupDays: draft.warmupDays,
        currentDay: draft.currentDay,
        dailyTarget: draft.dailyTarget,
        minDelayMinutes: draft.minDelayMinutes,
        maxDelayMinutes: draft.maxDelayMinutes,
        activeFrom: draft.activeFrom,
        activeUntil: draft.activeUntil,
        weekendEnabled: draft.weekendEnabled,
        contactSource: draft.contactSource,
        messageSource: draft.messageSource,
        manualRecipientNumbers: draft.manualRecipientNumbers
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean),
        status: draft.status
      });
    },
    onSuccess: async () => {
      setNotice("Warmer settings saved.");
      await refreshWarmerState();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Unable to save warmer settings.")
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) {
        throw new Error("WhatsApp account is missing.");
      }

      return startWhatsAppNumberWarmer(account.id);
    },
    onSuccess: async () => {
      setNotice("Warmer started.");
      await refreshWarmerState();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Unable to start warmer.")
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) {
        throw new Error("WhatsApp account is missing.");
      }

      return pauseWhatsAppNumberWarmer(account.id);
    },
    onSuccess: async () => {
      setNotice("Warmer paused.");
      await refreshWarmerState();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Unable to pause warmer.")
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!account?.id) {
        throw new Error("WhatsApp account is missing.");
      }

      return resumeWhatsAppNumberWarmer(account.id);
    },
    onSuccess: async () => {
      setNotice("Warmer resumed.");
      await refreshWarmerState();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Unable to resume warmer.")
  });

  const isMutating = saveMutation.isPending || startMutation.isPending || pauseMutation.isPending || resumeMutation.isPending;

  return (
    <PopupOverlay
      open={open}
      onClose={() => !isMutating && onClose()}
      title="Warmer Profile"
      description="Manage warm-up settings, progress, and recent warmer activity for this WhatsApp number."
      panelClassName="max-w-4xl"
    >
      {resolvedAccount ? (
        <div className="space-y-5">
          {notice ? <p className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-text">{notice}</p> : null}

          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-border bg-muted px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">WhatsApp Number</p>
              <p className="mt-2 text-lg font-semibold text-text">{resolvedAccount.name}</p>
              <p className="mt-1 text-sm text-text-muted">{resolvedAccount.phone_number_normalized ?? resolvedAccount.phone_number ?? "No phone number set"}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-soft">Connection Status</p>
                  <p className="mt-1 text-sm font-medium text-text">{formatConnectionStatus(resolvedAccount.status)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-soft">Warm-up Status</p>
                  <p className="mt-1 text-sm font-medium text-text">{formatWarmerStatus(profile?.status)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Progress</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-soft">Current Day / Warmup Days</p>
                  <p className="mt-1 font-medium text-text">{profile ? `${profile.current_day} / ${profile.warmup_days}` : "Not enabled"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-soft">Today Warmed / Daily Target</p>
                  <p className="mt-1 font-medium text-text">{profile ? `${profile.today_warmed} / ${profile.daily_target}` : "Not enabled"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-soft">Last Warmed At</p>
                  <p className="mt-1 font-medium text-text">{formatDateTime(profile?.last_warmed_at)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-soft">Next Warm Time</p>
                  <p className="mt-1 font-medium text-text">{formatDateTime(profile?.next_warm_at)}</p>
                </div>
              </div>
            </div>
          </div>

          {profile && draft ? (
            <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4 rounded-2xl border border-border bg-card px-4 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Settings Form</p>
                  <p className="mt-1 text-sm text-text-muted">Adjust warm-up pace and operating window for this number.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Warmup Days</span>
                    <Input type="number" min={1} value={draft.warmupDays} onChange={(event) => setDraft((current) => current ? { ...current, warmupDays: Number(event.target.value) } : current)} />
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Current Day</span>
                    <Input type="number" min={1} value={draft.currentDay} onChange={(event) => setDraft((current) => current ? { ...current, currentDay: Number(event.target.value) } : current)} />
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Daily Target</span>
                    <Input type="number" min={1} value={draft.dailyTarget} onChange={(event) => setDraft((current) => current ? { ...current, dailyTarget: Number(event.target.value) } : current)} />
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Status</span>
                    <Select value={draft.status} onChange={(event) => setDraft((current) => current ? { ...current, status: event.target.value as DraftState["status"] } : current)}>
                      <option value="not_started">Not Started</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="completed">Completed</option>
                    </Select>
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Min Delay Minutes</span>
                    <Input type="number" min={1} value={draft.minDelayMinutes} onChange={(event) => setDraft((current) => current ? { ...current, minDelayMinutes: Number(event.target.value) } : current)} />
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Max Delay Minutes</span>
                    <Input type="number" min={1} value={draft.maxDelayMinutes} onChange={(event) => setDraft((current) => current ? { ...current, maxDelayMinutes: Number(event.target.value) } : current)} />
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Active From</span>
                    <Input type="time" value={draft.activeFrom} onChange={(event) => setDraft((current) => current ? { ...current, activeFrom: event.target.value } : current)} />
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Active Until</span>
                    <Input type="time" value={draft.activeUntil} onChange={(event) => setDraft((current) => current ? { ...current, activeUntil: event.target.value } : current)} />
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Contact Source</span>
                    <Select value={draft.contactSource} onChange={(event) => setDraft((current) => current ? { ...current, contactSource: event.target.value as DraftState["contactSource"] } : current)}>
                      <option value="known_contacts">known_contacts</option>
                    </Select>
                  </label>
                  <label className="space-y-1.5 text-sm text-text">
                    <span>Message Source</span>
                    <Select value={draft.messageSource} onChange={(event) => setDraft((current) => current ? { ...current, messageSource: event.target.value as DraftState["messageSource"] } : current)}>
                      <option value="warmup_templates">warmup_templates</option>
                    </Select>
                  </label>
                </div>

                <label className="space-y-1.5 text-sm text-text">
                  <span>Manual Recipient Numbers</span>
                  <textarea
                    className="input-base min-h-28 resize-y"
                    value={draft.manualRecipientNumbers}
                    onChange={(event) => setDraft((current) => current ? { ...current, manualRecipientNumbers: event.target.value } : current)}
                    placeholder={"+60123456789\n+60198765432"}
                  />
                  <p className="text-xs text-text-muted">
                    Other WhatsApp sender numbers in this organization are used automatically first. Add one phone number per line here as fallback or extra warmer recipients.
                  </p>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-border bg-muted px-3 py-3 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={draft.weekendEnabled}
                    onChange={(event) => setDraft((current) => current ? { ...current, weekendEnabled: event.target.checked } : current)}
                  />
                  Weekend enabled
                </label>
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-card px-4 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Recent Warmer Logs</p>
                  <p className="mt-1 text-sm text-text-muted">Latest warmer actions and state changes for this number.</p>
                </div>

                <div className="rounded-xl border border-border bg-muted px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-soft">Automatic Organization Recipients</p>
                  {(profile.auto_recipient_numbers ?? []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.auto_recipient_numbers.map((phone) => (
                        <span key={phone} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-text">
                          {phone}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-text-muted">No other WhatsApp sender numbers were found in this organization yet.</p>
                  )}
                </div>

                <div className="space-y-2">
                  {logsQuery.isLoading ? (
                    <div className="rounded-xl border border-border bg-muted px-3 py-4 text-sm text-text-muted">Loading warmer logs...</div>
                  ) : (logsQuery.data?.length ?? 0) > 0 ? (
                    logsQuery.data?.map((log) => (
                      <div key={log.id} className="rounded-xl border border-border bg-muted px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-text">{log.message}</p>
                          <span className="text-xs text-text-soft">{formatDateTime(log.created_at)}</span>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-text-soft">{log.event_type.replace(/_/g, " ")}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-border bg-muted px-3 py-4 text-sm text-text-muted">No warmer logs yet.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-muted px-4 py-5 text-sm text-text-muted">
              {warmerQuery.isLoading ? "Loading warmer profile..." : "This number does not have a warmer profile yet."}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={isMutating} onClick={onClose}>
              Close
            </Button>
            <Button disabled={isMutating || !draft} onClick={() => saveMutation.mutate()}>
              Save Settings
            </Button>
            {profile?.status === "not_started" ? (
              <Button variant="secondary" disabled={isMutating} onClick={() => startMutation.mutate()}>
                Start Warmer
              </Button>
            ) : null}
            {profile?.status === "active" ? (
              <Button variant="secondary" disabled={isMutating} onClick={() => pauseMutation.mutate()}>
                Pause Warmer
              </Button>
            ) : null}
            {profile?.status === "paused" ? (
              <Button variant="secondary" disabled={isMutating} onClick={() => resumeMutation.mutate()}>
                Resume Warmer
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-muted px-4 py-5 text-sm text-text-muted">Select a WhatsApp number to view its warmer profile.</div>
      )}
    </PopupOverlay>
  );
}
