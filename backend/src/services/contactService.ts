import type { PoolClient } from "pg";
import { ContactIdentityRepository } from "../repositories/contactIdentityRepository.js";
import { ContactRepository } from "../repositories/contactRepository.js";
import type { ContactIdentityRecord, ContactRecord } from "../types/domain.js";
import { normalizePhoneNumber } from "../utils/phone.js";

export type ContactMergeSummary = {
  source_contact_id: string;
  target_contact_id: string;
  moved_identities_count: number;
  moved_owners_count: number;
  moved_conversations_count: number;
  moved_messages_count: number;
  moved_leads_count: number;
  moved_sales_count: number;
  moved_activities_count: number;
};

export type MergedContactRedirect = {
  is_merged: true;
  redirect_to_contact_id: string;
  redirect_to_conversation_id: string | null;
};

export class ContactService {
  constructor(
    private readonly contactRepository = new ContactRepository(),
    private readonly identityRepository = new ContactIdentityRepository()
  ) {}

  async findOrCreateCanonicalContact(
    client: PoolClient,
    input: {
      organizationId: string;
      whatsappAccountId: string;
      whatsappJid: string;
      phoneRaw: string | null;
      profileName: string | null;
    }
  ): Promise<{ contact: ContactRecord; identity: ContactIdentityRecord }> {
    const normalizedPhone = normalizePhoneNumber(input.phoneRaw);
    let contact =
      normalizedPhone &&
      (await this.contactRepository.findByNormalizedPhone(client, input.organizationId, normalizedPhone));

    if (!contact) {
      contact = await this.contactRepository.create(client, {
        organizationId: input.organizationId,
        displayName: input.profileName,
        primaryPhoneE164: input.phoneRaw,
        primaryPhoneNormalized: normalizedPhone
      });
    } else {
      contact = await this.contactRepository.anchor(client, {
        contactId: contact.id,
        displayName: input.profileName,
        primaryPhoneE164: input.phoneRaw,
        primaryPhoneNormalized: normalizedPhone
      });
    }

    const identity = await this.identityRepository.upsert(client, {
      organizationId: input.organizationId,
      contactId: contact.id,
      whatsappAccountId: input.whatsappAccountId,
      whatsappJid: input.whatsappJid,
      phoneE164: input.phoneRaw,
      phoneNormalized: normalizedPhone,
      profileName: input.profileName
    });

    return { contact, identity };
  }

  async getMergedRedirect(
    client: PoolClient,
    organizationId: string,
    contactId: string
  ): Promise<MergedContactRedirect | null> {
    const result = await client.query<{
      merged_into_contact_id: string | null;
      redirect_to_conversation_id: string | null;
    }>(
      `
        select
          c.merged_into_contact_id,
          (
            select conv.id
            from conversations conv
            where conv.organization_id = c.organization_id
              and conv.contact_id = c.merged_into_contact_id
            order by conv.last_message_at desc nulls last, conv.updated_at desc nulls last, conv.created_at desc
            limit 1
          ) as redirect_to_conversation_id
        from contacts c
        where c.organization_id = $1
          and c.id = $2
          and c.status = 'merged'
          and c.merged_into_contact_id is not null
        limit 1
      `,
      [organizationId, contactId]
    );

    const row = result.rows[0];

    if (!row?.merged_into_contact_id) {
      return null;
    }

    return {
      is_merged: true,
      redirect_to_contact_id: row.merged_into_contact_id,
      redirect_to_conversation_id: row.redirect_to_conversation_id ?? null
    };
  }

  async mergeContacts(
    client: PoolClient,
    organizationId: string,
    sourceContactId: string,
    targetContactId: string,
    actorOrganizationUserId?: string | null
  ): Promise<ContactMergeSummary> {
    if (sourceContactId === targetContactId) {
      throw new Error("Source and target contacts must be different.");
    }

    const source = await this.contactRepository.findById(client, organizationId, sourceContactId);
    const target = await this.contactRepository.findById(client, organizationId, targetContactId);

    if (!source || !target) {
      throw new Error("Source or target contact was not found.");
    }

    const identityResult = await client.query(
      `
        update contact_identities
        set contact_id = $1,
            updated_at = timezone('utc', now())
        where organization_id = $2
          and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    const ownerResult = await client.query(
      `
        update contact_owners
        set contact_id = $1,
            updated_at = timezone('utc', now())
        where organization_id = $2
          and contact_id = $3
          and not exists (
            select 1
            from contact_owners existing
            where existing.organization_id = contact_owners.organization_id
              and existing.contact_id = $1
              and existing.organization_user_id = contact_owners.organization_user_id
          )
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    await client.query(
      `
        delete from contact_owners
        where organization_id = $1
          and contact_id = $2
      `,
      [organizationId, sourceContactId]
    );

    const conversationResult = await client.query(
      `
        update conversations
        set contact_id = $1,
            updated_at = timezone('utc', now())
        where organization_id = $2
          and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    const messageResult = await client.query(
      `
        update messages
        set contact_id = $1
        where organization_id = $2
          and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    const leadResult = await client.query(
      `
        update leads
        set contact_id = $1,
            updated_at = timezone('utc', now())
        where organization_id = $2
          and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    const salesResult = await client.query(
      `
        update sales_orders
        set contact_id = $1,
            updated_at = timezone('utc', now())
        where organization_id = $2
          and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    const activityResult = await client.query(
      `
        update activities
        set contact_id = $1,
            updated_at = timezone('utc', now())
        where organization_id = $2
          and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    await this.contactRepository.anchor(client, {
      contactId: targetContactId,
      displayName: target.display_name || source.display_name,
      primaryPhoneE164: target.primary_phone_e164 || source.primary_phone_e164,
      primaryPhoneNormalized: target.primary_phone_normalized || source.primary_phone_normalized
    });

    await client.query(
      `
        update contacts
        set status = 'merged',
            merged_into_contact_id = $3,
            merged_at = timezone('utc', now()),
            updated_at = timezone('utc', now())
        where organization_id = $1
          and id = $2
      `,
      [organizationId, sourceContactId, targetContactId]
    );

    await client.query(
      `
        insert into contact_merge_history (
          organization_id,
          source_contact_id,
          target_contact_id,
          actor_organization_user_id,
          metadata
        )
        values ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        organizationId,
        sourceContactId,
        targetContactId,
        actorOrganizationUserId ?? null,
        JSON.stringify({
          moved_identities_count: identityResult.rowCount ?? 0,
          moved_owners_count: ownerResult.rowCount ?? 0,
          moved_conversations_count: conversationResult.rowCount ?? 0,
          moved_messages_count: messageResult.rowCount ?? 0,
          moved_leads_count: leadResult.rowCount ?? 0,
          moved_sales_count: salesResult.rowCount ?? 0,
          moved_activities_count: activityResult.rowCount ?? 0
        })
      ]
    );

    return {
      source_contact_id: sourceContactId,
      target_contact_id: targetContactId,
      moved_identities_count: identityResult.rowCount ?? 0,
      moved_owners_count: ownerResult.rowCount ?? 0,
      moved_conversations_count: conversationResult.rowCount ?? 0,
      moved_messages_count: messageResult.rowCount ?? 0,
      moved_leads_count: leadResult.rowCount ?? 0,
      moved_sales_count: salesResult.rowCount ?? 0,
      moved_activities_count: activityResult.rowCount ?? 0
    };
  }
}
