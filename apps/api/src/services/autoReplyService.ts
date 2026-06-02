import { pool, withTransaction } from "../config/database.js";
import { logger } from "../config/logger.js";
import { AppError } from "../lib/errors.js";
import type { AuthUser } from "../types/auth.js";
import type { PoolClient } from "pg";
import { SendMessageService } from "./sendMessageService.js";

type AutoReplyTriggerType = "outside_hours" | "no_reply" | "first_message";

export interface AutoReplySettings {
  organization_id: string;
  is_enabled: boolean;
  quick_reply_template_id: string | null;
  timezone: string;
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  business_days: number[];
  outside_hours_enabled: boolean;
  no_reply_enabled: boolean;
  no_reply_delay_minutes: number;
  first_message_enabled: boolean;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

interface QuickReplyTemplateForAutoReply {
  id: string;
  title: string;
  body: string;
  variable_definitions: Array<{
    key: string;
    default_value?: string | null;
    required: boolean;
  }>;
}

export class AutoReplyService {
  constructor(private readonly sendMessageService = new SendMessageService()) {}

  private getOrganizationId(authUser: AuthUser, requestedOrganizationId?: string | null) {
    if (authUser.role === "super_admin") {
      const organizationId = requestedOrganizationId ?? authUser.organizationId;

      if (!organizationId) {
        throw new AppError("organization_id is required", 400, "organization_required");
      }

      return organizationId;
    }

    if (!authUser.organizationId) {
      throw new AppError("organization_id is required", 400, "organization_required");
    }

    if (requestedOrganizationId && requestedOrganizationId !== authUser.organizationId) {
      throw new AppError("Organization scope mismatch", 403, "organization_scope_mismatch");
    }

    return authUser.organizationId;
  }

  async getSettings(authUser: AuthUser, input?: { organizationId?: string | null }) {
    const organizationId = this.getOrganizationId(authUser, input?.organizationId);
    const client = await pool.connect();

    try {
      return this.getOrCreateSettings(client, organizationId);
    } finally {
      client.release();
    }
  }

  async updateSettings(authUser: AuthUser, input: {
    organizationId?: string | null;
    isEnabled: boolean;
    quickReplyTemplateId?: string | null;
    timezone: string;
    businessHoursEnabled: boolean;
    businessHoursStart: string;
    businessHoursEnd: string;
    businessDays: number[];
    outsideHoursEnabled: boolean;
    noReplyEnabled: boolean;
    noReplyDelayMinutes: number;
    firstMessageEnabled: boolean;
    cooldownMinutes: number;
  }) {
    const organizationId = this.getOrganizationId(authUser, input.organizationId);

    return withTransaction(async (client) => {
      if (input.quickReplyTemplateId) {
        const templateResult = await client.query(
          `
            select id
            from quick_reply_templates
            where organization_id = $1
              and id = $2
              and is_active = true
            limit 1
          `,
          [organizationId, input.quickReplyTemplateId]
        );

        if (!templateResult.rows[0]) {
          throw new AppError("Active quick reply template not found", 404, "quick_reply_not_found");
        }
      }

      const result = await client.query<AutoReplySettings>(
        `
          insert into auto_reply_settings (
            organization_id,
            is_enabled,
            quick_reply_template_id,
            timezone,
            business_hours_enabled,
            business_hours_start,
            business_hours_end,
            business_days,
            outside_hours_enabled,
            no_reply_enabled,
            no_reply_delay_minutes,
            first_message_enabled,
            cooldown_minutes
          )
          values ($1, $2, $3, $4, $5, $6::time, $7::time, $8::int[], $9, $10, $11, $12, $13)
          on conflict (organization_id)
          do update set
            is_enabled = excluded.is_enabled,
            quick_reply_template_id = excluded.quick_reply_template_id,
            timezone = excluded.timezone,
            business_hours_enabled = excluded.business_hours_enabled,
            business_hours_start = excluded.business_hours_start,
            business_hours_end = excluded.business_hours_end,
            business_days = excluded.business_days,
            outside_hours_enabled = excluded.outside_hours_enabled,
            no_reply_enabled = excluded.no_reply_enabled,
            no_reply_delay_minutes = excluded.no_reply_delay_minutes,
            first_message_enabled = excluded.first_message_enabled,
            cooldown_minutes = excluded.cooldown_minutes
          returning *
        `,
        [
          organizationId,
          input.isEnabled,
          input.quickReplyTemplateId ?? null,
          input.timezone,
          input.businessHoursEnabled,
          input.businessHoursStart,
          input.businessHoursEnd,
          input.businessDays,
          input.outsideHoursEnabled,
          input.noReplyEnabled,
          input.noReplyDelayMinutes,
          input.firstMessageEnabled,
          input.cooldownMinutes
        ]
      );

      return result.rows[0];
    });
  }

  async evaluateInboundMessage(input: {
    organizationId: string;
    whatsappAccountId: string;
    conversationId: string;
    contactId: string;
    inboundMessageId: string;
    inboundSentAt: Date;
  }) {
    try {
      const client = await pool.connect();
      let settings: AutoReplySettings | null = null;
      let template: QuickReplyTemplateForAutoReply | null = null;
      let contact: { display_name: string | null; primary_phone_normalized: string | null; primary_phone_e164: string | null } | null = null;
      let isFirstCustomerMessage = false;
      let isCoolingDown = false;

      try {
        settings = await this.findSettings(client, input.organizationId);

        if (!settings?.is_enabled || !settings.quick_reply_template_id) {
          return;
        }

        const templateResult = await client.query<QuickReplyTemplateForAutoReply>(
          `
            select id, title, body, variable_definitions
            from quick_reply_templates
            where organization_id = $1
              and id = $2
              and is_active = true
            limit 1
          `,
          [input.organizationId, settings.quick_reply_template_id]
        );
        template = templateResult.rows[0] ?? null;

        if (!template) {
          return;
        }

        const contactResult = await client.query<{
          display_name: string | null;
          primary_phone_normalized: string | null;
          primary_phone_e164: string | null;
        }>(
          `
            select display_name, primary_phone_normalized, primary_phone_e164
            from contacts
            where organization_id = $1
              and id = $2
            limit 1
          `,
          [input.organizationId, input.contactId]
        );
        contact = contactResult.rows[0] ?? null;

        const firstMessageResult = await client.query<{ message_count: number }>(
          `
            select count(*)::int as message_count
            from messages
            where organization_id = $1
              and conversation_id = $2
              and direction = 'incoming'
              and is_deleted = false
          `,
          [input.organizationId, input.conversationId]
        );
        isFirstCustomerMessage = (firstMessageResult.rows[0]?.message_count ?? 0) <= 1;

        const cooldownResult = await client.query<{ id: string }>(
          `
            select id
            from auto_reply_events
            where organization_id = $1
              and conversation_id = $2
              and status in ('queued', 'sent')
              and (
                $3::int = 0
                or created_at >= timezone('utc', now()) - ($3::int * interval '1 minute')
              )
            limit 1
          `,
          [input.organizationId, input.conversationId, settings.cooldown_minutes]
        );
        isCoolingDown = Boolean(cooldownResult.rows[0]);
      } finally {
        client.release();
      }

      if (!settings || !template || isCoolingDown) {
        return;
      }

      const renderedText = renderTemplateBody(template, contact);
      const outsideBusinessHours =
        settings.outside_hours_enabled &&
        settings.business_hours_enabled &&
        !isWithinBusinessHours(input.inboundSentAt, settings);

      if (outsideBusinessHours) {
        await this.sendAutoReply(input, settings, template, renderedText, "outside_hours", null);
        return;
      }

      if (settings.first_message_enabled && isFirstCustomerMessage) {
        await this.sendAutoReply(input, settings, template, renderedText, "first_message", null);
        return;
      }

      if (settings.no_reply_enabled) {
        const scheduledFor = new Date(input.inboundSentAt.getTime() + settings.no_reply_delay_minutes * 60_000);
        await this.sendAutoReply(input, settings, template, renderedText, "no_reply", scheduledFor);
      }
    } catch (error) {
      logger.error({ err: error, conversationId: input.conversationId }, "Failed to evaluate auto reply");
    }
  }

  private async sendAutoReply(
    input: {
      organizationId: string;
      whatsappAccountId: string;
      conversationId: string;
      contactId: string;
      inboundMessageId: string;
      inboundSentAt: Date;
    },
    settings: AutoReplySettings,
    template: QuickReplyTemplateForAutoReply,
    text: string,
    triggerType: AutoReplyTriggerType,
    scheduledFor: Date | null
  ) {
    const message = await this.sendMessageService.send(
      {
        organizationId: input.organizationId,
        whatsappAccountId: input.whatsappAccountId,
        conversationId: input.conversationId,
        quickReplyTemplateId: template.id,
        text,
        outboxAvailableAt: scheduledFor?.toISOString() ?? null,
        autoReplyContext: {
          triggerType,
          inboundMessageId: input.inboundMessageId,
          skipIfOutgoingAfter: input.inboundSentAt.toISOString()
        }
      },
      { waitForDispatch: false }
    );

    await withTransaction(async (client) => {
      await client.query(
        `
          insert into auto_reply_events (
            organization_id,
            conversation_id,
            contact_id,
            whatsapp_account_id,
            inbound_message_id,
            outbound_message_id,
            quick_reply_template_id,
            trigger_type,
            status,
            scheduled_for,
            metadata
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, $10::jsonb)
          on conflict (organization_id, inbound_message_id, trigger_type)
          do nothing
        `,
        [
          input.organizationId,
          input.conversationId,
          input.contactId,
          input.whatsappAccountId,
          input.inboundMessageId,
          message.id,
          template.id,
          triggerType,
          scheduledFor?.toISOString() ?? null,
          JSON.stringify({
            template_title: template.title,
            timezone: settings.timezone
          })
        ]
      );
    });
  }

  private async getOrCreateSettings(client: Pick<PoolClient, "query">, organizationId: string) {
    const existing = await this.findSettings(client, organizationId);

    if (existing) {
      return existing;
    }

    const result = await client.query<AutoReplySettings>(
      `
        insert into auto_reply_settings (organization_id)
        values ($1)
        on conflict (organization_id)
        do update set organization_id = excluded.organization_id
        returning *
      `,
      [organizationId]
    );

    return result.rows[0];
  }

  private async findSettings(client: Pick<PoolClient, "query">, organizationId: string) {
    const result = await client.query<AutoReplySettings>(
      `
        select *
        from auto_reply_settings
        where organization_id = $1
        limit 1
      `,
      [organizationId]
    );

    return result.rows[0] ?? null;
  }
}

function renderTemplateBody(
  template: QuickReplyTemplateForAutoReply,
  contact: { display_name: string | null; primary_phone_normalized: string | null; primary_phone_e164: string | null } | null
) {
  const values = new Map<string, string>();
  values.set("contact_name", contact?.display_name ?? "");
  values.set("phone_number", contact?.primary_phone_normalized ?? contact?.primary_phone_e164 ?? "");

  for (const definition of template.variable_definitions ?? []) {
    values.set(definition.key, definition.default_value ?? values.get(definition.key) ?? "");
  }

  return template.body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values.get(key) ?? "");
}

function isWithinBusinessHours(date: Date, settings: AutoReplySettings) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: settings.timezone || "Asia/Kuala_Lumpur",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const weekdayText = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const day = weekdayToNumber(weekdayText);

  if (!settings.business_days.includes(day)) {
    return false;
  }

  const currentMinutes = hour * 60 + minute;
  const startMinutes = parseTimeToMinutes(settings.business_hours_start);
  const endMinutes = parseTimeToMinutes(settings.business_hours_end);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function parseTimeToMinutes(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function weekdayToNumber(value: string) {
  switch (value.slice(0, 3).toLowerCase()) {
    case "sun":
      return 0;
    case "mon":
      return 1;
    case "tue":
      return 2;
    case "wed":
      return 3;
    case "thu":
      return 4;
    case "fri":
      return 5;
    case "sat":
      return 6;
    default:
      return 1;
  }
}
