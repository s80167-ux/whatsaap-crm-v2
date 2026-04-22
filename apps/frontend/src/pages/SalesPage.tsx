import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { convertLeadToOrder, createLead, createSalesOrder, createSalesOrderItem, updateLead, updateSalesOrder } from "../api/crm";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Toast } from "../components/Toast";
import { useOrganizationUsers } from "../hooks/useAdmin";
import { useContacts } from "../hooks/useContacts";
import { useLeadDetail, useLeadHistory, useLeads } from "../hooks/useLeads";
import { useSalesOrderDetail, useSalesOrderHistory, useSalesOrders, useSalesSummary } from "../hooks/useSales";
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

type TimelineEntityType = "lead" | "sales_order" | "sales_order_item";
type SalesSection = "order-detail" | "lead-detail" | "timeline";

type TimelineEntry = {
  id: string;
  actor_name?: string | null;
  actor_role?: string | null;
  action: string;
  metadata: unknown;
  created_at: string;
  entityType: TimelineEntityType;
  entityId: string | null;
};

export function SalesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = getStoredUser();
  const canManageUsers = Boolean(currentUser?.permissionKeys.includes("org.manage_users"));
  const salesFilters = useMemo(
    () => ({
      status: (searchParams.get("status") as "open" | "closed_won" | "closed_lost" | null) ?? undefined,
      createdFrom: searchParams.get("created_from") ?? undefined,
      createdTo: searchParams.get("created_to") ?? undefined,
      closedFrom: searchParams.get("closed_from") ?? undefined,
      closedTo: searchParams.get("closed_to") ?? undefined,
      orderId: searchParams.get("order_id") ?? undefined,
      leadId: searchParams.get("lead_id") ?? undefined,
      section: (searchParams.get("section") as SalesSection | null) ?? undefined
    }),
    [searchParams]
  );
  const { data: orders = [], isLoading: ordersLoading } = useSalesOrders(salesFilters);
  const { data: summary } = useSalesSummary();
  const { data: leads = [], isLoading: leadsLoading } = useLeads();
  const { data: contacts = [] } = useContacts();
  const { data: organizationUsers = [] } = useOrganizationUsers(currentUser?.organizationId ?? null, canManageUsers);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const { data: selectedOrderDetail, isLoading: detailLoading } = useSalesOrderDetail(selectedOrderId ?? undefined);
  const { data: selectedOrderHistory = [], isLoading: orderHistoryLoading } = useSalesOrderHistory(selectedOrderId ?? undefined);

  const activeLeadId = selectedLeadId ?? selectedOrderDetail?.order.lead_id ?? null;
  const { data: selectedLeadDetail, isLoading: leadDetailLoading } = useLeadDetail(activeLeadId ?? undefined);
  const { data: selectedLeadHistory = [], isLoading: leadHistoryLoading } = useLeadHistory(activeLeadId ?? undefined);

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
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  const [convertAmountByLeadId, setConvertAmountByLeadId] = useState<Record<string, string>>({});
  const [leadSourceById, setLeadSourceById] = useState<Record<string, string>>({});
  const [leadTemperatureById, setLeadTemperatureById] = useState<Record<string, string>>({});
  const [leadStatusById, setLeadStatusById] = useState<Record<string, string>>({});
  const [leadAssignedUserById, setLeadAssignedUserById] = useState<Record<string, string>>({});
  const orderDetailRef = useRef<HTMLElement | null>(null);
  const leadDetailRef = useRef<HTMLElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [shareToastMessage, setShareToastMessage] = useState<string | null>(null);
  const shareToastTimeoutRef = useRef<number | null>(null);

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

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const leadEntries = selectedLeadHistory.map((entry) => ({
      ...entry,
      entityType: "lead" as const,
      entityId: activeLeadId
    }));

    const orderEntries = selectedOrderHistory.map((entry) => ({
      ...entry,
      entityType: entry.action.includes("item") ? ("sales_order_item" as const) : ("sales_order" as const),
      entityId: selectedOrderId
    }));

    return [...leadEntries, ...orderEntries].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  }, [activeLeadId, selectedLeadHistory, selectedOrderHistory, selectedOrderId]);

  useEffect(() => {
    if (!salesFilters.orderId && selectedOrderId) {
      setSelectedOrderId(null);
      return;
    }

    if (salesFilters.orderId && salesFilters.orderId !== selectedOrderId) {
      setSelectedOrderId(salesFilters.orderId);
    }
  }, [salesFilters.orderId, selectedOrderId]);

  useEffect(() => {
    if (!salesFilters.leadId && selectedLeadId) {
      setSelectedLeadId(null);
      return;
    }

    if (salesFilters.leadId && salesFilters.leadId !== selectedLeadId) {
      setSelectedLeadId(salesFilters.leadId);
    }
  }, [salesFilters.leadId, selectedLeadId]);

  function updateSelectionSearch(nextSelection: { orderId?: string | null; leadId?: string | null; section?: SalesSection | null }) {
    const nextParams = new URLSearchParams(searchParams);

    if (nextSelection.orderId === null) {
      nextParams.delete("order_id");
    } else if (nextSelection.orderId !== undefined) {
      nextParams.set("order_id", nextSelection.orderId);
    }

    if (nextSelection.leadId === null) {
      nextParams.delete("lead_id");
    } else if (nextSelection.leadId !== undefined) {
      nextParams.set("lead_id", nextSelection.leadId);
    }

    if (nextSelection.section === null) {
      nextParams.delete("section");
    } else if (nextSelection.section !== undefined) {
      nextParams.set("section", nextSelection.section);
    }

    setSearchParams(nextParams, { replace: true });
  }

  function focusOrder(orderId: string, leadId?: string | null, section: SalesSection = "order-detail") {
    setSelectedOrderId(orderId);
    if (leadId) {
      setSelectedLeadId(leadId);
    }
    updateSelectionSearch({
      orderId,
      leadId: leadId ?? undefined,
      section
    });
  }

  function focusLead(leadId: string, orderId?: string | null, section: SalesSection = "lead-detail") {
    setSelectedLeadId(leadId);
    if (orderId !== undefined) {
      setSelectedOrderId(orderId);
    }
    updateSelectionSearch({
      leadId,
      orderId: orderId ?? undefined,
      section
    });
  }

  function showShareToast(message: string) {
    setShareToastMessage(message);

    if (shareToastTimeoutRef.current) {
      window.clearTimeout(shareToastTimeoutRef.current);
    }

    shareToastTimeoutRef.current = window.setTimeout(() => {
      setShareToastMessage(null);
      shareToastTimeoutRef.current = null;
    }, 2200);
  }

  async function copyShareLink(input: { orderId?: string | null; leadId?: string | null; section: SalesSection }) {
    if (typeof window === "undefined") {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);

    if (input.orderId) {
      nextParams.set("order_id", input.orderId);
    } else {
      nextParams.delete("order_id");
    }

    if (input.leadId) {
      nextParams.set("lead_id", input.leadId);
    } else {
      nextParams.delete("lead_id");
    }

    nextParams.set("section", input.section);

    const shareUrl = `${window.location.origin}${window.location.pathname}?${nextParams.toString()}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      showShareToast("Share link copied.");
    } catch {
      showShareToast("Unable to copy share link.");
    }
  }

  useEffect(() => {
    if (!salesFilters.section) {
      return;
    }

    const target =
      salesFilters.section === "order-detail"
        ? orderDetailRef.current
        : salesFilters.section === "lead-detail"
          ? leadDetailRef.current
          : timelineRef.current;

    if (!target) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [salesFilters.section, selectedOrderId, activeLeadId, selectedOrderHistory.length, selectedLeadHistory.length]);

  useEffect(() => {
    return () => {
      if (shareToastTimeoutRef.current) {
        window.clearTimeout(shareToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setLeadSourceById((current) => {
      const next = { ...current };

      for (const lead of leads) {
        next[lead.id] = current[lead.id] ?? lead.source ?? "";
      }

      return next;
    });

    setLeadTemperatureById((current) => {
      const next = { ...current };

      for (const lead of leads) {
        next[lead.id] = current[lead.id] ?? lead.temperature ?? "";
      }

      return next;
    });

    setLeadStatusById((current) => {
      const next = { ...current };

      for (const lead of leads) {
        next[lead.id] = current[lead.id] ?? lead.status;
      }

      return next;
    });

    setLeadAssignedUserById((current) => {
      const next = { ...current };

      for (const lead of leads) {
        next[lead.id] = current[lead.id] ?? lead.assigned_user_id ?? "";
      }

      return next;
    });
  }, [leads]);

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

      {salesFilters.status || salesFilters.createdFrom || salesFilters.closedFrom ? (
        <Card elevated className="border-primary/20 bg-primary/5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Active Drill-Down</p>
          <p className="mt-3 text-sm leading-6 text-text-muted">
            {buildSalesFilterSummary(salesFilters)}
          </p>
        </Card>
      ) : null}

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
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ordersLoading ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={6}>
                      Loading sales orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={6}>
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
                      onClick={() => focusOrder(order.id, order.lead_id ?? null, "order-detail")}
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
                      <td className="px-5 py-4 font-medium text-text">{formatCurrency(order.total_amount, order.currency)}</td>
                      <td className="px-5 py-4">
                        {order.assigned_user_id === currentUser?.organizationUserId
                          ? "Assigned to you"
                          : order.assigned_user_id ?? "Unassigned"}
                      </td>
                      <td className="px-5 py-4">{new Date(order.updated_at).toLocaleString()}</td>
                      <td className="px-5 py-4">
                        <Button
                          variant="secondary"
                          className="px-3 py-2 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyShareLink({
                              orderId: order.id,
                              leadId: order.lead_id ?? null,
                              section: "order-detail"
                            });
                          }}
                        >
                          Copy link
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
                  <th className="px-5 py-4">Source</th>
                  <th className="px-5 py-4">Temperature</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Assignee</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leadsLoading ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={8}>
                      Loading leads...
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-sm text-text-muted" colSpan={8}>
                      No leads yet. Create the first one from the intake form.
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className={`cursor-pointer border-t border-border/80 text-sm text-text-muted transition hover:bg-background-tint/30 ${
                        activeLeadId === lead.id ? "bg-background-tint/40" : ""
                      }`}
                      onClick={() => focusLead(lead.id, undefined, "lead-detail")}
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-text">{lead.contact_name ?? "Unknown"}</p>
                        <p className="mt-1 text-xs text-text-soft">{lead.primary_phone_normalized ?? "--"}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-text">{formatLeadStatus(lead.status)}</p>
                        <p className="mt-1 text-xs text-text-soft">Updated {new Date(lead.updated_at).toLocaleString()}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Input
                          value={leadSourceById[lead.id] ?? ""}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setLeadSourceById((current) => ({
                              ...current,
                              [lead.id]: event.target.value
                            }))
                          }
                          placeholder="Lead source"
                          disabled={!canWriteSales || savingLeadId === lead.id}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={leadTemperatureById[lead.id] ?? ""}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setLeadTemperatureById((current) => ({
                              ...current,
                              [lead.id]: event.target.value
                            }))
                          }
                          className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                          disabled={!canWriteSales || savingLeadId === lead.id}
                        >
                          <option value="">Unset</option>
                          {LEAD_TEMPERATURES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={leadStatusById[lead.id] ?? lead.status}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setLeadStatusById((current) => ({
                              ...current,
                              [lead.id]: event.target.value
                            }))
                          }
                          className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                          disabled={!canWriteSales || savingLeadId === lead.id}
                        >
                          {LEAD_STATUSES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={leadAssignedUserById[lead.id] ?? ""}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            setLeadAssignedUserById((current) => ({
                              ...current,
                              [lead.id]: event.target.value
                            }))
                          }
                          className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm text-text shadow-[0_12px_30px_rgba(20,32,51,0.06)] outline-none transition focus:border-primary/30"
                          disabled={!canWriteSales || !canManageUsers || savingLeadId === lead.id}
                        >
                          <option value="">Unassigned</option>
                          {organizationUsers.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.full_name ?? user.email ?? user.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={convertAmountByLeadId[lead.id] ?? ""}
                          onClick={(event) => event.stopPropagation()}
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              void copyShareLink({
                                leadId: lead.id,
                                orderId: selectedOrderId,
                                section: "lead-detail"
                              });
                            }}
                          >
                            Copy link
                          </Button>
                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            disabled={!canWriteSales || savingLeadId === lead.id}
                            onClick={async (event) => {
                              event.stopPropagation();
                              setSavingLeadId(lead.id);
                              setLeadNotice(null);

                              try {
                                await updateLead({
                                  leadId: lead.id,
                                  source: (leadSourceById[lead.id] ?? "").trim() || null,
                                  temperature: (leadTemperatureById[lead.id] || null) as "cold" | "warm" | "hot" | null,
                                  status: (leadStatusById[lead.id] ?? lead.status) as
                                    | "new_lead"
                                    | "contacted"
                                    | "interested"
                                    | "processing"
                                    | "closed_won"
                                    | "closed_lost",
                                  assignedUserId: canManageUsers ? leadAssignedUserById[lead.id] || null : undefined
                                });

                                setLeadNotice("Lead details updated.");
                                await Promise.all([
                                  queryClient.invalidateQueries({ queryKey: ["leads"] }),
                                  queryClient.invalidateQueries({ queryKey: ["lead", lead.id] }),
                                  queryClient.invalidateQueries({ queryKey: ["lead-history", lead.id] })
                                ]);
                              } catch (error) {
                                setLeadNotice(error instanceof Error ? error.message : "Unable to update lead");
                              } finally {
                                setSavingLeadId(null);
                              }
                            }}
                          >
                            {savingLeadId === lead.id ? "Saving..." : "Save"}
                          </Button>

                          <Button
                            variant="secondary"
                            className="px-3 py-2 text-xs"
                            disabled={!canWriteSales || convertingLeadId === lead.id}
                            onClick={async (event) => {
                              event.stopPropagation();
                              const conversionAmount = Number(convertAmountByLeadId[lead.id] ?? "");

                              if (!Number.isFinite(conversionAmount) || conversionAmount < 0) {
                                setLeadNotice("Enter a valid conversion amount before creating a sales order from a lead.");
                                return;
                              }

                              setConvertingLeadId(lead.id);
                              setLeadNotice(null);

                              try {
                                await convertLeadToOrder({
                                  leadId: lead.id,
                                  status: "open",
                                  totalAmount: conversionAmount,
                                  currency: "MYR"
                                });

                                setLeadNotice("Lead converted into an open sales order.");
                                setConvertAmountByLeadId((current) => {
                                  const next = { ...current };
                                  delete next[lead.id];
                                  return next;
                                });
                                focusLead(lead.id, undefined, "lead-detail");
                                await Promise.all([
                                  queryClient.invalidateQueries({ queryKey: ["leads"] }),
                                  queryClient.invalidateQueries({ queryKey: ["lead", lead.id] }),
                                  queryClient.invalidateQueries({ queryKey: ["lead-history", lead.id] }),
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
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <section ref={orderDetailRef}>
      <Card elevated>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Order Detail</p>
            <h3 className="mt-2 text-lg font-semibold text-text">
              {selectedOrderDetail?.order.contact_name ?? "Select a sales order"}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedOrderDetail?.order ? (
              <>
                <Button
                  variant="secondary"
                  className="px-3 py-2 text-xs"
                  onClick={() =>
                    copyShareLink({
                      orderId: selectedOrderDetail.order.id,
                      leadId: selectedOrderDetail.order.lead_id ?? activeLeadId ?? null,
                      section: "order-detail"
                    })
                  }
                >
                  Copy order link
                </Button>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getSalesStatusTone(selectedOrderDetail.order.status)}`}>
                  {formatSalesStatus(selectedOrderDetail.order.status)}
                </span>
              </>
            ) : null}
          </div>
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
                              queryClient.invalidateQueries({ queryKey: ["leads"] }),
                              queryClient.invalidateQueries({ queryKey: ["lead", selectedOrderDetail.order.lead_id] }),
                              queryClient.invalidateQueries({ queryKey: ["lead-history", selectedOrderDetail.order.lead_id] })
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
                        queryClient.invalidateQueries({ queryKey: ["sales-order-history", selectedOrderDetail.order.id] }),
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

      <section ref={leadDetailRef}>
      <Card elevated>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-soft">Lead Detail</p>
            <h3 className="mt-2 text-lg font-semibold text-text">
              {selectedLeadDetail?.contact_name ?? "Select a lead or an order with a linked lead"}
            </h3>
          </div>
          {selectedLeadDetail ? (
            <span className="rounded-full border border-border bg-background-tint px-2.5 py-1 text-[11px] font-semibold text-text">
              {formatLeadStatus(selectedLeadDetail.status)}
            </span>
          ) : null}
        </div>

        {activeLeadId ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-[320px,minmax(0,1fr)]">
            <div className="space-y-4 rounded-2xl border border-border bg-background-tint p-4 text-sm leading-6 text-text-muted">
              {leadDetailLoading ? (
                <p>Loading lead detail...</p>
              ) : selectedLeadDetail ? (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Lead Snapshot</p>
                    <div className="mt-3 space-y-2">
                      <p className="text-text">Lead ID: {selectedLeadDetail.id}</p>
                      <p>Contact: {selectedLeadDetail.contact_name ?? "Unknown"}</p>
                      <p>Phone: {selectedLeadDetail.primary_phone_normalized ?? "--"}</p>
                      <p>Source: {selectedLeadDetail.source ?? "No source"}</p>
                      <p>Temperature: {selectedLeadDetail.temperature ? formatLeadTemperature(selectedLeadDetail.temperature) : "Unset"}</p>
                      <p>Status: {formatLeadStatus(selectedLeadDetail.status)}</p>
                      <p>Owner: {selectedLeadDetail.assigned_user_id ?? "Unassigned"}</p>
                      <p>Updated: {new Date(selectedLeadDetail.updated_at).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() => focusLead(selectedLeadDetail.id, selectedOrderId ?? undefined, "lead-detail")}
                    >
                      Focus lead
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() =>
                        copyShareLink({
                          leadId: selectedLeadDetail.id,
                          orderId: selectedOrderId,
                          section: "lead-detail"
                        })
                      }
                    >
                      Copy lead link
                    </Button>
                    {selectedOrderId ? (
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        onClick={() => focusOrder(selectedOrderId, selectedLeadDetail.id, "order-detail")}
                      >
                        Open linked order
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <p>Unable to load the selected lead.</p>
              )}
            </div>

            <div ref={timelineRef} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-soft">Unified Timeline</p>
                  <h4 className="mt-2 text-base font-semibold text-text">Lead and sales activity</h4>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-text-muted">{timelineEntries.length} events</p>
                  {activeLeadId || selectedOrderId ? (
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-xs"
                      onClick={() =>
                        copyShareLink({
                          leadId: activeLeadId,
                          orderId: selectedOrderId,
                          section: "timeline"
                        })
                      }
                    >
                      Copy timeline link
                    </Button>
                  ) : null}
                </div>
              </div>

              {leadHistoryLoading || orderHistoryLoading ? (
                <p className="mt-5 text-sm leading-6 text-text-muted">Loading timeline...</p>
              ) : timelineEntries.length === 0 ? (
                <p className="mt-5 text-sm leading-6 text-text-muted">
                  No timeline entries yet for the selected lead or order.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {timelineEntries.map((entry) => (
                    <div key={`${entry.entityType}-${entry.id}`} className="rounded-2xl border border-border bg-background-tint px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">{formatTimelineAction(entry.action)}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-text-soft">
                            {formatTimelineEntity(entry.entityType)}
                          </p>
                        </div>
                        <p className="text-xs text-text-soft">{new Date(entry.created_at).toLocaleString()}</p>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-text-muted">
                        {formatTimelineDescription(entry.metadata, entry.action)}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-soft">
                        <span>{entry.actor_name ?? "System"}</span>
                        <span>/</span>
                        <span>{entry.actor_role ?? "service"}</span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.entityType === "lead" && activeLeadId ? (
                          <>
                            <Button
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              onClick={() => focusLead(activeLeadId, selectedOrderId ?? undefined, "lead-detail")}
                            >
                              Open lead
                            </Button>
                            <Button
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              onClick={() =>
                                copyShareLink({
                                  leadId: activeLeadId,
                                  orderId: selectedOrderId,
                                  section: "lead-detail"
                                })
                              }
                            >
                              Copy lead link
                            </Button>
                          </>
                        ) : null}

                        {(entry.entityType === "sales_order" || entry.entityType === "sales_order_item") && selectedOrderId ? (
                          <>
                            <Button
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              onClick={() => focusOrder(selectedOrderId, activeLeadId ?? undefined, "order-detail")}
                            >
                              Open order
                            </Button>
                            <Button
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              onClick={() =>
                                copyShareLink({
                                  orderId: selectedOrderId,
                                  leadId: activeLeadId,
                                  section: "order-detail"
                                })
                              }
                            >
                              Copy order link
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-6 text-text-muted">
            Select a lead from the conversion queue, or select an order that already has a linked lead, to inspect its detail and timeline.
          </p>
        )}
      </Card>
      </section>
      <Toast message={shareToastMessage} />
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

function formatTimelineAction(action: string) {
  return action
    .split(".")
    .map((segment) => segment.replace(/_/g, " "))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" / ");
}

function formatTimelineEntity(entityType: TimelineEntityType) {
  switch (entityType) {
    case "sales_order":
      return "Sales Order";
    case "sales_order_item":
      return "Sales Order Item";
    default:
      return "Lead";
  }
}

function formatTimelineDescription(metadata: unknown, action: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return action;
  }

  const record = metadata as Record<string, unknown>;
  const source =
    typeof record.source === "string"
      ? record.source
      : typeof record.previous_source === "string"
        ? record.previous_source
        : null;
  const temperature =
    typeof record.temperature === "string"
      ? record.temperature
      : typeof record.previous_temperature === "string"
        ? record.previous_temperature
        : null;
  const totalAmount =
    typeof record.total_amount === "number" || typeof record.total_amount === "string"
      ? String(record.total_amount)
      : null;
  const status =
    typeof record.status === "string"
      ? record.status
      : typeof record.next_status === "string"
        ? record.next_status
        : null;

  if (source || temperature) {
    return [source ? `Source: ${source}` : null, temperature ? `Temperature: ${formatLeadTemperature(temperature)}` : null]
      .filter(Boolean)
      .join(" / ");
  }

  if (totalAmount || status) {
    return [status ? `Status: ${formatSalesStatus(status)}` : null, totalAmount ? `Amount: ${totalAmount}` : null]
      .filter(Boolean)
      .join(" / ");
  }

  return action;
}

function buildSalesFilterSummary(filters: {
  status?: "open" | "closed_won" | "closed_lost";
  createdFrom?: string;
  createdTo?: string;
  closedFrom?: string;
  closedTo?: string;
}) {
  const parts: string[] = [];

  if (filters.status) {
    parts.push(`Status: ${formatSalesStatus(filters.status)}`);
  }

  if (filters.createdFrom && filters.createdTo) {
    parts.push(`Created between ${formatRange(filters.createdFrom, filters.createdTo)}`);
  }

  if (filters.closedFrom && filters.closedTo) {
    parts.push(`Closed between ${formatRange(filters.closedFrom, filters.closedTo)}`);
  }

  return parts.join(" / ") || "Filtered sales view";
}

function formatRange(start: string, end: string) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const inclusiveEnd = new Date(endDate.getTime() - 1);

  return `${startDate.toLocaleDateString("en-MY")} to ${inclusiveEnd.toLocaleDateString("en-MY")}`;
}
