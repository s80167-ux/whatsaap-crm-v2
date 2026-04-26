import { env } from "../config/env.js";

type ConnectorEnvelope<T> = {
  data: T;
};

export class ConnectorClient {
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
      throw new Error(body?.error ?? `Connector request failed with status ${response.status}`);
    }

    const body = (await response.json()) as ConnectorEnvelope<T>;
    return body.data;
  }

  async initializeAccount(accountId: string) {
    return this.request(`/internal/accounts/${accountId}/connect`, {
      method: "POST"
    });
  }

  async reconnectAccount(accountId: string) {
    return this.request(`/internal/accounts/${accountId}/reconnect`, {
      method: "POST"
    });
  }

  async backfillAccount(accountId: string) {
    return this.request<{ accountId: string }>(`/internal/accounts/${accountId}/backfill`, {
      method: "POST"
    });
  }

  async terminateAccount(accountId: string) {
    return this.request(`/internal/accounts/${accountId}/session`, {
      method: "DELETE"
    });
  }

  async sendMessage(input: {
    accountId: string;
    recipientJid: string;
    text?: string | null;
    attachment?: {
      kind: "image" | "video" | "audio" | "document";
      fileName: string;
      mimeType: string;
      dataBase64: string;
    } | null;
  }) {
    return this.request<{ key?: { id?: string } } | Record<string, unknown>>("/internal/messages/send", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }
}
