import { env } from "../config/env.js";

type ConnectorEnvelope<T> = {
  data: T;
};

export type ConnectorIdentityResolution = {
  accountId: string;
  contactId?: string | null;
  resolved: boolean;
  confidenceScore: number;
  normalizedJid?: string | null;
  lid?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  verifiedName?: string | null;
  pushName?: string | null;
  notifyName?: string | null;
  profilePicUrl?: string | null;
  evidence?: Array<{ type: string; weight: number; value?: string | null }>;
  source: string;
};

export class ConnectorIdentityResolverClient {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(new URL(path, env.CONNECTOR_BASE_URL), {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-connector-secret": env.CONNECTOR_INTERNAL_SECRET,
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Connector identity resolver failed with status ${response.status}`);
    }

    const body = (await response.json()) as ConnectorEnvelope<T>;
    return body.data;
  }

  async resolveContactIdentity(input: {
    accountId: string;
    contactId?: string | null;
    jid?: string | null;
    lid?: string | null;
    knownPhone?: string | null;
    displayName?: string | null;
  }) {
    return this.request<ConnectorIdentityResolution>(`/internal/accounts/${input.accountId}/resolve-contact-identity`, {
      method: "POST",
      body: JSON.stringify({
        contactId: input.contactId ?? null,
        jid: input.jid ?? null,
        lid: input.lid ?? null,
        knownPhone: input.knownPhone ?? null,
        displayName: input.displayName ?? null
      })
    });
  }
}
