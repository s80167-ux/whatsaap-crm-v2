import { useEffect, useState } from "react";
import { fetchWhatsAppQr } from "../api/whatsapp";

export function WhatsAppQrDisplay({ accountId }: { accountId: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    async function loadQr() {
      const qrCode = await fetchWhatsAppQr(accountId);

      if (!cancelled) {
        setQr(qrCode);
        setLoading(false);
      }
    }

    void loadQr();
    interval = setInterval(() => {
      void loadQr();
    }, 5000);

    return () => {
      cancelled = true;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [accountId]);

  if (loading) {
    return <div className="text-sm text-text-soft">Loading QR code...</div>;
  }

  if (!qr) {
    return <div className="text-sm text-text-soft">QR code not available yet. Try refresh or reconnect once.</div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-4 text-center">
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}&size=240x240`}
        alt="WhatsApp QR Code"
        width={240}
        height={240}
        className="mx-auto h-60 w-60 rounded-xl border border-border bg-white object-contain"
      />
      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-text-soft">Scan with WhatsApp</p>
    </div>
  );
}
