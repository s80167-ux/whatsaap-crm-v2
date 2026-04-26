// PATCHED VERSION (only showing changed part)

export async function fetchContact(contactId: string, organizationId?: string | null) {
  const suffix = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : "";
  const response = await apiGet<any>(`/contacts/${contactId}${suffix}`);

  // 🔥 Handle merged redirect
  if (response.data?.is_merged) {
    return response.data;
  }

  return response.data;
}
