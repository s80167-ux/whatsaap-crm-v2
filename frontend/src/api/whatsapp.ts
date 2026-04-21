import { apiGet } from "../lib/http";

export async function fetchWhatsAppQr(accountId: string): Promise<string | null> {
  try {
    const res = await apiGet<{ qr: string }>(`/whatsapp/${accountId}/qr`);
    return res.qr;
  } catch (e) {
    return null;
  }
}
