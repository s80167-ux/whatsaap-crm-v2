import type { PoolClient } from "pg";
import { ContactRepository } from "../repositories/contactRepository.js";
import { OrganizationUserRepository } from "../repositories/organizationUserRepository.js";
import { ProjectionService } from "./projectionService.js";
import { normalizePhoneNumber } from "../utils/phone.js";

export class ContactCommandService {
  constructor(
    private readonly contactRepository = new ContactRepository(),
    private readonly organizationUserRepository = new OrganizationUserRepository(),
    private readonly projectionService = new ProjectionService()
  ) {}

  async create(
    client: PoolClient,
    input: {
      organizationId: string;
      displayName: string | null;
      phoneNumber: string | null;
      email?: string | null;
      companyName?: string | null;
      notes?: string | null;
      ownerUserId?: string | null;
    }
  ) {
    const normalizedPhone = normalizePhoneNumber(input.phoneNumber);

    if (input.ownerUserId) {
      await this.assertOwner(client, input.organizationId, input.ownerUserId);
    }

    let contact =
      normalizedPhone &&
      (await this.contactRepository.findByNormalizedPhone(client, input.organizationId, normalizedPhone));

    if (!contact) {
      contact = await this.contactRepository.create(client, {
        organizationId: input.organizationId,
        displayName: input.displayName,
        primaryPhoneE164: input.phoneNumber,
        primaryPhoneNormalized: normalizedPhone,
        email: input.email ?? null,
        companyName: input.companyName ?? null,
        notes: input.notes ?? null
      });
    } else {
      contact = await this.contactRepository.anchor(client, {
        contactId: contact.id,
        displayName: input.displayName,
        primaryPhoneE164: input.phoneNumber,
        primaryPhoneNormalized: normalizedPhone,
        email: input.email ?? null,
        companyName: input.companyName ?? null,
        notes: input.notes ?? null
      });
    }

    if (input.ownerUserId) {
      contact = (await this.contactRepository.assign(client, {
        organizationId: input.organizationId,
        contactId: contact.id,
        organizationUserId: input.ownerUserId
      })) ?? contact;
    }

    await this.projectionService.refreshContact(client, contact.id);

    return contact;
  }

  async update(
    client: PoolClient,
    input: {
      organizationId: string;
      contactId: string;
      displayName?: string | null;
      phoneNumber?: string | null;
      email?: string | null;
      companyName?: string | null;
      notes?: string | null;
      ownerUserId?: string | null;
    }
  ) {
    const existingContact = await this.contactRepository.findById(client, input.organizationId, input.contactId);

    if (!existingContact) {
      throw new Error("Contact not found");
    }

    if (input.ownerUserId) {
      await this.assertOwner(client, input.organizationId, input.ownerUserId);
    }

    let normalizedPhone: string | null | undefined = undefined;

    if (input.phoneNumber !== undefined) {
      normalizedPhone = normalizePhoneNumber(input.phoneNumber);

      if (normalizedPhone) {
        const duplicateContact = await this.contactRepository.findByNormalizedPhone(client, input.organizationId, normalizedPhone);

        if (duplicateContact && duplicateContact.id !== input.contactId) {
          throw new Error("Another contact already uses this phone number");
        }
      }
    }

    let contact =
      (await this.contactRepository.updateProfile(client, {
        organizationId: input.organizationId,
        contactId: input.contactId,
        hasDisplayName: input.displayName !== undefined,
        displayName: input.displayName,
        hasPrimaryPhoneE164: input.phoneNumber !== undefined,
        primaryPhoneE164: input.phoneNumber,
        primaryPhoneNormalized: normalizedPhone
        ,
        hasEmail: input.email !== undefined,
        email: input.email,
        hasCompanyName: input.companyName !== undefined,
        companyName: input.companyName,
        hasNotes: input.notes !== undefined,
        notes: input.notes
      })) ?? existingContact;

    if (input.ownerUserId) {
      contact = (await this.contactRepository.assign(client, {
        organizationId: input.organizationId,
        contactId: input.contactId,
        organizationUserId: input.ownerUserId
      })) ?? contact;
    }

    await this.projectionService.refreshContact(client, contact.id);

    return contact;
  }

  private async assertOwner(client: PoolClient, organizationId: string, organizationUserId: string) {
    const organizationUser = await this.organizationUserRepository.findById(client, organizationUserId);

    if (!organizationUser || organizationUser.organization_id !== organizationId || organizationUser.status !== "active") {
      throw new Error("Organization user not found");
    }
  }
}
