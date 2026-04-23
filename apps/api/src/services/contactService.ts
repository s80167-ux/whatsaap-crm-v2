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
      profileAvatarUrl?: string | null;
    }
  ): Promise<{ contact: ContactRecord; identity: ContactIdentityRecord }> {
    const normalizedPhone = normalizePhoneNumber(input.phoneRaw);
    const primaryPhone = normalizedPhone ?? input.phoneRaw;
    const existingIdentity = await this.identityRepository.findByJid(
      client,
      input.organizationId,
      input.whatsappAccountId,
      input.whatsappJid
    );
    let contact =
      normalizedPhone &&
      (await this.contactRepository.findByNormalizedPhone(client, input.organizationId, normalizedPhone));

    if (!contact && existingIdentity) {
      contact = await this.contactRepository.findById(client, input.organizationId, existingIdentity.contact_id);
    }

    if (!contact) {
      contact = await this.contactRepository.create(client, {
        organizationId: input.organizationId,
        displayName: input.profileName,
        primaryPhoneE164: primaryPhone,
        primaryPhoneNormalized: normalizedPhone,
        primaryAvatarUrl: input.profileAvatarUrl ?? null
      });
    } else {
      contact = await this.contactRepository.anchor(client, {
        contactId: contact.id,
        displayName: input.profileName,
        primaryPhoneE164: primaryPhone,
        primaryPhoneNormalized: normalizedPhone,
        primaryAvatarUrl: input.profileAvatarUrl ?? null
      });
    }

    const identity = await this.identityRepository.upsert(client, {
      organizationId: input.organizationId,
      contactId: contact.id,
      whatsappAccountId: input.whatsappAccountId,
      whatsappJid: input.whatsappJid,
      phoneE164: primaryPhone,
      phoneNormalized: normalizedPhone,
      profileName: input.profileName,
      profileAvatarUrl: input.profileAvatarUrl ?? null
    });

    return { contact, identity };
  }
}
