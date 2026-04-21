import React, { useEffect, useState } from "react";
import { fetchWhatsAppQr } from "../api/whatsapp";

export function WhatsAppQrDisplay({ accountId }: { accountId: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    async function loadQr() {
      setLoading(true);
      const qrCode = await fetchWhatsAppQr(accountId);
      setQr(qrCode);
      setLoading(false);
    }
    loadQr();
    interval = setInterval(loadQr, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [accountId]);

  if (loading) return <div>Loading QR code...</div>;
  if (!qr) return <div>No QR code available.</div>;

  // Use a QR code rendering library if available, else fallback to text
  return (
    <div className="whatsapp-qr-center">
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=240x240`}
        alt="WhatsApp QR Code"
        width={240}
        height={240}
      />
      <div className="whatsapp-qr-caption">
        Scan this QR code with WhatsApp
      </div>
    </div>
  );
}
