import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { LeadRepository } from "../repositories/leadRepository.js";
import { SalesRepository } from "../repositories/salesRepository.js";
import type { AuthUser } from "../types/auth.js";
import { QuickReplyOutcomeService } from "./quickReplyOutcomeService.js";

const VALID_SALES_ORDER_STATUSES = new Set(["open", "closed_won", "closed_lost"]);

export class SalesService {
  constructor(
    private readonly salesRepository = new SalesRepository(),
    private readonly leadRepository = new LeadRepository(),
    private readonly quickReplyOutcomeService = new QuickReplyOutcomeService()
  ) {}

  private getScope(authUser: AuthUser) {
    return {
      assignedOnly: authUser.permissionKeys.includes("sales.read_assigned"),
      organizationUserId: authUser.organizationUserId
    };
  }

  async listOrders(
    authUser: AuthUser,
    organizationId: string | null,
    filters?: {
      status?: string;
      createdFrom?: string;
      createdTo?: string;
      closedFrom?: string;
      closedTo?: string;
    }
  ) {
    const client = await pool.connect();
    try {
      return await this.salesRepository.listOrders(client, {
        organizationId,
        ...this.getScope(authUser),
        status: filters?.status,
        createdFrom: filters?.createdFrom,
        createdTo: filters?.createdTo,
        closedFrom: filters?.closedFrom,
        closedTo: filters?.closedTo
      });
    } finally {
      client.release();
    }
  }

  async getSummary(authUser: AuthUser, organizationId: string | null) {
    const client = await pool.connect();
    try {
      return await this.salesRepository.getSummary(client, {
        organizationId,
        ...this.getScope(authUser)
      });
    } finally {
      client.release();
    }
  }

  async createOrder(
    client: PoolClient,
    input: {
      authUser: AuthUser;
      organizationId: string;
      contactId: string;
      leadId?: string | null;
      assignedUserId?: string | null;
      status: string;
      totalAmount: number;
      currency?: string | null;
    }
  ) {
    if (!VALID_SALES_ORDER_STATUSES.has(input.status)) {
      throw new AppError("Invalid sales order status", 400, "invalid_sales_status");
    }

    const contactExists = await this.salesRepository.contactExists(client, input.organizationId, input.contactId);

    if (!contactExists) {
      throw new AppError("Contact not found", 404, "contact_not_found");
    }

    const canAssignToOthers =
      input.authUser.role === "super_admin" || input.authUser.permissionKeys.includes("sales.read_all");

    const resolvedAssignedUserId = canAssignToOthers
      ? input.assignedUserId ?? input.authUser.organizationUserId ?? null
      : input.authUser.organizationUserId ?? null;

    const closedAt = input.status === "closed_won" || input.status === "closed_lost" ? new Date().toISOString() : null;

    const order = await this.salesRepository.createOrder(client, {
      organizationId: input.organizationId,
      contactId: input.contactId,
      leadId: input.leadId ?? null,
      assignedUserId: resolvedAssignedUserId,
      status: input.status,
      totalAmount: input.totalAmount,
      currency: input.currency?.trim() || "MYR",
      closedAt
    });

    await this.quickReplyOutcomeService.markOrderCreated(client, {
      organizationId: input.organizationId,
      contactId: input.contactId,
      salesOrderId: order.id
    });

    if (input.status === "closed_won" || input.status === "closed_lost") {
      await this.quickReplyOutcomeService.markOrderClosed(client, {
        organizationId: input.organizationId,
        salesOrderId: order.id,
        outcomeStatus: input.status === "closed_won" ? "order_closed_won" : "order_closed_lost"
      });
    }

    return order;
  }

  async createOrderInNewTransaction(input: {
    authUser: AuthUser;
    organizationId: string;
    contactId: string;
    leadId?: string | null;
    assignedUserId?: string | null;
    status: string;
    totalAmount: number;
    currency?: string | null;
  }) {
    return withTransaction((client) => this.createOrder(client, input));
  }

  async getOrderDetail(authUser: AuthUser, organizationId: string | null, orderId: string) {
    const client = await pool.connect();
    try {
      const scope = this.getScope(authUser);
      const order = await this.salesRepository.findOrderById(client, {
        organizationId,
        orderId,
        ...scope
      });

      if (!order) {
        throw new AppError("Sales order not found", 404, "sales_order_not_found");
      }

      const items = await this.salesRepository.listOrderItems(client, orderId);
      return { order, items };
    } finally {
      client.release();
    }
  }

  async getOrderHistory(authUser: AuthUser, organizationId: string | null, orderId: string, limit = 50) {
    const client = await pool.connect();
    try {
      const scope = this.getScope(authUser);
      const order = await this.salesRepository.findOrderById(client, {
        organizationId,
        orderId,
        ...scope
      });

      if (!order) {
        throw new AppError("Sales order not found", 404, "sales_order_not_found");
      }

      return this.salesRepository.listOrderHistory(client, {
        orderId,
        limit
      });
    } finally {
      client.release();
    }
  }

  async addOrderItem(
    client: PoolClient,
    input: {
      authUser: AuthUser;
      organizationId: string;
      orderId: string;
      productType?: string | null;
      packageName?: string | null;
      unitPrice: number;
      quantity: number;
    }
  ) {
    if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
      throw new AppError("Invalid unit price", 400, "invalid_unit_price");
    }

    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new AppError("Quantity must be a positive integer", 400, "invalid_quantity");
    }

    const scope = this.getScope(input.authUser);
    const order = await this.salesRepository.findOrderById(client, {
      organizationId: input.organizationId,
      orderId: input.orderId,
      ...scope
    });

    if (!order) {
      throw new AppError("Sales order not found", 404, "sales_order_not_found");
    }

    const item = await this.salesRepository.addOrderItem(client, {
      salesOrderId: input.orderId,
      productType: input.productType ?? null,
      packageName: input.packageName ?? null,
      unitPrice: input.unitPrice,
      quantity: input.quantity,
      totalPrice: input.unitPrice * input.quantity
    });

    await this.salesRepository.recalculateOrderTotal(client, input.orderId);
    return item;
  }

  async addOrderItemInNewTransaction(input: {
    authUser: AuthUser;
    organizationId: string;
    orderId: string;
    productType?: string | null;
    packageName?: string | null;
    unitPrice: number;
    quantity: number;
  }) {
    return withTransaction((client) => this.addOrderItem(client, input));
  }

  async updateOrder(
    client: PoolClient,
    input: {
      authUser: AuthUser;
      organizationId: string;
      orderId: string;
      assignedUserId?: string | null;
      status?: string;
      totalAmount?: number;
      currency?: string | null;
    }
  ) {
    if (
      input.status === undefined &&
      input.assignedUserId === undefined &&
      input.totalAmount === undefined &&
      input.currency === undefined
    ) {
      throw new AppError("At least one sales order field must be provided", 400, "sales_order_update_required");
    }

    if (input.status !== undefined && !VALID_SALES_ORDER_STATUSES.has(input.status)) {
      throw new AppError("Invalid sales order status", 400, "invalid_sales_status");
    }

    if (input.totalAmount !== undefined && (!Number.isFinite(input.totalAmount) || input.totalAmount < 0)) {
      throw new AppError("Invalid sales order total amount", 400, "invalid_sales_total");
    }

    const scope = this.getScope(input.authUser);
    const order = await this.salesRepository.findOrderById(client, {
      organizationId: input.organizationId,
      orderId: input.orderId,
      ...scope
    });

    if (!order) {
      throw new AppError("Sales order not found", 404, "sales_order_not_found");
    }

    const canAssignToOthers =
      input.authUser.role === "super_admin" || input.authUser.permissionKeys.includes("sales.read_all");

    const assignedUserId =
      input.assignedUserId === undefined
        ? undefined
        : canAssignToOthers
          ? input.assignedUserId
          : input.authUser.organizationUserId ?? null;

    const closedAt =
      input.status === undefined
        ? undefined
        : input.status === "open"
          ? null
          : new Date().toISOString();

    await this.salesRepository.updateOrder(client, {
      orderId: input.orderId,
      assignedUserId,
      status: input.status,
      totalAmount: input.totalAmount,
      currency: input.currency?.trim() || undefined,
      closedAt
    });

    if (order.lead_id && input.status) {
      await this.leadRepository.updateStatus(client, {
        leadId: order.lead_id,
        status:
          input.status === "open"
            ? "processing"
            : input.status === "closed_won"
              ? "closed_won"
              : "closed_lost"
      });
    }

    if (input.status === "closed_won" || input.status === "closed_lost") {
      await this.quickReplyOutcomeService.markOrderClosed(client, {
        organizationId: input.organizationId,
        salesOrderId: input.orderId,
        outcomeStatus: input.status === "closed_won" ? "order_closed_won" : "order_closed_lost"
      });
    }

    const updatedOrder = await this.salesRepository.findOrderById(client, {
      organizationId: input.organizationId,
      orderId: input.orderId,
      assignedOnly: false,
      organizationUserId: input.authUser.organizationUserId
    });

    if (!updatedOrder) {
      throw new AppError("Updated sales order not found", 404, "sales_order_not_found");
    }

    return {
      previousOrder: order,
      order: updatedOrder
    };
  }

  async updateOrderInNewTransaction(input: {
    authUser: AuthUser;
    organizationId: string;
    orderId: string;
    assignedUserId?: string | null;
    status?: string;
    totalAmount?: number;
    currency?: string | null;
  }) {
    return withTransaction((client) => this.updateOrder(client, input));
  }
}
