import { apiGet } from "../lib/http";

export async function fetchWhatsAppQr(accountId: string): Promise<string | null> {
  try {
    const response = await apiGet<{ qr: string | null }>(`/admin/whatsapp-accounts/${accountId}/qr`);
    return response.qr;
  } catch {
    return null;
  }
}
