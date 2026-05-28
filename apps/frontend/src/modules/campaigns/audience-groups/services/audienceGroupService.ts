import { fetchContacts } from "../../../../api/crm";
import { apiDelete, apiGet, apiPost } from "../../../../lib/http";
import type { Contact } from "../../../../types/api";
import type {
  AudienceGroup,
  AudienceValidatedContact,
  CreateAudienceGroupInput,
  ImportAudienceGroupInput,
  SaveAudiencePreviewSummary,
  SaveAudienceResult
} from "../types/audienceGroup.types";

type FetchAudienceGroupsOptions = {
  organizationId?: string | null;
  storageStatus?: "active" | "archived" | "deleted_details" | "all";
};

export async function fetchAudienceGroups(input?: string | null | FetchAudienceGroupsOptions) {
  const options: FetchAudienceGroupsOptions =
    typeof input === "object" && input !== null ? input : { organizationId: input };
  const params = new URLSearchParams();

  if (options.organizationId) {
    params.set("organization_id", options.organizationId);
  }

  if (options.storageStatus) {
    params.set("storage_status", options.storageStatus);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
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
      contacts: input.contacts
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

export async function previewSaveAudienceAsCrmContacts(audienceGroupId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<{ data: SaveAudiencePreviewSummary }>(
    `/campaigns/audience-groups/${audienceGroupId}/save-as-crm-contacts/preview${suffix}`
  );
  return response.data;
}

export async function saveAudienceAsCrmContacts(audienceGroupId: string, organizationId?: string | null) {
  const response = await apiPost<{ data: SaveAudienceResult }>(
    `/campaigns/audience-groups/${audienceGroupId}/save-as-crm-contacts`,
    { organizationId: organizationId ?? null }
  );
  return response.data;
}

export async function archiveAudienceGroup(audienceGroupId: string, organizationId?: string | null) {
  const response = await apiPost<{ data: AudienceGroup }>(
    `/campaigns/audience-groups/${audienceGroupId}/archive`,
    { organizationId: organizationId ?? null }
  );
  return response.data;
}

export async function deleteAudienceGroupDetails(audienceGroupId: string, organizationId?: string | null) {
  const response = await apiPost<{ data: AudienceGroup }>(
    `/campaigns/audience-groups/${audienceGroupId}/delete-details`,
    { organizationId: organizationId ?? null }
  );
  return response.data;
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
