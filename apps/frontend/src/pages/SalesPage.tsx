import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { convertLeadToOrder, createLead, createSalesOrder, createSalesOrderItem, updateSalesOrder } from "../api/crm";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { useContacts } from "../hooks/useContacts";
import { useLeads } from "../hooks/useLeads";
import { useSalesOrderDetail, useSalesOrders, useSalesSummary } from "../hooks/useSales";
import { getStoredUser } from "../lib/auth";

const SALES_STATUSES = [
  { value: "open", label: "Open" },
  { value: "closed_won", label: "Closed won" },
  { value: "closed_lost", label: "Closed lost" }
] as const;

const LEAD_STATUSES = [
  { value: "new_lead", label: "New lead" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "processing", label: "Processing" },
  { value: "closed_won", label: "Closed won" },
  { value: "closed_lost", label: "Closed lost" }
] as const;

const LEAD_TEMPERATURES = [
  { value: "cold", label: "Cold" },
  { value: "warm", label: "Warm" },
  { value: "hot", label: "Hot" }
] as const;

export function SalesPage() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const { data: orders = [], isLoading: ordersLoading } = useSalesOrders();
  const { data: summary } = useSalesSummary();
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const { data: selectedOrderDetail, isLoading: detailLoading } = useSalesOrderDetail(selectedOrderId ?? undefined);
  const { data: contacts = [] } = useContacts();
  const [selectedContactId, setSelectedContactId] = useState("");
  const [status, setStatus] = useState<(typeof SALES_STATUSES)[number]["value"]>("open");
  const [totalAmount, setTotalAmount] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemProductType, setItemProductType] = useState("");
  const [itemPackageName, setItemPackageName] = useState("");
  const [itemUnitPrice, setItemUnitPrice] = useState("");
  const [itemQuantity, setItemQuantity] = useState("1");
  const [itemNotice, setItemNotice] = useState<string | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [leadContactId, setLeadContactId] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadStatus, setLeadStatus] = useState<(typeof LEAD_STATUSES)[number]["value"]>("new_lead");
  const [leadTemperature, setLeadTemperature] = useState<(typeof LEAD_TEMPERATURES)[number]["value"]>("warm");
  const [leadNotice, setLeadNotice] = useState<string | null>(null);
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [convertAmountByLeadId, setConvertAmountByLeadId] = useState<Record<string, string>>({});
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  const canWriteSales = Boolean(currentUser?.permissionKeys.includes("sales.write"));

  const sortedContacts = useMemo(
    () =>
      [...contacts].sort((left, right) =>
        (left.display_name ?? left.primary_phone_normalized ?? "").localeCompare(
          right.display_name ?? right.primary_phone_normalized ?? ""
        )
      ),
    [contacts]
  );

  async function handleCreateOrder() {
    const parsedAmount = Number(totalAmount);

    if (!selectedContactId || !Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setNotice("Choose a contact and enter a valid amount before creating a sales order.");
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    try {
      await createSalesOrder({
        contactId: selectedContactId,
        status,
        totalAmount: parsedAmount,
        currency,
        assignedUserId: currentUser?.organizationUserId ?? null
      });

      setSelectedContactId("");
      setStatus("open");
      setTotalAmount("");
      setCurrency("MYR");
      setNotice("Sales order created. The table and summary have been refreshed.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["sales-summary"] })
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create sales order");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <Card elevated>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Sales</p>
        <h2 className="mt-3 section-title">Pipeline workspace</h2>
        <p className="mt-2 max-w-3xl section-copy">
          Sales orders are now role-scoped and live. Assigned-scope users see their own records, while admins and managers can monitor the wider revenue queue.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total orders" value={String(summary?.total_orders ?? 0)} tone="text-text" />
        <MetricCard label="Open orders" value={String(summary?.open_orders ?? 0)} tone="text-amber-700" />
        <MetricCard label="Won orders" value={String(summary?.won_orders ?? 0)} tone="text-emerald-700" />
        <MetricCard label="Won value" value={formatCurrency(summary?.won_value ?? "0")} tone="text-primary" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px,minmax(0,1fr)]">
        <Card elevated>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Quick Create</p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Contact</span>
              <select
                value={selectedContactId}
                onChange={(event) => setSelectedContactId(event.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                disabled={!canWriteSales || isSubmitting}
              >
                <option value="">Select contact</option>
                {sortedContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.display_name ?? contact.primary_phone_normalized ?? contact.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as (typeof SALES_STATUSES)[number]["value"])}
                className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                disabled={!canWriteSales || isSubmitting}
              >
                {SALES_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr),110px]">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text">Amount</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                  placeholder="0.00"
                  disabled={!canWriteSales || isSubmitting}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text">Currency</span>
                <Input
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                  placeholder="MYR"
                  maxLength={8}
                  disabled={!canWriteSales || isSubmitting}
                />
              </label>
            </div>

            {notice ? <p className="text-sm leading-6 text-text-muted">{notice}</p> : null}

            <Button onClick={handleCreateOrder} disabled={!canWriteSales || isSubmitting} className="w-full">
              {isSubmitting ? "Creating..." : "Create sales order"}
            </Button>

            {!canWriteSales ? (
              <p className="rounded-xl border border-border bg-background-tint px-4 py-3 text-sm leading-6 text-text-muted">
                Your role can view assigned sales but cannot create or update them.
              </p>
            ) : null}
          </div>
        </Card>

        <Card elevated>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Orders</p>
              <h3 className="mt-2 text-lg font-semibold text-text">Live sales orders</h3>
            </div>
            <p className="text-sm text-text-muted">{orders.length} records</p>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white/80">
            <table className="min-w-full bg-white/80">
              <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
                <tr>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Owner</th>
                  <th className="px-5 py-4">Updated</th>
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={5}>
                      Loading sales orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={5}>
                      No sales orders yet. Create the first one from the form on the left.
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr
                      key={order.id}
                      className={`cursor-pointer border-t border-border/80 text-sm text-text-muted transition hover:bg-background-tint/40 ${
                        selectedOrderId === order.id ? "bg-background-tint/50" : ""
                      }`}
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-text">{order.contact_name ?? "Unknown"}</p>
                        <p className="mt-1 text-xs text-text-soft">{order.primary_phone_normalized ?? "--"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSalesStatusTone(order.status)}`}>
                          {formatSalesStatus(order.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-medium text-text">
                        {formatCurrency(order.total_amount, order.currency)}
                      </td>
                      <td className="px-5 py-4">
                        {order.assigned_user_id === currentUser?.organizationUserId
                          ? "Assigned to you"
                          : order.assigned_user_id ?? "Unassigned"}
                      </td>
                      <td className="px-5 py-4">{new Date(order.updated_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px,minmax(0,1fr)]">
        <Card elevated>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Lead Intake</p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Contact</span>
              <select
                value={leadContactId}
                onChange={(event) => setLeadContactId(event.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                disabled={!canWriteSales || isCreatingLead}
              >
                <option value="">Select contact</option>
                {sortedContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.display_name ?? contact.primary_phone_normalized ?? contact.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-text">Source</span>
              <Input
                value={leadSource}
                onChange={(event) => setLeadSource(event.target.value)}
                placeholder="WhatsApp inbound, referral, campaign..."
                disabled={!canWriteSales || isCreatingLead}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text">Lead status</span>
                <select
                  value={leadStatus}
                  onChange={(event) => setLeadStatus(event.target.value as (typeof LEAD_STATUSES)[number]["value"])}
                  className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                  disabled={!canWriteSales || isCreatingLead}
                >
                  {LEAD_STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text">Temperature</span>
                <select
                  value={leadTemperature}
                  onChange={(event) => setLeadTemperature(event.target.value as (typeof LEAD_TEMPERATURES)[number]["value"])}
                  className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                  disabled={!canWriteSales || isCreatingLead}
                >
                  {LEAD_TEMPERATURES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {leadNotice ? <p className="text-sm leading-6 text-text-muted">{leadNotice}</p> : null}

            <Button
              onClick={async () => {
                if (!leadContactId) {
                  setLeadNotice("Choose a contact before creating a lead.");
                  return;
                }

                setIsCreatingLead(true);
                setLeadNotice(null);

                try {
                  await createLead({
                    contactId: leadContactId,
                    source: leadSource || null,
                    status: leadStatus,
                    temperature: leadTemperature,
                    assignedUserId: currentUser?.organizationUserId ?? null
                  });

                  setLeadContactId("");
                  setLeadSource("");
                  setLeadStatus("new_lead");
                  setLeadTemperature("warm");
                  setLeadNotice("Lead created and added to the conversion queue.");
                  await queryClient.invalidateQueries({ queryKey: ["leads"] });
                } catch (error) {
                  setLeadNotice(error instanceof Error ? error.message : "Unable to create lead");
                } finally {
                  setIsCreatingLead(false);
                }
              }}
              disabled={!canWriteSales || isCreatingLead}
              className="w-full"
            >
              {isCreatingLead ? "Creating..." : "Create lead"}
            </Button>
          </div>
        </Card>

        <Card elevated>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Leads</p>
              <h3 className="mt-2 text-lg font-semibold text-text">Conversion queue</h3>
            </div>
            <p className="text-sm text-text-muted">{leads.length} leads</p>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-white/80">
            <table className="min-w-full bg-white/80">
              <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
                <tr>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Lead</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Convert</th>
                </tr>
              </thead>
              <tbody>
                {leadsLoading ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={4}>
                      Loading leads...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={4}>
                      No leads yet. Create the first one from the intake form.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id} className="border-t border-border/80 text-sm text-text-muted">
                      <td className="px-5 py-4">
                        <p className="font-medium text-text">{lead.contact_name ?? "Unknown"}</p>
                        <p className="mt-1 text-xs text-text-soft">{lead.primary_phone_normalized ?? "--"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-text">{formatLeadStatus(lead.status)}</p>
                        <p className="mt-1 text-xs text-text-soft">
                          {lead.temperature ? `${formatLeadTemperature(lead.temperature)} • ` : ""}
                          {lead.source ?? "No source"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={convertAmountByLeadId[lead.id] ?? ""}
                          onChange={(event) =>
                            setConvertAmountByLeadId((current) => ({
                              ...current,
                              [lead.id]: event.target.value
                            }))
                          }
                          placeholder="0.00"
                          disabled={!canWriteSales || convertingLeadId === lead.id}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <Button
                          variant="secondary"
                          className="px-3 py-2 text-xs"
                          disabled={!canWriteSales || convertingLeadId === lead.id}
                          onClick={async () => {
                            const totalAmount = Number(convertAmountByLeadId[lead.id] ?? "");

                            if (!Number.isFinite(totalAmount) || totalAmount < 0) {
                              setLeadNotice("Enter a valid conversion amount before creating a sales order from a lead.");
                              return;
                            }

                            setConvertingLeadId(lead.id);
                            setLeadNotice(null);

                            try {
                              await convertLeadToOrder({
                                leadId: lead.id,
                                status: "open",
                                totalAmount,
                                currency: "MYR"
                              });

                              setLeadNotice("Lead converted into an open sales order.");
                              setConvertAmountByLeadId((current) => {
                                const next = { ...current };
                                delete next[lead.id];
                                return next;
                              });
                              await Promise.all([
                                queryClient.invalidateQueries({ queryKey: ["leads"] }),
                                queryClient.invalidateQueries({ queryKey: ["sales-orders"] }),
                                queryClient.invalidateQueries({ queryKey: ["sales-summary"] })
                              ]);
                            } catch (error) {
                              setLeadNotice(error instanceof Error ? error.message : "Unable to convert lead");
                            } finally {
                              setConvertingLeadId(null);
                            }
                          }}
                        >
                          {convertingLeadId === lead.id ? "Converting..." : "Convert"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card elevated>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Order Detail</p>
            <h3 className="mt-2 text-lg font-semibold text-text">
              {selectedOrderDetail?.order.contact_name ?? "Select a sales order"}
            </h3>
          </div>
          {selectedOrderDetail?.order ? (
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSalesStatusTone(selectedOrderDetail.order.status)}`}>
              {formatSalesStatus(selectedOrderDetail.order.status)}
            </span>
          ) : null}
        </div>

        {selectedOrderId ? (
          detailLoading ? (
            <p className="mt-5 text-sm leading-6 text-text-muted">Loading sales order detail...</p>
          ) : selectedOrderDetail ? (
            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr),340px]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
                  <p>Order ID: {selectedOrderDetail.order.id}</p>
                  <p>Total: {formatCurrency(selectedOrderDetail.order.total_amount, selectedOrderDetail.order.currency)}</p>
                  <p>Lead status: {selectedOrderDetail.order.lead_status ?? "--"}</p>
                  <p>Owner: {selectedOrderDetail.order.assigned_user_id ?? "Unassigned"}</p>
                </div>

                <div className="rounded-2xl border border-border bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Order Actions</p>
                      <h4 className="mt-2 text-base font-semibold text-text">Status and ownership</h4>
                    </div>
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      disabled={!canWriteSales || isUpdatingOrder || !currentUser?.organizationUserId}
                      onClick={async () => {
                        setIsUpdatingOrder(true);
                        setOrderNotice(null);

                        try {
                          await updateSalesOrder({
                            orderId: selectedOrderDetail.order.id,
                            assignedUserId: currentUser?.organizationUserId ?? null
                          });

                          setOrderNotice("Sales order assigned to you.");
                          await Promise.all([
                            queryClient.invalidateQueries({ queryKey: ["sales-order", selectedOrderDetail.order.id] }),
                            queryClient.invalidateQueries({ queryKey: ["sales-orders"] })
                          ]);
                        } catch (error) {
                          setOrderNotice(error instanceof Error ? error.message : "Unable to reassign sales order");
                        } finally {
                          setIsUpdatingOrder(false);
                        }
                      }}
                    >
                      Assign to me
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    {SALES_STATUSES.map((option) => (
                      <Button
                        key={option.value}
                        variant={selectedOrderDetail.order.status === option.value ? "primary" : "secondary"}
                        className="w-full"
                        disabled={!canWriteSales || isUpdatingOrder}
                        onClick={async () => {
                          setIsUpdatingOrder(true);
                          setOrderNotice(null);

                          try {
                            await updateSalesOrder({
                              orderId: selectedOrderDetail.order.id,
                              status: option.value
                            });

                            setOrderNotice(`Sales order marked as ${option.label.toLowerCase()}.`);
                            await Promise.all([
                              queryClient.invalidateQueries({ queryKey: ["sales-order", selectedOrderDetail.order.id] }),
                              queryClient.invalidateQueries({ queryKey: ["sales-orders"] }),
                              queryClient.invalidateQueries({ queryKey: ["sales-summary"] }),
                              queryClient.invalidateQueries({ queryKey: ["leads"] })
                            ]);
                          } catch (error) {
                            setOrderNotice(error instanceof Error ? error.message : "Unable to update sales order status");
                          } finally {
                            setIsUpdatingOrder(false);
                          }
                        }}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>

                  <p className="mt-4 text-sm leading-6 text-text-muted">
                    Use the status buttons above to keep the pipeline current. Item-line changes will continue updating the order total automatically.
                  </p>

                  {orderNotice ? <p className="mt-4 text-sm leading-6 text-text-muted">{orderNotice}</p> : null}
                </div>

                <div className="overflow-hidden rounded-2xl border border-border bg-white/80">
                  <table className="min-w-full bg-white/80">
                    <thead className="bg-background-tint text-left text-xs uppercase tracking-[0.2em] text-text-soft">
                      <tr>
                        <th className="px-5 py-4">Item</th>
                        <th className="px-5 py-4">Qty</th>
                        <th className="px-5 py-4">Unit</th>
                        <th className="px-5 py-4">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderDetail.items.length === 0 ? (
                        <tr>
                          <td className="px-5 py-6 text-sm text-text-muted" colSpan={4}>
                            No item lines yet. Add the first one from the panel on the right.
                          </td>
                        </tr>
                      ) : (
                        selectedOrderDetail.items.map((item) => (
                          <tr key={item.id} className="border-t border-border/80 text-sm text-text-muted">
                            <td className="px-5 py-4">
                              <p className="font-medium text-text">{item.package_name ?? item.product_type ?? "Item"}</p>
                              <p className="mt-1 text-xs text-text-soft">{item.product_type ?? "--"}</p>
                            </td>
                            <td className="px-5 py-4">{item.quantity}</td>
                            <td className="px-5 py-4">{formatCurrency(item.unit_price, selectedOrderDetail.order.currency)}</td>
                            <td className="px-5 py-4 font-medium text-text">
                              {formatCurrency(item.total_price, selectedOrderDetail.order.currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-background-tint p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Add Item Line</p>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-text">Product type</span>
                  <Input value={itemProductType} onChange={(event) => setItemProductType(event.target.value)} placeholder="Product" />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-text">Package name</span>
                  <Input value={itemPackageName} onChange={(event) => setItemPackageName(event.target.value)} placeholder="Package name" />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-text">Unit price</span>
                    <Input type="number" min="0" step="0.01" value={itemUnitPrice} onChange={(event) => setItemUnitPrice(event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-text">Quantity</span>
                    <Input type="number" min="1" step="1" value={itemQuantity} onChange={(event) => setItemQuantity(event.target.value)} />
                  </label>
                </div>

                {itemNotice ? <p className="text-sm leading-6 text-text-muted">{itemNotice}</p> : null}

                <Button
                  onClick={async () => {
                    if (!selectedOrderDetail) {
                      return;
                    }

                    const unitPrice = Number(itemUnitPrice);
                    const quantity = Number(itemQuantity);

                    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isInteger(quantity) || quantity <= 0) {
                      setItemNotice("Enter a valid unit price and a positive quantity.");
                      return;
                    }

                    setIsAddingItem(true);
                    setItemNotice(null);

                    try {
                      await createSalesOrderItem({
                        orderId: selectedOrderDetail.order.id,
                        productType: itemProductType || null,
                        packageName: itemPackageName || null,
                        unitPrice,
                        quantity
                      });

                      setItemProductType("");
                      setItemPackageName("");
                      setItemUnitPrice("");
                      setItemQuantity("1");
                      setItemNotice("Item line added and order total refreshed.");
                      await Promise.all([
                        queryClient.invalidateQueries({ queryKey: ["sales-order", selectedOrderDetail.order.id] }),
                        queryClient.invalidateQueries({ queryKey: ["sales-orders"] }),
                        queryClient.invalidateQueries({ queryKey: ["sales-summary"] })
                      ]);
                    } catch (error) {
                      setItemNotice(error instanceof Error ? error.message : "Unable to add sales order item");
                    } finally {
                      setIsAddingItem(false);
                    }
                  }}
                  disabled={!canWriteSales || isAddingItem}
                  className="w-full"
                >
                  {isAddingItem ? "Adding..." : "Add item line"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-text-muted">Unable to load the selected sales order.</p>
          )
        ) : (
          <p className="mt-5 text-sm leading-6 text-text-muted">
            Select a sales order from the table above to inspect item lines and add new pricing entries.
          </p>
        )}
      </Card>
    </section>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card elevated>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-soft">{label}</p>
      <p className={`mt-3 text-3xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );
}

function formatCurrency(value: string, currency = "MYR") {
  const amount = Number(value);

  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatSalesStatus(status: string) {
  switch (status) {
    case "closed_won":
      return "Closed won";
    case "closed_lost":
      return "Closed lost";
    default:
      return "Open";
  }
}

function getSalesStatusTone(status: string) {
  switch (status) {
    case "closed_won":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "closed_lost":
      return "border-coral/20 bg-coral/10 text-coral";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function formatLeadStatus(status: string) {
  switch (status) {
    case "new_lead":
      return "New lead";
    case "closed_won":
      return "Closed won";
    case "closed_lost":
      return "Closed lost";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function formatLeadTemperature(temperature: string) {
  return temperature.charAt(0).toUpperCase() + temperature.slice(1);
}
