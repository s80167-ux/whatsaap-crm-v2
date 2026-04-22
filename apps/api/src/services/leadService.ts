import type { PoolClient } from "pg";
import { pool, withTransaction } from "../config/database.js";
import { AppError } from "../lib/errors.js";
import { ContactRepository } from "../repositories/contactRepository.js";
import { LeadRepository } from "../repositories/leadRepository.js";
import { SalesRepository } from "../repositories/salesRepository.js";
import type { AuthUser } from "../types/auth.js";

const VALID_LEAD_STATUSES = new Set(["new_lead", "contacted", "interested", "processing", "closed_won", "closed_lost"]);
const VALID_TEMPERATURES = new Set(["cold", "warm", "hot"]);

export class LeadService {
  constructor(
    private readonly leadRepository = new LeadRepository(),
    private readonly contactRepository = new ContactRepository(),
    private readonly salesRepository = new SalesRepository()
  ) {}

  private getScope(authUser: AuthUser) {
    return {
      assignedOnly: authUser.permissionKeys.includes("sales.read_assigned"),
      organizationUserId: authUser.organizationUserId
    };
  }

  async list(authUser: AuthUser, organizationId: string) {
    const client = await pool.connect();
    try {
      return await this.leadRepository.list(client, {
        organizationId,
        ...this.getScope(authUser)
      });
    } finally {
      client.release();
    }
  }

  async create(
    client: PoolClient,
    input: {
      authUser: AuthUser;
      organizationId: string;
      contactId: string;
      source?: string | null;
      status: string;
      temperature?: string | null;
      assignedUserId?: string | null;
    }
  ) {
    if (!VALID_LEAD_STATUSES.has(input.status)) {
      throw new AppError("Invalid lead status", 400, "invalid_lead_status");
    }

    if (input.temperature && !VALID_TEMPERATURES.has(input.temperature)) {
      throw new AppError("Invalid lead temperature", 400, "invalid_lead_temperature");
    }

    const contact = await this.contactRepository.findById(client, input.organizationId, input.contactId);

    if (!contact) {
      throw new AppError("Contact not found", 404, "contact_not_found");
    }

    const canAssignToOthers =
      input.authUser.role === "super_admin" || input.authUser.permissionKeys.includes("sales.read_all");

    const assignedUserId = canAssignToOthers
      ? input.assignedUserId ?? input.authUser.organizationUserId ?? null
      : input.authUser.organizationUserId ?? null;

    return this.leadRepository.create(client, {
      organizationId: input.organizationId,
      contactId: input.contactId,
      source: input.source ?? null,
      status: input.status,
      temperature: input.temperature ?? null,
      assignedUserId
    });
  }

  async createInNewTransaction(input: {
    authUser: AuthUser;
    organizationId: string;
    contactId: string;
    source?: string | null;
    status: string;
    temperature?: string | null;
    assignedUserId?: string | null;
  }) {
    return withTransaction((client) => this.create(client, input));
  }

  async convertToOrder(
    client: PoolClient,
    input: {
      authUser: AuthUser;
      organizationId: string;
      leadId: string;
      status: "open" | "closed_won" | "closed_lost";
      totalAmount: number;
      currency?: string | null;
    }
  ) {
    const lead = await this.leadRepository.findById(client, {
      organizationId: input.organizationId,
      leadId: input.leadId,
      ...this.getScope(input.authUser)
    });

    if (!lead) {
      throw new AppError("Lead not found", 404, "lead_not_found");
    }

    const order = await this.salesRepository.createOrder(client, {
      organizationId: input.organizationId,
      contactId: lead.contact_id,
      leadId: lead.id,
      assignedUserId: lead.assigned_user_id ?? input.authUser.organizationUserId ?? null,
      status: input.status,
      totalAmount: input.totalAmount,
      currency: input.currency?.trim() || "MYR",
      closedAt: input.status === "open" ? null : new Date().toISOString()
    });

    await this.leadRepository.updateStatus(client, {
      leadId: lead.id,
      status:
        input.status === "open"
          ? "processing"
          : input.status === "closed_won"
            ? "closed_won"
            : "closed_lost"
    });

    return { lead, order };
  }

  async convertToOrderInNewTransaction(input: {
    authUser: AuthUser;
    organizationId: string;
    leadId: string;
    status: "open" | "closed_won" | "closed_lost";
    totalAmount: number;
    currency?: string | null;
  }) {
    return withTransaction((client) => this.convertToOrder(client, input));
  }

  async getDetail(authUser: AuthUser, organizationId: string, leadId: string) {
    const client = await pool.connect();
    try {
      const lead = await this.leadRepository.findById(client, {
        organizationId,
        leadId,
        ...this.getScope(authUser)
      });

      if (!lead) {
        throw new AppError("Lead not found", 404, "lead_not_found");
      }

      return lead;
    } finally {
      client.release();
    }
  }

  async getHistory(authUser: AuthUser, organizationId: string, leadId: string, limit = 50) {
    const client = await pool.connect();
    try {
      const lead = await this.leadRepository.findById(client, {
        organizationId,
        leadId,
        ...this.getScope(authUser)
      });

      if (!lead) {
        throw new AppError("Lead not found", 404, "lead_not_found");
      }

      return this.leadRepository.listHistory(client, { leadId, limit });
    } finally {
      client.release();
    }
  }

  async update(
    client: PoolClient,
    input: {
      authUser: AuthUser;
      organizationId: string;
      leadId: string;
      source?: string | null;
      status?: string;
      temperature?: string | null;
      assignedUserId?: string | null;
    }
  ) {
    if (
      input.source === undefined &&
      input.status === undefined &&
      input.temperature === undefined &&
      input.assignedUserId === undefined
    ) {
      throw new AppError("At least one lead field must be provided", 400, "lead_update_required");
    }

    if (input.status !== undefined && !VALID_LEAD_STATUSES.has(input.status)) {
      throw new AppError("Invalid lead status", 400, "invalid_lead_status");
    }

    if (input.temperature && !VALID_TEMPERATURES.has(input.temperature)) {
      throw new AppError("Invalid lead temperature", 400, "invalid_lead_temperature");
    }

    const lead = await this.leadRepository.findById(client, {
      organizationId: input.organizationId,
      leadId: input.leadId,
      ...this.getScope(input.authUser)
    });

    if (!lead) {
      throw new AppError("Lead not found", 404, "lead_not_found");
    }

    const canAssignToOthers =
      input.authUser.role === "super_admin" || input.authUser.permissionKeys.includes("sales.read_all");

    const assignedUserId =
      input.assignedUserId === undefined
        ? undefined
        : canAssignToOthers
          ? input.assignedUserId
          : input.authUser.organizationUserId ?? null;

    await this.leadRepository.update(client, {
      leadId: input.leadId,
      source: input.source,
      status: input.status,
      temperature: input.temperature,
      assignedUserId
    });

    const updatedLead = await this.leadRepository.findById(client, {
      organizationId: input.organizationId,
      leadId: input.leadId,
      assignedOnly: false,
      organizationUserId: input.authUser.organizationUserId
    });

    if (!updatedLead) {
      throw new AppError("Updated lead not found", 404, "lead_not_found");
    }

    return {
      previousLead: lead,
      lead: updatedLead
    };
  }

  async updateInNewTransaction(input: {
    authUser: AuthUser;
    organizationId: string;
    leadId: string;
    source?: string | null;
    status?: string;
    temperature?: string | null;
    assignedUserId?: string | null;
  }) {
    return withTransaction((client) => this.update(client, input));
  }
}
