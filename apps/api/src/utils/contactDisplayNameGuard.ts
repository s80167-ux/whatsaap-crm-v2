import { pool } from "../config/database.js";

type InboxConversationLike = {
  organization_id?: string | null;
  contact_name?: string | null;
  phone_number_normalized?: string | null;
};

type WhatsAppAccountIdentityNameRow = {
  organization_id: string;
  candidate_name: string;
};

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeIdentityValue(value: unknown) {
  return asNonEmptyString(value)?.toLowerCase() ?? "";
}

async function loadBlockedWhatsAppIdentityNames(organizationId: string | null) {
  const result = await pool.query<WhatsAppAccountIdentityNameRow>(
    `
      select distinct
        wa.organization_id::text as organization_id,
        lower(trim(candidate_name)) as candidate_name
      from whatsapp_accounts wa
      cross join lateral unnest(
        array[
          nullif(trim(wa.label), ''),
          nullif(trim(wa.display_name), ''),
          nullif(trim(wa.account_phone_e164), ''),
          nullif(trim(wa.account_phone_normalized), '')
        ]
      ) as candidate_name
      where ($1::uuid is null or wa.organization_id = $1)
        and nullif(trim(candidate_name), '') is not null
    `,
    [organizationId]
  );

  const blockedNamesByOrganization = new Map<string, Set<string>>();

  for (const row of result.rows) {
    const names = blockedNamesByOrganization.get(row.organization_id) ?? new Set<string>();
    names.add(row.candidate_name);
    blockedNamesByOrganization.set(row.organization_id, names);
  }

  return blockedNamesByOrganization;
}

/**
 * Last-line protection for inbox API responses.
 *
 * Historical contact rows may contain the connected WhatsApp account's own
 * label/display name. Never expose that value as the customer name; use the
 * customer's normalized phone number instead.
 */
export async function sanitizeInboxConversationNames<T extends InboxConversationLike>(
  conversations: T[],
  organizationId: string | null
): Promise<T[]> {
  if (conversations.length === 0) {
    return conversations;
  }

  const blockedNamesByOrganization = await loadBlockedWhatsAppIdentityNames(organizationId);

  return conversations.map((conversation) => {
    const conversationOrganizationId =
      asNonEmptyString(conversation.organization_id) ?? organizationId ?? "";
    const blockedNames = blockedNamesByOrganization.get(conversationOrganizationId);
    const normalizedContactName = normalizeIdentityValue(conversation.contact_name);

    if (!normalizedContactName || !blockedNames?.has(normalizedContactName)) {
      return conversation;
    }

    return {
      ...conversation,
      contact_name: asNonEmptyString(conversation.phone_number_normalized) ?? "Unknown"
    } as T;
  });
}
