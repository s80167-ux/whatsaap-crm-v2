import { ContactRepository } from "../repositories/contactRepository.js";
import { AuditLogService } from "./auditLogService.js";
import { withTransaction } from "../config/database.js";
import { ProjectionService } from "./projectionService.js";

function normalizeName(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

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
    let repairPlan: any = null;

    await withTransaction(async (client: any) => {
      const contact = await contactRepository.findById(client, user.organizationId, contactId);
      if (!contact) throw new Error("Contact not found");

      before = { ...contact };

      const sourceNamesResult = await client.query(
        `
          with related_accounts as (
            select ci.whatsapp_account_id
            from contact_identities ci
            where ci.contact_id = $1
              and ci.whatsapp_account_id is not null
            union
            select conv.whatsapp_account_id
            from conversations conv
            where conv.contact_id = $1
              and conv.whatsapp_account_id is not null
            union
            select m.whatsapp_account_id
            from messages m
            where m.contact_id = $1
              and m.whatsapp_account_id is not null
          )
          select distinct nullif(trim(candidate_name), '') as name
          from related_accounts ra
          join whatsapp_accounts wa on wa.id = ra.whatsapp_account_id
          cross join lateral unnest(array[wa.label, wa.display_name]) as candidate_name
          where nullif(trim(candidate_name), '') is not null
        `,
        [contactId]
      );

      const blockedNames = sourceNamesResult.rows
        .map((row: any) => row.name)
        .filter(Boolean);
      const blockedNameSet = new Set(blockedNames.map(normalizeName));
      const currentNameIsBlocked = blockedNameSet.has(normalizeName(contact.display_name));

      const poisonedIdentitiesResult = await client.query(
        `
          select id, profile_name
          from contact_identities
          where contact_id = $1
            and nullif(trim(profile_name), '') is not null
            and lower(trim(profile_name)) = any($2::text[])
        `,
        [contactId, Array.from(blockedNameSet)]
      );

      repairPlan = {
        blockedNames,
        currentNameIsBlocked,
        poisonedIdentityCount: poisonedIdentitiesResult.rowCount ?? 0,
        poisonedIdentities: poisonedIdentitiesResult.rows
      };

      after = { ...contact };

      if (currentNameIsBlocked) {
        after.display_name = null;
      }

      if (!options.dry_run && options.confirm) {
        if ((poisonedIdentitiesResult.rowCount ?? 0) > 0) {
          await client.query(
            `
              update contact_identities
              set profile_name = null,
                  updated_at = timezone('utc', now())
              where contact_id = $1
                and nullif(trim(profile_name), '') is not null
                and lower(trim(profile_name)) = any($2::text[])
            `,
            [contactId, Array.from(blockedNameSet)]
          );
        }

        if (currentNameIsBlocked) {
          await client.query(
            `
              update contacts
              set display_name = null,
                  is_anchor_locked = false,
                  anchored_by_source = null,
                  updated_at = timezone('utc', now())
              where id = $1
                and organization_id = $2
            `,
            [contactId, user.organizationId]
          );
        }

        await projectionService.refreshContact(client, contactId);
      }
    });

    await new AuditLogService().record(user, {
      action: status === "preview" ? "contact.refresh.preview" : "contact.refresh.applied",
      entityType: "contact",
      entityId: contactId,
      metadata: { dry_run: options.dry_run, confirm: options.confirm, before, after, repairPlan }
    });

    return { status, contactId, before, after, repairPlan };
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
        if (override.displayName !== undefined) {
          if (typeof override.displayName === "string" && override.displayName.trim()) {
            await contactRepository.updateProfile(client, {
              organizationId: user.organizationId,
              contactId,
              displayName: override.displayName.trim(),
              primaryPhoneE164: contact.primary_phone_e164,
              primaryPhoneNormalized: contact.primary_phone_normalized
            });
          } else {
            await client.query(
              `
                update contacts
                set display_name = null,
                    is_anchor_locked = true,
                    anchored_by_source = 'manual_blank',
                    anchored_at = timezone('utc', now()),
                    updated_at = timezone('utc', now())
                where id = $1
                  and organization_id = $2
              `,
              [contactId, user.organizationId]
            );
          }
        }

        if (override.clearAvatar) {
          await client.query(
            `
              update contacts
              set primary_avatar_url = null,
                  updated_at = timezone('utc', now())
              where id = $1
                and organization_id = $2
            `,
            [contactId, user.organizationId]
          );
        }

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
