import { fetchContacts } from "../../../../api/crm";
import { apiDelete, apiGet, apiPost } from "../../../../lib/http";
import type { Contact } from "../../../../types/api";
import type {
  AudienceGroup,
  AudienceValidatedContact,
  CreateAudienceGroupInput,
  ImportAudienceGroupInput
} from "../types/audienceGroup.types";

export async function fetchAudienceGroups(organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: AudienceGroup[] }>(`/campaigns/audience-groups${suffix}`);
  return response.data;
}

export async function createAudienceGroup(input: CreateAudienceGroupInput) {
  const response = await apiPost<{ data: AudienceGroup }>("/campaigns/audience-groups", input);
  return response.data;
}

export async function importAudienceContacts(input: ImportAudienceGroupInput) {
  const response = await apiPost<{ data: AudienceGroup }>(
    `/campaigns/audience-groups/${input.audienceGroupId}/import`,
    {
      organizationId: input.organizationId ?? null,
      contacts: input.contacts,
      addValidNewContactsToCrm: input.addValidNewContactsToCrm
    }
  );
  return response.data;
}

export async function fetchAudienceGroupContacts(audienceGroupId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: AudienceValidatedContact[] }>(
    `/campaigns/audience-groups/${audienceGroupId}/contacts${suffix}`
  );
  return response.data;
}

export async function deleteAudienceGroup(audienceGroupId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  return apiDelete<{ ok: true }>(`/campaigns/audience-groups/${audienceGroupId}${suffix}`);
}

export async function fetchCrmPhoneLookup(organizationId?: string | null) {
  try {
    const contacts = await fetchContacts(undefined, organizationId);
    return new Map(
      contacts
        .filter((contact): contact is Contact & { primary_phone_normalized: string } =>
          Boolean(contact.primary_phone_normalized)
        )
        .map((contact) => [contact.primary_phone_normalized, contact.id])
    );
  } catch {
    return new Map<string, string>();
  }
}
