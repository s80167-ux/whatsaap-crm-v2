import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { createSalesOrder, createSalesOrderItem } from "../api/crm";

type SalesStatus = "open" | "closed_won" | "closed_lost";

type CreateSalesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  contactId?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  defaultCustomerName?: string | null;
};

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function CreateSalesModal({
  isOpen,
  onClose,
  onCreated,
  contactId,
  conversationId,
  messageId,
  defaultCustomerName
}: CreateSalesModalProps) {
  const [manualContactId, setManualContactId] = useState(contactId ?? "");
  const [status, setStatus] = useState<SalesStatus>("open");
  const [productType, setProductType] = useState("");
  const [packageName, setPackageName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [currency, setCurrency] = useState("MYR");
  const [premiseAddress, setPremiseAddress] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [coverageStatus, setCoverageStatus] = useState("");
  const [documentStatus, setDocumentStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const resolvedContactId = contactId ?? manualContactId.trim();
  const priceNumber = Number(unitPrice || 0);
  const quantityNumber = Number(quantity || 0);
  const totalAmount = useMemo(() => {
    if (!Number.isFinite(priceNumber) || !Number.isFinite(quantityNumber)) {
      return 0;
    }
    return priceNumber * quantityNumber;
  }, [priceNumber, quantityNumber]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setManualContactId(contactId ?? "");
  }, [contactId]);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, saving]);

  if (!isOpen || !mounted || typeof document === "undefined") {
    return null;
  }

  async function handleSubmit() {
    setError(null);

    if (!resolvedContactId) {
      setError("Please select or enter a contact ID before creating sales.");
      return;
    }

    if (!Number.isFinite(priceNumber) || priceNumber < 0) {
      setError("Unit price must be a valid non-negative number.");
      return;
    }

    if (!Number.isInteger(quantityNumber) || quantityNumber <= 0) {
      setError("Quantity must be a whole number greater than 0.");
      return;
    }

    setSaving(true);
    try {
      const orderResponse = await createSalesOrder({
        contactId: resolvedContactId,
        status,
        totalAmount,
        currency: currency.trim() || "MYR",
        sourceMessageId: messageId ?? null,
        sourceConversationId: conversationId ?? null,
        premiseAddress: emptyToNull(premiseAddress),
        businessType: emptyToNull(businessType),
        contactPerson: emptyToNull(contactPerson),
        emailAddress: emptyToNull(emailAddress),
        expectedCloseDate: emptyToNull(expectedCloseDate),
        coverageStatus: emptyToNull(coverageStatus),
        documentStatus: emptyToNull(documentStatus),
        notes: emptyToNull(notes)
      });
      const order = orderResponse.data;

      await createSalesOrderItem({
        orderId: order.id,
        productType: emptyToNull(productType),
        packageName: emptyToNull(packageName),
        unitPrice: priceNumber,
        quantity: quantityNumber
      });

      onCreated?.();
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create sales order.");
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-sales-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/45 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div className="app-card relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl p-5 shadow-lift">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-soft">Create Sales</p>
            <h2 id="create-sales-modal-title" className="mt-1 text-2xl font-semibold text-text">New sales order</h2>
            {defaultCustomerName ? <p className="mt-1 text-sm text-text-muted">Customer: {defaultCustomerName}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-text-muted transition hover:bg-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {!contactId ? (
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Contact ID</span>
              <input
                value={manualContactId}
                onChange={(event) => setManualContactId(event.target.value)}
                placeholder="Paste contact UUID"
                className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Status</span>
            <select
              aria-label="Sales status"
              value={status}
              onChange={(event) => setStatus(event.target.value as SalesStatus)}
              className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
            >
              <option value="open">Open</option>
              <option value="closed_won">Closed Won</option>
              <option value="closed_lost">Closed Lost</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Currency</span>
            <input
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Product Type</span>
            <input
              value={productType}
              onChange={(event) => setProductType(event.target.value)}
              placeholder="Fixed, Mobile, Solution"
              className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Package Name</span>
            <input
              value={packageName}
              onChange={(event) => setPackageName(event.target.value)}
              placeholder="Unifi Biz 100Mbps"
              className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Unit Price</span>
            <input
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder="111"
              className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Quantity</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              type="number"
              min="1"
              step="1"
              className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
            />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-muted px-4 py-3 text-sm text-text-muted">
          Estimated total: <span className="font-semibold text-text">{currency || "MYR"} {totalAmount.toFixed(2)}</span>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((current) => !current)}
          className="mt-4 text-sm font-semibold text-text underline-offset-4 transition hover:text-primary hover:underline"
        >
          {showAdvanced ? "Hide advanced details" : "Show advanced details"}
        </button>

        {showAdvanced ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Premise Address</span>
              <textarea
                value={premiseAddress}
                onChange={(event) => setPremiseAddress(event.target.value)}
                rows={3}
                className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Business Type</span>
              <input value={businessType} onChange={(event) => setBusinessType(event.target.value)} className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm" />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Contact Person</span>
              <input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm" />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Email</span>
              <input value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} type="email" className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm" />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Expected Close Date</span>
              <input value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} type="date" className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm" />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Coverage Status</span>
              <input value={coverageStatus} onChange={(event) => setCoverageStatus(event.target.value)} placeholder="pending, checked, available" className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm" />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Document Status</span>
              <input value={documentStatus} onChange={(event) => setDocumentStatus(event.target.value)} placeholder="not_started, pending, completed" className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm" />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft">Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="input-base mt-1 w-full rounded-2xl px-4 py-3 text-sm" />
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{error}</p> : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-border bg-card px-5 py-3 text-sm font-semibold text-text-muted transition hover:bg-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Sales"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default CreateSalesModal;
