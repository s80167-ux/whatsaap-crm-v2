import { ContactRepository } from "../repositories/contactRepository.js";
import { AuditLogService } from "./auditLogService.js";
import { withTransaction } from "../config/database.js";
import { ProjectionService } from "./projectionService.js";

export class ContactIdentityRepairService {
  static async refreshContactIdentity(contactId: string, options: { dry_run?: boolean; confirm?: boolean; user?: any }) {
    const user = options.user;
    if (!user || (user.role !== "org_admin" && user.role !== "super_admin")) {
      throw new Error("Insufficient permissions: org_admin or super_admin required");
    }

    if (!options.dry_run && !options.confirm) {
      throw new Error("Write actions require confirm=true");
    }

    const status = options.dry_run ? "preview" : "applied";
    const contactRepository = new ContactRepository();
    const projectionService = new ProjectionService();

    let before: any = null;
    let after: any = null;

    await withTransaction(async (client: any) => {
      const contact = await contactRepository.findById(client, user.organizationId, contactId);
      if (!contact) throw new Error("Contact not found");

      before = { ...contact };
      after = { ...contact };

      if (!options.dry_run && options.confirm) {
        await projectionService.refreshContact(client, contactId);
      }
    });

    await new AuditLogService().record(user, {
      action: status === "preview" ? "contact.refresh.preview" : "contact.refresh.applied",
      entityType: "contact",
      entityId: contactId,
      metadata: { dry_run: options.dry_run, confirm: options.confirm, before, after }
    });

    return { status, contactId, before, after };
  }

  static async applyCanonicalOverride(contactId: string, override: any, options: { dry_run?: boolean; confirm?: boolean; user?: any }) {
    const user = options.user;

    if (!user || (user.role !== "org_admin" && user.role !== "super_admin")) {
      throw new Error("Insufficient permissions: org_admin or super_admin required");
    }

    if (!options.dry_run && !options.confirm) {
      throw new Error("Write actions require confirm=true");
    }

    const status = options.dry_run ? "preview" : "applied";
    const contactRepository = new ContactRepository();
    const projectionService = new ProjectionService();

    let before: any = null;
    let after: any = null;

    await withTransaction(async (client: any) => {
      const contact = await contactRepository.findById(client, user.organizationId, contactId);
      if (!contact) throw new Error("Contact not found");

      before = { ...contact };
      after = { ...contact };

      if (override.displayName !== undefined) after.display_name = override.displayName;
      if (override.clearAvatar) after.primary_avatar_url = null;

      if (!options.dry_run && options.confirm) {
        await contactRepository.updateProfile(client, {
          organizationId: user.organizationId,
          contactId,
          displayName: override.displayName,
          primaryPhoneE164: contact.primary_phone_e164,
          primaryPhoneNormalized: contact.primary_phone_normalized
        });

        await projectionService.refreshContact(client, contactId);
      }
    });

    await new AuditLogService().record(user, {
      action: status === "preview" ? "contact.canonical_override.preview" : "contact.canonical_override.applied",
      entityType: "contact",
      entityId: contactId,
      metadata: { override, dry_run: options.dry_run, confirm: options.confirm, before, after }
    });

    return { status, contactId, before, after };
  }
}
