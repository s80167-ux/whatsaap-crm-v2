import type { PoolClient } from "pg";
import { ContactIdentityRepository } from "../repositories/contactIdentityRepository.js";
import { ContactRepository } from "../repositories/contactRepository.js";
import type { ContactIdentityRecord, ContactRecord } from "../types/domain.js";
import {
  sanitizeWhatsAppDisplayName,
  scoreContactIdentity
} from "../utils/contactIdentity.js";
import { getWhatsAppJidType, jidToPhone, normalizePhoneNumber, normalizeWhatsAppJid } from "../utils/phone.js";

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
      profilePushName?: string | null;
      profileAvatarUrl?: string | null;
    }
  ): Promise<{ contact: ContactRecord; identity: ContactIdentityRecord }> {
    const whatsappJid = normalizeWhatsAppJid(input.whatsappJid) ?? input.whatsappJid;
    const jidType = getWhatsAppJidType(whatsappJid);
    const normalizedPhone = normalizePhoneNumber(input.phoneRaw) ?? jidToPhone(whatsappJid);
    const primaryPhone = normalizedPhone ?? input.phoneRaw;
    const blockedNames = await this.findBlockedWhatsAppAccountNames(client, input.whatsappAccountId);
    const bestProfileName =
      sanitizeWhatsAppDisplayName(input.profileName, blockedNames) ??
      sanitizeWhatsAppDisplayName(input.profilePushName, blockedNames);
    const scoredIdentity = scoreContactIdentity({
      normalizedPhone,
      displayName: bestProfileName,
      profileAvatarUrl: input.profileAvatarUrl ?? null,
      jidType
    });
    const existingIdentity = await this.identityRepository.findByJid(
      client,
      input.organizationId,
      input.whatsappAccountId,
      whatsappJid
    );
    const existingPhoneIdentity =
      normalizedPhone
        ? await this.identityRepository.findByNormalizedPhone(
            client,
            input.organizationId,
            input.whatsappAccountId,
            normalizedPhone
          )
        : null;
    const existingPhoneContact = normalizedPhone
      ? await this.contactRepository.findByNormalizedPhone(client, input.organizationId, normalizedPhone)
      : null;
    let contact: ContactRecord | null = null;

    if (existingIdentity) {
      contact = await this.contactRepository.findById(client, input.organizationId, existingIdentity.contact_id);
    }

    if (!contact && existingPhoneIdentity) {
      contact = await this.contactRepository.findById(client, input.organizationId, existingPhoneIdentity.contact_id);
    }

    if (!existingIdentity && existingPhoneContact && (!contact || contact.id !== existingPhoneContact.id)) {
      contact = existingPhoneContact;
    }

    if (!contact) {
      contact = await this.contactRepository.create(client, {
        organizationId: input.organizationId,
        displayName: bestProfileName,
        primaryPhoneE164: primaryPhone,
        primaryPhoneNormalized: normalizedPhone,
        primaryAvatarUrl: input.profileAvatarUrl ?? null,
        identityStatus: scoredIdentity.contactStatus
      });
    } else {
      contact = await this.contactRepository.anchor(client, {
        contactId: contact.id,
        displayName: bestProfileName,
        primaryPhoneE164: primaryPhone,
        primaryPhoneNormalized: normalizedPhone,
        primaryAvatarUrl: input.profileAvatarUrl ?? null,
        identityStatus: scoredIdentity.contactStatus
      });
    }

    const identity = await this.identityRepository.upsert(client, {
      organizationId: input.organizationId,
      contactId: contact.id,
      whatsappAccountId: input.whatsappAccountId,
      whatsappJid,
      phoneE164: primaryPhone,
      phoneNormalized: normalizedPhone,
      profileName: bestProfileName,
      profilePushName: sanitizeWhatsAppDisplayName(input.profilePushName, blockedNames),
      profileAvatarUrl: input.profileAvatarUrl ?? null,
      identityQuality: scoredIdentity.identityQuality,
      identityScore: scoredIdentity.score
    });

    if (identity.contact_id !== contact.id) {
      const canonicalContact = await this.contactRepository.findById(client, input.organizationId, identity.contact_id);

      if (canonicalContact) {
        contact = canonicalContact;
      }
    }

    return { contact, identity };
  }

  private async findBlockedWhatsAppAccountNames(client: PoolClient, whatsappAccountId: string) {
    const result = await client.query<{ label: string | null; display_name: string | null }>(
      `
        select label, display_name
        from whatsapp_accounts
        where id = $1
        limit 1
      `,
      [whatsappAccountId]
    );

    const account = result.rows[0];
    return [account?.label ?? null, account?.display_name ?? null];
  }
}
