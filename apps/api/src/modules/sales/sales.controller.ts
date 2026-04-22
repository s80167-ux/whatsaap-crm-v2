import type { Request, Response } from "express";
import { z } from "zod";
import { getRequestAuditContext } from "../../lib/requestAudit.js";
import { AppError } from "../../lib/errors.js";
import { AuditLogService } from "../../services/auditLogService.js";
import { SalesService } from "../../services/salesService.js";

const salesService = new SalesService();
const auditLogService = new AuditLogService();

const organizationQuerySchema = z.object({
  organization_id: z.string().uuid().optional(),
  status: z.enum(["open", "closed_won", "closed_lost"]).optional(),
  created_from: z.string().datetime({ offset: true }).optional(),
  created_to: z.string().datetime({ offset: true }).optional(),
  closed_from: z.string().datetime({ offset: true }).optional(),
  closed_to: z.string().datetime({ offset: true }).optional()
});

const salesHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

const createSalesOrderSchema = z.object({
  contactId: z.string().uuid(),
  leadId: z.string().uuid().optional().nullable(),
  assignedUserId: z.string().uuid().optional().nullable(),
  status: z.enum(["open", "closed_won", "closed_lost"]).default("open"),
  totalAmount: z.coerce.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).optional().nullable()
});

const orderParamsSchema = z.object({
  orderId: z.string().uuid()
});

const createSalesOrderItemSchema = z.object({
  productType: z.string().trim().max(120).optional().nullable(),
  packageName: z.string().trim().max(160).optional().nullable(),
  unitPrice: z.coerce.number().nonnegative(),
  quantity: z.coerce.number().int().positive()
});

const updateSalesOrderSchema = z.object({
  assignedUserId: z.string().uuid().optional().nullable(),
  status: z.enum(["open", "closed_won", "closed_lost"]).optional(),
  totalAmount: z.coerce.number().nonnegative().optional(),
  currency: z.string().trim().min(3).max(8).optional().nullable()
}).refine(
  (input) =>
    input.assignedUserId !== undefined ||
    input.status !== undefined ||
    input.totalAmount !== undefined ||
    input.currency !== undefined,
  { message: "At least one field must be provided" }
);

function requireAuth(request: Request) {
  if (!request.auth) {
    throw new AppError("Authentication required", 401, "auth_required");
  }

  return request.auth;
}

function requireOrganizationId(request: Request) {
  const { organization_id } = organizationQuerySchema.parse(request.query);
  const organizationId = request.auth?.organizationId ?? organization_id ?? "";

  if (!organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  return organizationId;
}

export async function getSalesOrders(request: Request, response: Response) {
  const auth = requireAuth(request);
  const { status, created_from, created_to, closed_from, closed_to } = organizationQuerySchema.parse(request.query);
  const organizationId = requireOrganizationId(request);
  const orders = await salesService.listOrders(auth, organizationId, {
    status,
    createdFrom: created_from,
    createdTo: created_to,
    closedFrom: closed_from,
    closedTo: closed_to
  });
  return response.json({ data: orders });
}

export async function getSalesSummary(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const summary = await salesService.getSummary(auth, organizationId);
  return response.json({ data: summary });
}

export async function createSalesOrder(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const input = createSalesOrderSchema.parse(request.body);
  const order = await salesService.createOrderInNewTransaction({
    authUser: auth,
    organizationId: auth.organizationId,
    contactId: input.contactId,
    leadId: input.leadId ?? null,
    assignedUserId: input.assignedUserId ?? null,
    status: input.status,
    totalAmount: input.totalAmount,
    currency: input.currency ?? "MYR"
  });

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "sales.order_created",
    entityType: "sales_order",
    entityId: order.id,
    metadata: {
      contact_id: input.contactId,
      assigned_user_id: order.assigned_user_id,
      status: order.status,
      total_amount: order.total_amount,
      currency: order.currency
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: order });
}

export async function getSalesOrderDetail(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const { orderId } = orderParamsSchema.parse(request.params);
  const detail = await salesService.getOrderDetail(auth, organizationId, orderId);
  return response.json({ data: detail });
}

export async function getSalesOrderHistory(request: Request, response: Response) {
  const auth = requireAuth(request);
  const organizationId = requireOrganizationId(request);
  const { orderId } = orderParamsSchema.parse(request.params);
  const { limit = 50 } = salesHistoryQuerySchema.parse(request.query);
  const history = await salesService.getOrderHistory(auth, organizationId, orderId, limit);
  return response.json({ data: history });
}

export async function createSalesOrderItem(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { orderId } = orderParamsSchema.parse(request.params);
  const input = createSalesOrderItemSchema.parse(request.body);

  const item = await salesService.addOrderItemInNewTransaction({
    authUser: auth,
    organizationId: auth.organizationId,
    orderId,
    productType: input.productType ?? null,
    packageName: input.packageName ?? null,
    unitPrice: input.unitPrice,
    quantity: input.quantity
  });

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "sales.order_item_created",
    entityType: "sales_order_item",
    entityId: item.id,
    metadata: {
      sales_order_id: orderId,
      product_type: item.product_type,
      package_name: item.package_name,
      quantity: item.quantity,
      total_price: item.total_price
    },
    request: getRequestAuditContext(request)
  });

  return response.status(201).json({ data: item });
}

export async function updateSalesOrder(request: Request, response: Response) {
  const auth = requireAuth(request);

  if (!auth.organizationId) {
    throw new AppError("organization_id is required", 400, "organization_required");
  }

  const { orderId } = orderParamsSchema.parse(request.params);
  const input = updateSalesOrderSchema.parse(request.body);

  const result = await salesService.updateOrderInNewTransaction({
    authUser: auth,
    organizationId: auth.organizationId,
    orderId,
    assignedUserId: input.assignedUserId,
    status: input.status,
    totalAmount: input.totalAmount,
    currency: input.currency
  });

  const order = result.order;
  const previousOrder = result.previousOrder;

  await auditLogService.record(auth, {
    organizationId: auth.organizationId,
    action: "sales.order_updated",
    entityType: "sales_order",
    entityId: order.id,
    metadata: {
      previous_status: previousOrder.status,
      next_status: order.status,
      previous_assigned_user_id: previousOrder.assigned_user_id,
      assigned_user_id: order.assigned_user_id,
      previous_total_amount: previousOrder.total_amount,
      status: order.status,
      total_amount: order.total_amount,
      currency: order.currency,
      requested_changes: {
        assigned_user_id: input.assignedUserId,
        status: input.status,
        total_amount: input.totalAmount,
        currency: input.currency
      }
    },
    request: getRequestAuditContext(request)
  });

  return response.json({ data: order });
}
