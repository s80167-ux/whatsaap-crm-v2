import { ConversationRepository } from "../repositories/conversationRepository.js";
import { MessageRepository } from "../repositories/messageRepository.js";
  private readonly conversationRepository = new ConversationRepository();
  private readonly messageRepository = new MessageRepository();
  /**
   * Merge sourceContactId into targetContactId, updating all linked entities and removing the source contact.
   */
  async mergeContacts(
    client: PoolClient,
    organizationId: string,
    sourceContactId: string,
    targetContactId: string
  ): Promise<void> {
    // 1. Update contact_id in contact_identities
    await client.query(
      `
        update contact_identities
        set contact_id = $1
        where organization_id = $2 and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    // 2. Update contact_id in conversations
    await client.query(
      `
        update conversations
        set contact_id = $1
        where organization_id = $2 and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    // 3. Update contact_id in messages
    await client.query(
      `
        update messages
        set contact_id = $1
        where organization_id = $2 and contact_id = $3
      `,
      [targetContactId, organizationId, sourceContactId]
    );

    // TODO: Update other linked tables (e.g., sales leads, statuses) if needed

    // 4. Optionally merge non-conflicting fields (e.g., fill nulls in target from source)
    // Example: If target display_name is null, use source's display_name
    const source = await this.contactRepository.findById(client, organizationId, sourceContactId);
    const target = await this.contactRepository.findById(client, organizationId, targetContactId);
    if (source && target) {
      const displayName = target.display_name || source.display_name;
      const primaryPhoneE164 = target.primary_phone_e164 || source.primary_phone_e164;
      const primaryPhoneNormalized = target.primary_phone_normalized || source.primary_phone_normalized;
      await this.contactRepository.anchor(client, {
        contactId: targetContactId,
        displayName,
        primaryPhoneE164,
        primaryPhoneNormalized
      });
    }

    // 5. Delete or mark the source contact as merged
    await client.query(
      `
        delete from contacts
        where organization_id = $1 and id = $2
      `,
      [organizationId, sourceContactId]
    );
  }
import type { PoolClient } from "pg";
import { ContactIdentityRepository } from "../repositories/contactIdentityRepository.js";
import { ContactRepository } from "../repositories/contactRepository.js";
import type { ContactIdentityRecord, ContactRecord } from "../types/domain.js";
import { normalizePhoneNumber } from "../utils/phone.js";

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
}
