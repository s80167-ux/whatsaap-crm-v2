import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { ContactService } from "./contactService.js";
import { ConversationService } from "./conversationService.js";
import { SendMessageService } from "./sendMessageService.js";
import { normalizePhoneNumber } from "../utils/phone.js";

type DueWarmerRecord = {
  id: string;
  organization_id: string;
  whatsapp_account_id: string;
  sender_label: string | null;
  sender_phone: string | null;
  warmup_days: number;
  current_day: number;
  daily_target: number;
  today_warmed: number;
  min_delay_minutes: number;
  max_delay_minutes: number;
  active_from: string;
  active_until: string;
  weekend_enabled: boolean;
  status: "not_started" | "active" | "paused" | "completed";
  started_at: string | null;
  last_warmed_at: string | null;
  next_warm_at: string | null;
  manual_recipient_numbers: string[] | null;
};

type RecipientCandidate = {
  phone: string;
  label: string;
  source: "organization_sender" | "manual_recipient";
};

const WARMUP_MESSAGE_TEMPLATES = [
  "Hi, this is a routine WhatsApp line warm-up check. No action is needed on your side.",
  "Hello, we are running a normal message health check for this WhatsApp number. Thanks for keeping the line active.",
  "Good day. This message is part of a gentle connectivity check for our WhatsApp sender.",
  "Hi there, just verifying this WhatsApp line can send normally. No reply is required.",
  "Hello, this is a low-volume warm-up message to keep this WhatsApp sender healthy and active.",
  "Good day. Performing a friendly delivery check for this WhatsApp number. Thank you."
] as const;

export class WhatsAppNumberWarmerService {
  constructor(
    private readonly contactService = new ContactService(),
    private readonly conversationService = new ConversationService(),
    private readonly sendMessageService = new SendMessageService()
  ) {}

  async processDueWarmers(limit = 5) {
    await withTransaction(async (client) => {
      await this.ensureSchema(client);
    });

    const result = await withTransaction(async (client) => {
      const queryResult = await client.query<DueWarmerRecord>(
        `
          select
            w.id,
            w.organization_id,
            w.whatsapp_account_id,
            coalesce(wa.label, wa.display_name, wa.account_phone_e164, wa.account_phone_normalized) as sender_label,
            coalesce(wa.account_phone_e164, wa.account_phone_normalized) as sender_phone,
            w.warmup_days,
            w.current_day,
            w.daily_target,
            w.today_warmed,
            w.min_delay_minutes,
            w.max_delay_minutes,
            to_char(w.active_from, 'HH24:MI:SS') as active_from,
            to_char(w.active_until, 'HH24:MI:SS') as active_until,
            w.weekend_enabled,
            w.status,
            w.started_at,
            w.last_warmed_at,
            w.next_warm_at,
            w.manual_recipient_numbers
          from whatsapp_number_warmers w
          join whatsapp_accounts wa on wa.id = w.whatsapp_account_id
          where w.status = 'active'
            and w.next_warm_at is not null
            and w.next_warm_at <= timezone('utc', now())
          order by w.next_warm_at asc, w.updated_at asc
          limit $1
        `,
        [Math.max(limit, 1)]
      );

      return queryResult.rows;
    });

    let processed = 0;

    for (const warmer of result) {
      const didSend = await this.processSingleWarmer(warmer);
      if (didSend) {
        processed += 1;
      }
    }

    return processed;
  }

  private async processSingleWarmer(warmer: DueWarmerRecord) {
    try {
      const normalizedState = await withTransaction(async (client) => {
        await this.ensureSchema(client);
        const refreshedResult = await client.query<DueWarmerRecord>(
          `
            select
              w.id,
              w.organization_id,
              w.whatsapp_account_id,
              coalesce(wa.label, wa.display_name, wa.account_phone_e164, wa.account_phone_normalized) as sender_label,
              coalesce(wa.account_phone_e164, wa.account_phone_normalized) as sender_phone,
              w.warmup_days,
              w.current_day,
              w.daily_target,
              w.today_warmed,
              w.min_delay_minutes,
              w.max_delay_minutes,
              to_char(w.active_from, 'HH24:MI:SS') as active_from,
              to_char(w.active_until, 'HH24:MI:SS') as active_until,
              w.weekend_enabled,
              w.status,
              w.started_at,
              w.last_warmed_at,
              w.next_warm_at,
              w.manual_recipient_numbers
            from whatsapp_number_warmers w
            join whatsapp_accounts wa on wa.id = w.whatsapp_account_id
            where w.id = $1
            limit 1
          `,
          [warmer.id]
        );

        const current = refreshedResult.rows[0];
        if (!current || current.status !== "active") {
          return null;
        }

        const todayWarmed = this.isSameUtcDay(current.last_warmed_at, new Date()) ? current.today_warmed : 0;
        const currentDay = this.computeCurrentDay({
          startedAt: current.started_at,
          currentDay: current.current_day,
          warmupDays: current.warmup_days
        });

        if (currentDay > current.warmup_days) {
          await client.query(
            `
              update whatsapp_number_warmers
              set
                status = 'completed',
                completed_at = timezone('utc', now()),
                today_warmed = $2,
                next_warm_at = null
              where id = $1
            `,
            [current.id, todayWarmed]
          );
          await this.insertLog(client, {
            warmerId: current.id,
            organizationId: current.organization_id,
            whatsappAccountId: current.whatsapp_account_id,
            eventType: "completed",
            message: "Warmer completed all configured warmup days."
          });
          return null;
        }

        if (todayWarmed >= current.daily_target) {
          const nextWarmAt = this.computeNextDayStart(current.active_from, current.weekend_enabled);
          await client.query(
            `
              update whatsapp_number_warmers
              set
                current_day = $2,
                today_warmed = $3,
                next_warm_at = $4
              where id = $1
            `,
            [current.id, currentDay, todayWarmed, nextWarmAt]
          );
          return null;
        }

        await client.query(
          `
            update whatsapp_number_warmers
            set current_day = $2,
                today_warmed = $3
            where id = $1
          `,
          [current.id, currentDay, todayWarmed]
        );

        return {
          ...current,
          current_day: currentDay,
          today_warmed: todayWarmed
        };
      });

      if (!normalizedState) {
        return false;
      }

      const candidates = await this.loadRecipientCandidates(
        normalizedState.organization_id,
        normalizedState.whatsapp_account_id,
        normalizedState.manual_recipient_numbers ?? []
      );

      if (candidates.length === 0) {
        await withTransaction(async (client) => {
          await this.insertLog(client, {
            warmerId: normalizedState.id,
            organizationId: normalizedState.organization_id,
            whatsappAccountId: normalizedState.whatsapp_account_id,
            eventType: "recipient_missing",
            level: "warning",
            message: "Warmer skipped because no recipient numbers are available."
          });
          await client.query(
            `
              update whatsapp_number_warmers
              set next_warm_at = $2
              where id = $1
            `,
            [normalizedState.id, this.computeRetryAt(60)]
          );
        });
        return false;
      }

      const candidate = candidates[normalizedState.today_warmed % candidates.length];
      const messageText = this.chooseWarmupMessage({
        senderLabel: normalizedState.sender_label,
        senderPhone: normalizedState.sender_phone,
        currentDay: normalizedState.current_day,
        candidate
      });
      const recipientJid = `${candidate.phone.replace(/\D/g, "")}@s.whatsapp.net`;

      const conversation = await withTransaction(async (client) => {
        const { contact } = await this.contactService.findOrCreateCanonicalContact(client, {
          organizationId: normalizedState.organization_id,
          whatsappAccountId: normalizedState.whatsapp_account_id,
          whatsappJid: recipientJid,
          phoneRaw: candidate.phone,
          profileName: candidate.label,
          profilePushName: null,
          profileAvatarUrl: null
        });

        return this.conversationService.findOrCreateConversation(client, {
          organizationId: normalizedState.organization_id,
          whatsappAccountId: normalizedState.whatsapp_account_id,
          contactId: contact.id
        });
      });

      await this.sendMessageService.send(
        {
          organizationId: normalizedState.organization_id,
          whatsappAccountId: normalizedState.whatsapp_account_id,
          conversationId: conversation.id,
          text: messageText
        },
        { waitForDispatch: false }
      );

      await withTransaction(async (client) => {
        const warmedCount = normalizedState.today_warmed + 1;
        const completedDay = normalizedState.current_day >= normalizedState.warmup_days && warmedCount >= normalizedState.daily_target;
        const nextWarmAt = completedDay
          ? null
          : warmedCount >= normalizedState.daily_target
            ? this.computeNextDayStart(normalizedState.active_from, normalizedState.weekend_enabled)
            : this.computeNextWarmAt(normalizedState.min_delay_minutes, normalizedState.max_delay_minutes, normalizedState.active_from, normalizedState.active_until, normalizedState.weekend_enabled);

        await client.query(
          `
            update whatsapp_number_warmers
            set
              today_warmed = $2,
              last_warmed_at = timezone('utc', now()),
              next_warm_at = $3,
              completed_at = case when $4 then timezone('utc', now()) else completed_at end,
              status = case when $4 then 'completed' else status end
            where id = $1
          `,
          [normalizedState.id, warmedCount, nextWarmAt, completedDay]
        );

        await this.insertLog(client, {
          warmerId: normalizedState.id,
          organizationId: normalizedState.organization_id,
          whatsappAccountId: normalizedState.whatsapp_account_id,
          eventType: "message_sent",
          message: `Warm-up message queued for ${candidate.label}.`,
          metadata: {
            recipientPhone: candidate.phone,
            recipientLabel: candidate.label,
            recipientSource: candidate.source,
            messageText,
            currentDay: normalizedState.current_day,
            todayWarmed: warmedCount
          }
        });
      });

      return true;
    } catch (error) {
      logger.warn(
        {
          err: error,
          whatsappAccountId: warmer.whatsapp_account_id,
          warmerId: warmer.id
        },
        "Unable to process WhatsApp number warmer"
      );

      await withTransaction(async (client) => {
        await this.ensureSchema(client);
        await this.insertLog(client, {
          warmerId: warmer.id,
          organizationId: warmer.organization_id,
          whatsappAccountId: warmer.whatsapp_account_id,
          eventType: "send_failed",
          level: "warning",
          message: error instanceof Error ? error.message : "Unable to process warmer send."
        });
        await client.query(
          `
            update whatsapp_number_warmers
            set next_warm_at = $2
            where id = $1
          `,
          [warmer.id, this.computeRetryAt(30)]
        );
      });

      return false;
    }
  }

  private async loadRecipientCandidates(organizationId: string, senderAccountId: string, manualNumbers: string[]) {
    const orgNumbersResult = await withTransaction(async (client) => {
      return client.query<{
        label: string | null;
        phone: string | null;
      }>(
        `
          select
            coalesce(label, display_name, account_phone_e164, account_phone_normalized, id::text) as label,
            coalesce(account_phone_e164, account_phone_normalized) as phone
          from whatsapp_accounts
          where organization_id = $1
            and id <> $2
            and coalesce(account_phone_e164, account_phone_normalized) is not null
            and deleted_at is null
          order by created_at asc
        `,
        [organizationId, senderAccountId]
      );
    });

    const candidates: RecipientCandidate[] = [];
    const seen = new Set<string>();

    for (const row of orgNumbersResult.rows) {
      const normalizedPhone = normalizePhoneNumber(row.phone);
      if (!normalizedPhone || seen.has(normalizedPhone)) {
        continue;
      }
      seen.add(normalizedPhone);
      candidates.push({
        phone: normalizedPhone,
        label: row.label ?? normalizedPhone,
        source: "organization_sender"
      });
    }

    for (const value of manualNumbers) {
      const normalizedPhone = normalizePhoneNumber(value);
      if (!normalizedPhone || seen.has(normalizedPhone)) {
        continue;
      }
      seen.add(normalizedPhone);
      candidates.push({
        phone: normalizedPhone,
        label: normalizedPhone,
        source: "manual_recipient"
      });
    }

    return candidates;
  }

  private chooseWarmupMessage(input: {
    senderLabel: string | null;
    senderPhone: string | null;
    currentDay: number;
    candidate: RecipientCandidate;
  }) {
    const senderName = input.senderLabel ?? input.senderPhone ?? "this WhatsApp number";
    const template = WARMUP_MESSAGE_TEMPLATES[(input.currentDay - 1) % WARMUP_MESSAGE_TEMPLATES.length];

    if (input.candidate.source === "organization_sender") {
      return `${template} Sender: ${senderName}.`;
    }

    return `${template} This is a routine warm-up message from ${senderName}.`;
  }

  private computeCurrentDay(input: {
    startedAt: string | null;
    currentDay: number;
    warmupDays: number;
  }) {
    if (!input.startedAt) {
      return Math.min(Math.max(input.currentDay, 1), input.warmupDays);
    }

    const startedAt = new Date(input.startedAt);
    if (Number.isNaN(startedAt.getTime())) {
      return Math.min(Math.max(input.currentDay, 1), input.warmupDays);
    }

    const elapsedDays = Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24));
    return Math.min(Math.max(elapsedDays + 1, input.currentDay, 1), input.warmupDays + 1);
  }

  private computeNextWarmAt(
    minDelayMinutes: number,
    maxDelayMinutes: number,
    activeFrom: string,
    activeUntil: string,
    weekendEnabled: boolean
  ) {
    const delayMinutes = minDelayMinutes >= maxDelayMinutes
      ? minDelayMinutes
      : minDelayMinutes + Math.floor(Math.random() * (maxDelayMinutes - minDelayMinutes + 1));

    const candidate = new Date(Date.now() + delayMinutes * 60 * 1000);
    return this.fitIntoActiveWindow(candidate, activeFrom, activeUntil, weekendEnabled).toISOString();
  }

  private computeNextDayStart(activeFrom: string, weekendEnabled: boolean) {
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 1);
    const [hours, minutes] = activeFrom.split(":").map(Number);
    next.setUTCHours(hours, minutes, 0, 0);
    return this.skipWeekendIfNeeded(next, weekendEnabled).toISOString();
  }

  private computeRetryAt(delayMinutes: number) {
    return new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
  }

  private fitIntoActiveWindow(date: Date, activeFrom: string, activeUntil: string, weekendEnabled: boolean) {
    const [fromHours, fromMinutes] = activeFrom.split(":").map(Number);
    const [untilHours, untilMinutes] = activeUntil.split(":").map(Number);
    const candidate = new Date(date);
    const start = new Date(candidate);
    start.setUTCHours(fromHours, fromMinutes, 0, 0);
    const end = new Date(candidate);
    end.setUTCHours(untilHours, untilMinutes, 0, 0);

    if (candidate < start) {
      return this.skipWeekendIfNeeded(start, weekendEnabled);
    }

    if (candidate > end) {
      const nextDay = new Date(start);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      return this.skipWeekendIfNeeded(nextDay, weekendEnabled);
    }

    return this.skipWeekendIfNeeded(candidate, weekendEnabled);
  }

  private skipWeekendIfNeeded(date: Date, weekendEnabled: boolean) {
    if (weekendEnabled) {
      return date;
    }

    const candidate = new Date(date);
    while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }
    return candidate;
  }

  private isSameUtcDay(value: string | null, date: Date) {
    if (!value) {
      return false;
    }

    const candidate = new Date(value);
    if (Number.isNaN(candidate.getTime())) {
      return false;
    }

    return (
      candidate.getUTCFullYear() === date.getUTCFullYear() &&
      candidate.getUTCMonth() === date.getUTCMonth() &&
      candidate.getUTCDate() === date.getUTCDate()
    );
  }

  private async insertLog(
    client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
    input: {
      warmerId: string;
      organizationId: string;
      whatsappAccountId: string;
      eventType: string;
      message: string;
      level?: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    await client.query(
      `
        insert into whatsapp_number_warmer_logs (
          warmer_id,
          organization_id,
          whatsapp_account_id,
          level,
          event_type,
          message,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        input.warmerId,
        input.organizationId,
        input.whatsappAccountId,
        input.level ?? "info",
        input.eventType,
        input.message,
        JSON.stringify(input.metadata ?? {})
      ]
    );
  }

  private async ensureSchema(client: { query: (text: string, values?: unknown[]) => Promise<unknown> }) {
    await client.query(`
      create table if not exists whatsapp_number_warmers (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references organizations(id) on delete cascade,
        whatsapp_account_id uuid not null unique references whatsapp_accounts(id) on delete cascade,
        warmup_days integer not null default 14,
        current_day integer not null default 1,
        daily_target integer not null default 10,
        today_warmed integer not null default 0,
        min_delay_minutes integer not null default 5,
        max_delay_minutes integer not null default 20,
        active_from time not null default '09:00',
        active_until time not null default '18:00',
        weekend_enabled boolean not null default false,
        contact_source text not null default 'known_contacts',
        message_source text not null default 'warmup_templates',
        manual_recipient_numbers text[] not null default '{}'::text[],
        status text not null default 'not_started',
        started_at timestamptz null,
        paused_at timestamptz null,
        completed_at timestamptz null,
        last_warmed_at timestamptz null,
        next_warm_at timestamptz null,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now())
      )
    `);
    await client.query(`
      alter table whatsapp_number_warmers
      add column if not exists manual_recipient_numbers text[] not null default '{}'::text[]
    `);
  }
}
