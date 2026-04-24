import type { PoolClient } from "pg";

export class QuickReplyOutcomeRepository {
  async createForOutboundMessage(
    client: PoolClient,
    input: {
      organizationId: string;
      quickReplyTemplateId: string;
      messageId: string;
      conversationId: string;
      contactId: string;
      whatsappAccountId: string;
      usedByOrganizationUserId?: string | null;
    }
  ) {
    await client.query(
      `
        insert into quick_reply_message_events (
          organization_id,
          quick_reply_template_id,
          message_id,
          conversation_id,
          contact_id,
          whatsapp_account_id,
          used_by_organization_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (message_id)
        do nothing
      `,
      [
        input.organizationId,
        input.quickReplyTemplateId,
        input.messageId,
        input.conversationId,
        input.contactId,
        input.whatsappAccountId,
        input.usedByOrganizationUserId ?? null
      ]
    );
  }

  async markCustomerReplyForConversation(
    client: PoolClient,
    input: {
      organizationId: string;
      conversationId: string;
      responseMessageId: string;
      responseAt: Date;
    }
  ) {
    await client.query(
      `
        update quick_reply_message_events
        set outcome_status = 'customer_replied',
            first_response_message_id = coalesce(first_response_message_id, $3),
            first_response_at = coalesce(first_response_at, $4),
            outcome_updated_at = timezone('utc', now())
        where organization_id = $1
          and conversation_id = $2
          and outcome_status = 'sent'
          and created_at <= $4
      `,
      [
        input.organizationId,
        input.conversationId,
        input.responseMessageId,
        input.responseAt.toISOString()
      ]
    );
  }

  async markLeadCreatedForContact(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      leadId: string;
    }
  ) {
    await client.query(
      `
        update quick_reply_message_events
        set lead_id = coalesce(lead_id, $3),
            outcome_status = case
              when outcome_status in ('order_created', 'order_closed_won', 'order_closed_lost') then outcome_status
              else 'lead_created'
            end,
            outcome_updated_at = timezone('utc', now())
        where organization_id = $1
          and contact_id = $2
          and lead_id is null
      `,
      [input.organizationId, input.contactId, input.leadId]
    );
  }

  async markOrderCreatedForContact(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      salesOrderId: string;
    }
  ) {
    await client.query(
      `
        update quick_reply_message_events
        set sales_order_id = coalesce(sales_order_id, $3),
            outcome_status = case
              when outcome_status in ('order_closed_won', 'order_closed_lost') then outcome_status
              else 'order_created'
            end,
            outcome_updated_at = timezone('utc', now())
        where organization_id = $1
          and contact_id = $2
          and sales_order_id is null
      `,
      [input.organizationId, input.contactId, input.salesOrderId]
    );
  }

  async markOrderClosed(
    client: PoolClient,
    input: {
      organizationId: string;
      salesOrderId: string;
      outcomeStatus: "order_closed_won" | "order_closed_lost";
    }
  ) {
    await client.query(
      `
        update quick_reply_message_events
        set outcome_status = $3,
            outcome_updated_at = timezone('utc', now())
        where organization_id = $1
          and sales_order_id = $2
      `,
      [input.organizationId, input.salesOrderId, input.outcomeStatus]
    );
  }
}
